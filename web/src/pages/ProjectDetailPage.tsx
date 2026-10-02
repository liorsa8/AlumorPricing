import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Business, Customer, GlassType, Opening, OpeningType, ProfileSystem, ProjectDetail } from '../api/types';
import { formatCurrency, STATUS_LABELS } from '../lib/format';
import { shareQuoteImage } from '../lib/shareQuote';
import { useCollapsibleForm } from '../lib/useCollapsibleForm';
import PrintableQuote from '../components/PrintableQuote';

// Kept in one place: the quote's line item is a window/door today, and this title is the thing
// to rename if the product ever covers other kinds of items.
const ADD_ITEM_LABEL = 'הוספת פריט להצעה';
const EDIT_ITEM_LABEL = 'עריכת פתח';

const emptyOpeningForm = {
  opening_type_id: '',
  profile_system_id: '',
  glass_type_id: '',
  label: '',
  width_mm: '',
  height_mm: '',
  quantity: '1',
  // '' means "use the quote's own labor%/discount%" — see buildOpeningPayload.
  labor_pct_override: '',
  discount_pct_override: '',
};

function headerFromProject(p: ProjectDetail) {
  return { customer_id: p.customer_id ?? '', title: p.title, notes: p.notes ?? '', discount_pct: String(p.discount_pct) };
}

