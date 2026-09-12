import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Customer, GlassType, Opening, OpeningType, ProfileSystem, ProjectDetail } from '../api/types';
import { formatCurrency, STATUS_LABELS } from '../lib/format';
import { openGmailShare, openWhatsAppShare } from '../lib/shareQuote';

const emptyOpeningForm = {
  opening_type_id: '',
  profile_system_id: '',
  glass_type_id: '',
  label: '',
  width_mm: '',
  height_mm: '',
  quantity: '1',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${projectId}`),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
  });
  const isDraft = project?.status === 'draft';
  const { data: openingTypes = [] } = useQuery({
    queryKey: ['opening-types'],
    queryFn: () => api.get<OpeningType[]>('/api/opening-types'),
    enabled: isDraft,
  });
  const { data: profileSystems = [] } = useQuery({
    queryKey: ['profile-systems'],
    queryFn: () => api.get<ProfileSystem[]>('/api/profile-systems'),
    enabled: isDraft,
  });
  const { data: glassTypes = [] } = useQuery({
    queryKey: ['glass-types'],
    queryFn: () => api.get<GlassType[]>('/api/glass-types'),
    enabled: isDraft,
  });
  const invalidateProject = () => queryClient.invalidateQueries({ queryKey: ['project', projectId] });

  const [headerForm, setHeaderForm] = useState({ customer_id: '', title: '', notes: '', discount_pct: '0' });
  useEffect(() => {
    if (project) {
      setHeaderForm({
        customer_id: project.customer_id ? String(project.customer_id) : '',
        title: project.title,
        notes: project.notes ?? '',
        discount_pct: String(project.discount_pct),
      });
    }
  }, [project]);

  const saveHeaderMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/projects/${projectId}`, {
        customer_id: headerForm.customer_id ? Number(headerForm.customer_id) : null,
        title: headerForm.title,
        notes: headerForm.notes,
        discount_pct: Number(headerForm.discount_pct) || 0,
      }),
    onSuccess: invalidateProject,
  });

  const changeStatusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/api/projects/${projectId}`, { status }),
    onSuccess: invalidateProject,
  });

  const recalculateMutation = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/recalculate`, {}),
    onSuccess: invalidateProject,
  });

  const [openingForm, setOpeningForm] = useState(emptyOpeningForm);
  const [editingOpeningId, setEditingOpeningId] = useState<number | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);

  function buildOpeningPayload() {
    return {
      opening_type_id: Number(openingForm.opening_type_id),
      profile_system_id: Number(openingForm.profile_system_id),
      glass_type_id: Number(openingForm.glass_type_id),
      label: openingForm.label,
      width_mm: Number(openingForm.width_mm),
      height_mm: Number(openingForm.height_mm),
      quantity: Number(openingForm.quantity) || 1,
    };
  }

  const addOpeningMutation = useMutation({
    mutationFn: () => api.post(`/api/projects/${projectId}/openings`, buildOpeningPayload()),
    onSuccess: () => {
      setOpeningForm(emptyOpeningForm);
      invalidateProject();
    },
    onError: (e: Error) => setOpeningError(e.message),
  });

  const updateOpeningMutation = useMutation({
    mutationFn: (openingId: number) =>
      api.put(`/api/projects/${projectId}/openings/${openingId}`, buildOpeningPayload()),
    onSuccess: () => {
      setOpeningForm(emptyOpeningForm);
      setEditingOpeningId(null);
      invalidateProject();
    },
    onError: (e: Error) => setOpeningError(e.message),
  });

  const deleteOpeningMutation = useMutation({
    mutationFn: (openingId: number) => api.delete(`/api/projects/${projectId}/openings/${openingId}`),
    onSuccess: invalidateProject,
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.delete(`/api/projects/${projectId}`),
    onSuccess: () => navigate('/'),
  });

  function handlePrint() {
    window.open(`/projects/${projectId}/print?autoprint=1`, '_blank');
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
    });
  }

  function submitOpening(e: React.FormEvent) {
    e.preventDefault();
    setOpeningError(null);
    if (
      !openingForm.opening_type_id ||
      !openingForm.profile_system_id ||
      !openingForm.glass_type_id ||
      !openingForm.width_mm ||
      !openingForm.height_mm
    ) {
      setOpeningError('יש למלא סוג פתח, מערכת פרופיל, סוג זכוכית, רוחב וגובה');
      return;
    }
    if (editingOpeningId) updateOpeningMutation.mutate(editingOpeningId);
    else addOpeningMutation.mutate();
  }

  if (!project) return <div>טוען...</div>;

  return (
    <div>
      <div className="page-header">
        <h2>
          הצעת מחיר #{project.quote_number}{' '}
          <span className={`badge status-${project.status}`}>{STATUS_LABELS[project.status]}</span>
        </h2>
        <div>
          <Link className="btn" to={`/projects/${project.id}/print`} target="_blank">
            תצוגה מקדימה
          </Link>{' '}
          <button className="btn" onClick={() => openWhatsAppShare(project)}>
            וואטסאפ
          </button>{' '}
          <button className="btn" onClick={() => openGmailShare(project)}>
            Gmail
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

      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label>לקוח</label>
            <select
              value={headerForm.customer_id}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  navigate('/customers');
                  return;
                }
                setHeaderForm({ ...headerForm, customer_id: e.target.value });
              }}
              onBlur={() => saveHeaderMutation.mutate()}
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
            <input
              value={headerForm.title}
              onChange={(e) => setHeaderForm({ ...headerForm, title: e.target.value })}
              onBlur={() => saveHeaderMutation.mutate()}
            />
          </div>
          <div className="field">
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
          <div className="field">
            <label>הנחה (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={headerForm.discount_pct}
              onChange={(e) => setHeaderForm({ ...headerForm, discount_pct: e.target.value })}
              onBlur={() => saveHeaderMutation.mutate()}
            />
          </div>
        </div>
        <div className="field">
          <label>הערות</label>
          <textarea
            value={headerForm.notes}
            onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
            onBlur={() => saveHeaderMutation.mutate()}
            rows={2}
          />
        </div>
      </div>

      {isDraft && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingOpeningId ? 'עריכת פתח' : 'הוספת חלון / דלת'}</h3>
          <form onSubmit={submitOpening}>
            <div className="form-grid">
              <div className="field">
                <label>סוג פתח</label>
                <select
                  value={openingForm.opening_type_id}
                  onChange={(e) => setOpeningForm({ ...openingForm, opening_type_id: e.target.value })}
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
            </div>
            {openingError && <div className="error-text">{openingError}</div>}
            <button type="submit" className="btn btn-primary">
              {editingOpeningId ? 'עדכן פתח' : 'הוסף להצעה'}
            </button>
            {editingOpeningId && (
              <button
                type="button"
                className="btn"
                style={{ marginInlineStart: 8 }}
                onClick={() => {
                  setEditingOpeningId(null);
                  setOpeningForm(emptyOpeningForm);
                }}
              >
                ביטול
              </button>
            )}
            <button
              type="button"
              className="btn"
              style={{ marginInlineStart: 8 }}
              onClick={() => recalculateMutation.mutate()}
              title='מחשב מחדש את כל הפתחים לפי המחירים העדכניים בקטלוג'
            >
              חשב מחדש לפי קטלוג נוכחי
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
                  <td>{o.opening_type_name_snapshot}</td>
                  <td>{o.label || '—'}</td>
                  <td>{o.profile_system_series_code_snapshot || o.profile_system_name_snapshot}</td>
                  <td>{o.glass_type_name_snapshot}</td>
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
