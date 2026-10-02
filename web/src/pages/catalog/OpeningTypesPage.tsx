import { Fragment, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useCatalogAdminMode } from '../../lib/useCatalogAdminMode';
import { useCollapsibleForm } from '../../lib/useCollapsibleForm';
import { Accessory, OpeningType } from '../../api/types';

const emptyForm = { name_he: '', code: '', price_per_sqm: '', has_glass: true, sort_order: '0', notes: '' };

// Two representative sizes, shown side by side in the live example table below, so the ₪/מ"ר
// being typed translates into a concrete price before it's saved.
const EXAMPLE_SIZES_M = [
  { label: '1.0 × 1.0 מ׳', widthM: 1, heightM: 1 },
  { label: '1.2 × 1.5 מ׳', widthM: 1.2, heightM: 1.5 },
];

// Real bug hit in production: an old per-sqm calibration factor (a very different field, since
// removed) was mistyped and turned a 1x1m window into a ~756,000 ₪ line item. Real prices seen
// across aluminum-pricing sites span roughly 100-3,500 ₪/מ"ר — not a hard block (a premium door
// could plausibly go higher), just a nudge before a stray digit reaches a client's quote.
const SUSPICIOUS_PRICE_MAX = 5000;
const SUSPICIOUS_PRICE_MIN = 20;
function isSuspiciousPricePerSqm(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 && (n > SUSPICIOUS_PRICE_MAX || n < SUSPICIOUS_PRICE_MIN);
}