export default function ProjectDetailPage() {
  const { businessId, id: projectId } = useParams<{ businessId: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/businesses/${businessId}`;

  const { data: project } = useQuery({
    queryKey: ['project', businessId, projectId],
    queryFn: () => api.get<ProjectDetail>(`${base}/projects/${projectId}`),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', businessId],
    queryFn: () => api.get<Customer[]>(`${base}/customers`),
  });
  const isDraft = project?.status === 'draft';
  const { data: openingTypes = [] } = useQuery({
    queryKey: ['opening-types', businessId],
    queryFn: () => api.get<OpeningType[]>(`${base}/opening-types`),
    enabled: isDraft,
  });
  const { data: profileSystems = [] } = useQuery({
    queryKey: ['profile-systems', businessId],
    queryFn: () => api.get<ProfileSystem[]>(`${base}/profile-systems`),
    enabled: isDraft,
  });
  const { data: glassTypes = [] } = useQuery({
    queryKey: ['glass-types', businessId],
    queryFn: () => api.get<GlassType[]>(`${base}/glass-types`),
    enabled: isDraft,
  });
  const { data: business } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => api.get<Business>(base),
  });
  const invalidateProject = () => queryClient.invalidateQueries({ queryKey: ['project', businessId, projectId] });
  const shareNodeRef = useRef<HTMLDivElement>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  // One "שתף" button, not one per app — hands the OS share sheet a real image of the quote,
  // and the person picks WhatsApp/Gmail/anything else from there themselves (see
  // shareQuoteImage for why a web page can't target one specific app with a file directly).
  async function handleShare() {
    if (!shareNodeRef.current || !project) return;
    setShareNotice(null);
    try {
      setShareNotice(await shareQuoteImage(shareNodeRef.current, project));
    } catch {
      setShareNotice('שיתוף ההצעה נכשל, נסו שוב');
    }
  }

  const [headerForm, setHeaderForm] = useState({ customer_id: '', title: '', notes: '', discount_pct: '0' });
  useEffect(() => {
    if (project) setHeaderForm(headerFromProject(project));
  }, [project]);
  const details = useCollapsibleForm(() => {
    if (project) setHeaderForm(headerFromProject(project));
  });

  const saveHeaderMutation = useMutation({
    mutationFn: () =>
      api.put(`${base}/projects/${projectId}`, {
        customer_id: headerForm.customer_id || null,
        title: headerForm.title,
        notes: headerForm.notes,
        discount_pct: Number(headerForm.discount_pct) || 0,
      }),
    onSuccess: () => {
      invalidateProject();
      details.closeForm();
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: (status: string) => api.put(`${base}/projects/${projectId}`, { status }),
    onSuccess: invalidateProject,
  });

  const recalculateMutation = useMutation({
    mutationFn: () => api.post(`${base}/projects/${projectId}/recalculate`, {}),
    onSuccess: invalidateProject,
  });

  const [openingForm, setOpeningForm] = useState(emptyOpeningForm);
  const [editingOpeningId, setEditingOpeningId] = useState<number | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const item = useCollapsibleForm(() => {
    setEditingOpeningId(null);
    setOpeningForm(emptyOpeningForm);
    setOpeningError(null);
  });

  function buildOpeningPayload() {
    return {
      opening_type_id: openingForm.opening_type_id,
      profile_system_id: openingForm.profile_system_id,
      glass_type_id: openingForm.glass_type_id,
      label: openingForm.label,
      width_mm: Number(openingForm.width_mm),
      height_mm: Number(openingForm.height_mm),
      quantity: Number(openingForm.quantity) || 1,
      labor_pct_override: openingForm.labor_pct_override === '' ? null : Number(openingForm.labor_pct_override),
      discount_pct_override: openingForm.discount_pct_override === '' ? null : Number(openingForm.discount_pct_override),
    };
  }

  const addOpeningMutation = useMutation({
    mutationFn: () => api.post(`${base}/projects/${projectId}/openings`, buildOpeningPayload()),
    onSuccess: () => {
      item.closeForm();
      invalidateProject();
    },
    onError: (e: Error) => setOpeningError(e.message),
  });

  const updateOpeningMutation = useMutation({
    mutationFn: (openingId: number) =>
      api.put(`${base}/projects/${projectId}/openings/${openingId}`, buildOpeningPayload()),
    onSuccess: () => {
      item.closeForm();
      invalidateProject();
    },
    onError: (e: Error) => setOpeningError(e.message),
  });

  const deleteOpeningMutation = useMutation({
    mutationFn: (openingId: number) => api.delete(`${base}/projects/${projectId}/openings/${openingId}`),
    onSuccess: invalidateProject,
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.delete(`${base}/projects/${projectId}`),
    onSuccess: () => navigate(`/b/${businessId}`),
  });

  function handlePrint() {
    window.open(`#/b/${businessId}/projects/${projectId}/print?autoprint=1`, '_blank');
  }

  function startEditOpening(o: Opening) {
    setEditingOpeningId(o.id);
    setOpeningForm({
      opening_type_id: String(o.opening_type_id),
      profile_system_id: String(o.profile_system_id),
      glass_type_id: String(o.glass_type_id),
      label: o.label,
      width_mm: String(o.width_mm),
      height_mm: String(o.height_mm),
      quantity: String(o.quantity),
      labor_pct_override: o.labor_pct_override === null ? '' : String(o.labor_pct_override),
      discount_pct_override: o.discount_pct_override === null ? '' : String(o.discount_pct_override),
    });
    item.openForm();
  }

  // Some opening types have no glass component at all (a net, a shutter, an aluminum box) — for
  // those, the glass field is hidden and never required. Defaults to requiring it (true) before
  // any type is picked yet, matching the common case.
  const selectedOpeningType = openingTypes.find((t) => t.id === openingForm.opening_type_id);
  const needsGlass = selectedOpeningType ? selectedOpeningType.has_glass : true;

  function submitOpening(e: React.FormEvent) {
    e.preventDefault();
    setOpeningError(null);
    if (
      !openingForm.opening_type_id ||
      !openingForm.profile_system_id ||
      (needsGlass && !openingForm.glass_type_id) ||
      !openingForm.width_mm ||
      !openingForm.height_mm
    ) {
      setOpeningError(
        needsGlass ? 'יש למלא סוג פתח, מערכת פרופיל, סוג זכוכית, רוחב וגובה' : 'יש למלא סוג פתח, מערכת פרופיל, רוחב וגובה'
      );
      return;
    }
    if (editingOpeningId) updateOpeningMutation.mutate(editingOpeningId);
    else addOpeningMutation.mutate();
  }

  if (!project) return <div>טוען...</div>;

  return (
    <div>
      {/* Off-screen (not display:none — html2canvas needs it actually laid out) copy of the
          quote, captured into an image when sharing it. Always rendered at a fixed 800px —
          "share-capture-node" tells print.css's mobile media query (which keys off the real
          device viewport, not this element's own width) to leave it alone, see print.css. */}
      <div
        className="share-capture-node"
        style={{ position: 'fixed', top: 0, insetInlineStart: '-9999px', width: 800 }}
        aria-hidden="true"
      >
        <PrintableQuote ref={shareNodeRef} project={project} settings={business} />
      </div>

      <div className="page-header">
        <h2>
          הצעת מחיר #{project.quote_number}{' '}
          <span className={`badge status-${project.status}`}>{STATUS_LABELS[project.status]}</span>
        </h2>
        <div>
          <Link className="btn" to={`/b/${businessId}/projects/${project.id}/print`}>
            תצוגה מקדימה
          </Link>{' '}
          <button className="btn" onClick={handleShare}>
            שתף
          </button>{' '}
          <button className="btn" onClick={handlePrint}>
            הדפס / שמור כ-PDF
          </button>{' '}
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('למחוק את ההצעה?')) deleteProjectMutation.mutate();
            }}
          >
            מחיקת הצעה
          </button>
        </div>
      </div>
      {shareNotice && (
        <div className="text-muted" style={{ fontSize: 13, marginTop: -12, marginBottom: 12 }}>
          {shareNotice}
        </div>
      )}

      {/* Quote details: a short summary, with the edit fields behind a button (same list-first
          pattern as the catalog/customers pages) so the quote's lines stay near the top. */}
      <div className="card">
        <div>
          <span className="text-muted">לקוח: </span>
          <strong>{project.customer_name || 'לא נבחר לקוח'}</strong>
        </div>
        {project.title && (
          <div>
            <span className="text-muted">כותרת: </span>
            {project.title}
          </div>
        )}
        <div className="field" style={{ maxWidth: 240, marginTop: 12 }}>
          <label>סטטוס</label>
          <select
            value={project.status}
            onChange={(e) => {
              const newStatus = e.target.value;
              if (project.status === 'draft' && newStatus !== 'draft') {
                const ok = confirm('שינוי סטטוס מ"טיוטה" יקפיא את המחירים ויחסום ערכית פתחים. להמשיך?');
                if (!ok) return;
              }
              changeStatusMutation.mutate(newStatus);
            }}
          >
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {!details.formOpen && (
          <button className="btn" style={{ marginTop: 12 }} onClick={details.openForm}>
            {project.customer_id ? 'עריכת פרטי הצעה' : 'הוסף לקוח / פרטי הצעה'}
          </button>
        )}
        <div ref={details.formRef} hidden={!details.formOpen} style={{ marginTop: 12 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveHeaderMutation.mutate();
            }}
          >
            <div className="form-grid">
              <div className="field">
                <label>לקוח</label>
                <select
                  value={headerForm.customer_id}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      navigate(`/b/${businessId}/customers`);
                      return;
                    }
                    setHeaderForm({ ...headerForm, customer_id: e.target.value });
                  }}
                >
                  <option value="">בחר לקוח...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ הוספת לקוח חדש</option>
                </select>
              </div>
              <div className="field">
                <label>כותרת / תיאור העבודה</label>
                <input value={headerForm.title} onChange={(e) => setHeaderForm({ ...headerForm, title: e.target.value })} />
              </div>
              <div className="field">
                <label>הנחה (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={headerForm.discount_pct}
                  onChange={(e) => setHeaderForm({ ...headerForm, discount_pct: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>הערות</label>
              <textarea
                value={headerForm.notes}
                onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
                rows={2}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              שמור
            </button>
            <button type="button" className="btn" style={{ marginInlineStart: 8 }} onClick={details.closeForm}>
              ביטול
            </button>
          </form>
        </div>
      </div>

      {isDraft && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {!item.formOpen && (
            <button className="btn btn-primary" onClick={item.openForm}>
              {ADD_ITEM_LABEL}
            </button>
          )}
          <button
            className="btn"
            onClick={() => recalculateMutation.mutate()}
            title="מחשב מחדש את כל הפתחים לפי המחירים העדכניים בקטלוג"
          >
            חשב מחדש לפי קטלוג נוכחי
          </button>
        </div>
      )}

      {isDraft && (
        <div className="card" ref={item.formRef} hidden={!item.formOpen}>
          <h3 style={{ marginTop: 0 }}>{editingOpeningId ? EDIT_ITEM_LABEL : ADD_ITEM_LABEL}</h3>
          <form onSubmit={submitOpening}>
            <div className="form-grid">
              <div className="field">
                <label>סוג פתח</label>
                <select
                  value={openingForm.opening_type_id}
                  onChange={(e) => {
                    const nextType = openingTypes.find((t) => t.id === e.target.value);
                    setOpeningForm({
                      ...openingForm,
                      opening_type_id: e.target.value,
                      // Switching to a no-glass type (a net, a shutter) drops whatever glass was
                      // picked — it's hidden and shouldn't linger unsent in the form's state.
                      glass_type_id: nextType && !nextType.has_glass ? '' : openingForm.glass_type_id,
                    });
                  }}
                >
                  <option value="">בחר...</option>
                  {openingTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_he}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>מערכת פרופיל</label>
                <select
                  value={openingForm.profile_system_id}
                  onChange={(e) => setOpeningForm({ ...openingForm, profile_system_id: e.target.value })}
                >
                  <option value="">בחר...</option>
                  {profileSystems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_he}
                    </option>
                  ))}
                </select>
              </div>
              {needsGlass && (
                <div className="field">
                  <label>סוג זכוכית</label>
                  <select
                    value={openingForm.glass_type_id}
                    onChange={(e) => setOpeningForm({ ...openingForm, glass_type_id: e.target.value })}
                  >
                    <option value="">בחר...</option>
                    {glassTypes.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name_he}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>תיאור / מיקום (אופציונלי)</label>
                <input
                  value={openingForm.label}
                  onChange={(e) => setOpeningForm({ ...openingForm, label: e.target.value })}
                  placeholder='למשל: "סלון"'
                />
              </div>
              <div className="field">
                <label>רוחב (מ"מ)</label>
                <input
                  type="number"
                  value={openingForm.width_mm}
                  onChange={(e) => setOpeningForm({ ...openingForm, width_mm: e.target.value })}
                />
              </div>
              <div className="field">
                <label>גובה (מ"מ)</label>
                <input
                  type="number"
                  value={openingForm.height_mm}
                  onChange={(e) => setOpeningForm({ ...openingForm, height_mm: e.target.value })}
                />
              </div>
              <div className="field">
                <label>כמות</label>
                <input
                  type="number"
                  min="1"
                  value={openingForm.quantity}
                  onChange={(e) => setOpeningForm({ ...openingForm, quantity: e.target.value })}
                />
              </div>
              <div className="field">
                <label>עבודה לפריט זה (%) — ריק = כמו בהצעה ({project.labor_pct_snapshot}%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingForm.labor_pct_override}
                  onChange={(e) => setOpeningForm({ ...openingForm, labor_pct_override: e.target.value })}
                  placeholder="ברירת מחדל"
                />
              </div>
              <div className="field">
                <label>הנחה לפריט זה (%) — ריק = כמו בהצעה ({project.discount_pct}%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={openingForm.discount_pct_override}
                  onChange={(e) => setOpeningForm({ ...openingForm, discount_pct_override: e.target.value })}
                  placeholder="ברירת מחדל"
                />
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 13 }}>
              משאירים ריק כדי שהפריט ישתמש באחוזי העבודה וההנחה הרגילים של ההצעה. ממלאים ערך רק
              כשרוצים לחרוג ממנו לפריט הזה בלבד — למשל לתת הנחה על פריט ספציפי, או להוריד את
              אחוז העבודה בפריט שדרש פחות עבודה בפועל.
            </p>
            {openingError && <div className="error-text">{openingError}</div>}
            <button type="submit" className="btn btn-primary">
              שמור
            </button>
            <button type="button" className="btn" style={{ marginInlineStart: 8 }} onClick={item.closeForm}>
              ביטול
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {project.openings.length === 0 ? (
          <div className="empty-state">אין עדיין פתחים בהצעה זו</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>סוג</th>
                <th>מיקום</th>
                <th>סדרה</th>
                <th>זכוכית</th>
                <th>גובה (מ"מ)</th>
                <th>רוחב (מ"מ)</th>
                <th>כמות</th>
                <th>מחיר ליח'</th>
                <th>סה"כ לשורה</th>
                {isDraft && <th></th>}
              </tr>
            </thead>
            <tbody>
              {project.openings.map((o, idx) => (
                <tr key={o.id}>
                  <td className="numeric">{idx + 1}</td>
                  <td>
                    {o.opening_type_name_snapshot}
                    {(o.labor_pct_override !== null || o.discount_pct_override !== null) && (
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {o.labor_pct_override !== null && `עבודה ${o.labor_pct_override}%`}
                        {o.labor_pct_override !== null && o.discount_pct_override !== null && ' · '}
                        {o.discount_pct_override !== null && `הנחה ${o.discount_pct_override}%`}
                      </div>
                    )}
                  </td>
                  <td>{o.label || '—'}</td>
                  <td>{o.profile_system_series_code_snapshot || o.profile_system_name_snapshot}</td>
                  <td>{o.glass_type_name_snapshot ?? '—'}</td>
                  <td className="numeric">{o.height_mm}</td>
                  <td className="numeric">{o.width_mm}</td>
                  <td className="numeric">{o.quantity}</td>
                  <td className="numeric">{formatCurrency(o.unit_subtotal)}</td>
                  <td className="numeric">{formatCurrency(o.line_subtotal)}</td>
                  {isDraft && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => startEditOpening(o)}>
                        עריכה
                      </button>{' '}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm('להסיר את הפתח מההצעה?')) deleteOpeningMutation.mutate(o.id);
                        }}
                      >
                        הסרה
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="totals-panel">
          <div className="row">
            <span>סכום חומרים ואביזרים</span>
            <span className="numeric">{formatCurrency(project.material_subtotal)}</span>
          </div>
          <div className="row">
            <span>עבודה ({project.labor_pct_snapshot}%)</span>
            <span className="numeric">{formatCurrency(project.labor_amount)}</span>
          </div>
          <div className="row">
            <span>התקנה ({project.installation_pct_snapshot}%)</span>
            <span className="numeric">{formatCurrency(project.installation_amount)}</span>
          </div>
          {project.discount_pct > 0 && (
            <div className="row">
              <span>הנחה ({project.discount_pct}%)</span>
              <span className="numeric">-{formatCurrency(project.discount_amount)}</span>
            </div>
          )}
          <div className="row">
            <span>לפני מע"מ</span>
            <span className="numeric">{formatCurrency(project.pre_vat_total)}</span>
          </div>
          <div className="row">
            <span>מע"מ ({project.vat_pct_snapshot}%)</span>
            <span className="numeric">{formatCurrency(project.vat_amount)}</span>
          </div>
          <div className="row grand-total">
            <span>סה"כ לתשלום</span>
            <span className="numeric">{formatCurrency(project.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