// Same admin-mode/fork/revert pattern as CatalogCrudPage — shared via useCatalogAdminMode —
// with one extra query for the nested accessory kit editor, which the generic field-list form
// doesn't model.
export default function OpeningTypesPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const { isAdmin, adminMode, setAdminMode, editingGlobal, endpoint } = useCatalogAdminMode('opening-types', businessId!);
  const accessoriesEndpoint = editingGlobal ? '/catalog/accessories' : `/businesses/${businessId}/accessories`;

  const queryClient = useQueryClient();
  const { data: types = [] } = useQuery({
    queryKey: ['opening-types', businessId, editingGlobal],
    queryFn: () => api.get<OpeningType[]>(endpoint),
  });
  const { data: accessories = [] } = useQuery({
    queryKey: ['accessories', businessId, editingGlobal],
    queryFn: () => api.get<Accessory[]>(accessoriesEndpoint),
  });

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { formOpen, formRef, openForm, closeForm } = useCollapsibleForm(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  });
  const [kitEditingTypeId, setKitEditingTypeId] = useState<string | null>(null);
  const [kitQuantities, setKitQuantities] = useState<Record<string, string>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['opening-types'] });

  function buildPayload() {
    return {
      name_he: form.name_he,
      code: form.code,
      price_per_sqm: Number(form.price_per_sqm) || 0,
      has_glass: form.has_glass,
      sort_order: Number(form.sort_order) || 0,
      notes: form.notes,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => api.post(endpoint, buildPayload()),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.put(`${endpoint}/${id}`, buildPayload()),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: invalidate,
  });

  const saveKitMutation = useMutation({
    mutationFn: (typeId: string) => {
      const items = Object.entries(kitQuantities)
        .map(([accessoryId, qty]) => ({ accessory_id: accessoryId, quantity: Number(qty) || 0 }))
        .filter((i) => i.quantity > 0);
      return api.put(`${endpoint}/${typeId}/accessories`, { accessories: items });
    },
    onSuccess: () => {
      setKitEditingTypeId(null);
      invalidate();
    },
  });

  function startEdit(type: OpeningType) {
    setEditingId(type.id);
    setForm({
      name_he: type.name_he,
      code: type.code,
      price_per_sqm: String(type.price_per_sqm),
      has_glass: type.has_glass,
      sort_order: String(type.sort_order),
      notes: type.notes ?? '',
    });
    openForm();
  }

  function openKitEditor(type: OpeningType) {
    setKitEditingTypeId(type.id);
    const quantities: Record<string, string> = {};
    for (const line of type.accessories) quantities[line.accessory_id] = String(line.quantity);
    setKitQuantities(quantities);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name_he.trim() || !form.code.trim()) {
      setError('חובה להזין שם וקוד');
      return;
    }
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h2>סוגי פתחים (חלונות ודלתות)</h2>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={adminMode}
              onChange={(e) => {
                setAdminMode(e.target.checked);
                closeForm();
                setKitEditingTypeId(null);
              }}
            />
            עריכת הקטלוג הגלובלי (משפיע על כל העסקים)
          </label>
        )}
      </div>

      {!formOpen && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={openForm}>
          הוסף סוג פתח
        </button>
      )}

      <div className="card" ref={formRef} hidden={!formOpen}>
        <p className="text-muted" style={{ marginTop: 0 }}>
          <strong>מחיר למ"ר</strong> — המחיר הבסיסי של סוג הפתח הזה, ל-מ"ר. אפשר להשוות מול מחירוני
          אלומיניום אמיתיים כדי לוודא שהמספר סביר (לדוגמה: קליל 7000 ≈ 900–1,500 ₪/מ"ר, קליל 9000 ≈
          1,100–1,300 ₪/מ"ר, קליל 1700 ≈ 1,100–1,200 ₪/מ"ר). זכוכית מתווספת בנפרד, לפי מה שנבחר
          בהצעת המחיר עצמה — בטלו את "כולל זכוכית" לפתחים שאין בהם זכוכית כלל (רשת, תריס, ארגז).
          {!editingGlobal && ' עריכת סוג פתח מהקטלוג הגלובלי יוצרת עותק פרטי לעסק שלכם בלבד.'}
        </p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>שם הסוג</label>
              <input value={form.name_he} onChange={(e) => setForm({ ...form, name_he: e.target.value })} />
            </div>
            <div className="field">
              <label>קוד (ייחודי, אנגלית)</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="field">
              <label>מחיר למ"ר (₪)</label>
              <input
                type="number"
                step="0.01"
                value={form.price_per_sqm}
                onChange={(e) => setForm({ ...form, price_per_sqm: e.target.value })}
              />
              {isSuspiciousPricePerSqm(form.price_per_sqm) && (
                <div className="warning-text">
                  ערך רחוק מהטווח הרגיל (בדרך כלל 100–3,500 ₪/מ"ר) — ייתכן שזו טעות הקלדה שתייקר או
                  תוזיל מאוד את ההצעות. בדקו שוב לפני השמירה.
                </div>
              )}
            </div>
            <div className="field">
              <label>סדר תצוגה</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={form.has_glass}
                  onChange={(e) => setForm({ ...form, has_glass: e.target.checked })}
                />{' '}
                כולל זכוכית (בטלו עבור רשת, תריס, ארגז וכד')
              </label>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>הערות (אופציונלי) — למשל למה נבחרו הערכים האלה, או מדידה שביצעתם</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <p style={{ fontWeight: 600, marginBottom: 4 }}>איך זה מתורגם למחיר, לדוגמה:</p>
          <table style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>גודל לדוגמה</th>
                <th>שטח</th>
                <th>מחיר בסיס (שטח × מחיר למ"ר)</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_SIZES_M.map((size) => {
                const areaSqm = size.widthM * size.heightM;
                const pricePerSqm = Number(form.price_per_sqm) || 0;
                return (
                  <tr key={size.label}>
                    <td>{size.label}</td>
                    <td className="numeric">{areaSqm.toFixed(2)} מ"ר</td>
                    <td className="numeric">{(areaSqm * pricePerSqm).toFixed(2)} ₪</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
            {form.has_glass
              ? 'העלות הסופית = המחיר הבסיס למעלה, ועוד שטח הפתח × מחיר מ"ר של סוג הזכוכית שנבחר (זה נקבע בהצעת המחיר עצמה, לא כאן).'
              : 'סוג פתח זה לא כולל זכוכית — לא תתווסף עלות זכוכית להצעה עבורו.'}
          </p>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary">
            שמור
          </button>
          <button type="button" className="btn" style={{ marginInlineStart: 8 }} onClick={closeForm}>
            ביטול
          </button>
        </form>
      </div>

      <div className="card">
        {types.length === 0 ? (
          <div className="empty-state">אין עדיין סוגי פתחים בקטלוג</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>מחיר למ"ר</th>
                <th>כולל זכוכית</th>
                <th>אביזרי בסיס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => {
                const isFork = !editingGlobal && Boolean(type.forked_from_global);
                return (
                  <Fragment key={type.id}>
                    <tr style={{ opacity: type.is_active ? 1 : 0.5 }}>
                      <td>
                        {type.name_he}
                        {type.notes && (
                          <div className="text-muted" style={{ fontSize: 12 }} title={type.notes}>
                            {type.notes}
                          </div>
                        )}
                      </td>
                      <td className="numeric">{type.price_per_sqm}</td>
                      <td>{type.has_glass ? 'כן' : 'לא'}</td>
                      <td>
                        {type.accessories.length === 0
                          ? '—'
                          : type.accessories.map((a) => `${a.quantity}× ${a.name_he}`).join(', ')}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => startEdit(type)}>
                          עריכה
                        </button>{' '}
                        <button className="btn btn-sm" onClick={() => openKitEditor(type)}>
                          אביזרים
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (confirm(isFork ? 'לאפס את סוג הפתח לברירת המחדל הגלובלית?' : 'למחוק את סוג הפתח?'))
                              deleteMutation.mutate(type.id);
                          }}
                        >
                          {isFork ? 'איפוס לברירת מחדל' : 'מחיקה'}
                        </button>
                      </td>
                    </tr>
                    {kitEditingTypeId === type.id && (
                      <tr>
                        <td colSpan={5}>
                          <div className="card" style={{ margin: '8px 0', background: '#fafbfc' }}>
                            <strong>אביזרי בסיס עבור "{type.name_he}"</strong>
                            <div className="form-grid" style={{ marginTop: 10 }}>
                              {accessories.map((acc) => (
                                <div className="field" key={acc.id}>
                                  <label>{acc.name_he}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={kitQuantities[acc.id] ?? '0'}
                                    onChange={(e) =>
                                      setKitQuantities({ ...kitQuantities, [acc.id]: e.target.value })
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => saveKitMutation.mutate(type.id)}
                            >
                              שמור אביזרים
                            </button>{' '}
                            <button className="btn btn-sm" onClick={() => setKitEditingTypeId(null)}>
                              ביטול
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
