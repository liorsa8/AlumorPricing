import { Fragment, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useCatalogAdminMode } from '../../lib/useCatalogAdminMode';
import { Accessory, OpeningType } from '../../api/types';

const emptyForm = { name_he: '', code: '', profile_factor: '', glass_area_ratio: '', sort_order: '0' };

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
  const [kitEditingTypeId, setKitEditingTypeId] = useState<string | null>(null);
  const [kitQuantities, setKitQuantities] = useState<Record<string, string>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['opening-types'] });

  function buildPayload() {
    return {
      name_he: form.name_he,
      code: form.code,
      profile_factor: Number(form.profile_factor) || 0,
      glass_area_ratio: Number(form.glass_area_ratio) || 0,
      sort_order: Number(form.sort_order) || 0,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => api.post(endpoint, buildPayload()),
    onSuccess: () => {
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.put(`${endpoint}/${id}`, buildPayload()),
    onSuccess: () => {
      setForm(emptyForm);
      setEditingId(null);
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
      profile_factor: String(type.profile_factor),
      glass_area_ratio: String(type.glass_area_ratio),
      sort_order: String(type.sort_order),
    });
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
                setEditingId(null);
                setForm(emptyForm);
                setKitEditingTypeId(null);
              }}
            />
            עריכת הקטלוג הגלובלי (משפיע על כל העסקים)
          </label>
        )}
      </div>

      <div className="card">
        <p className="text-muted" style={{ marginTop: 0 }}>
          "מקדם פרופיל" = מטרים של פרופיל ליחידת שטח (מ"ר). "יחס זכוכית" = החלק היחסי של הפתח שהוא זכוכית
          (השאר מסגרת). ערכים אלה מוערכים על ידיכם ולא מדויקים גיאומטרית — כווננו אותם לפי הניסיון שלכם.
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
              <label>מקדם פרופיל (מ' / מ"ר)</label>
              <input
                type="number"
                step="0.01"
                value={form.profile_factor}
                onChange={(e) => setForm({ ...form, profile_factor: e.target.value })}
              />
            </div>
            <div className="field">
              <label>יחס זכוכית (0–1)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.glass_area_ratio}
                onChange={(e) => setForm({ ...form, glass_area_ratio: e.target.value })}
              />
            </div>
            <div className="field">
              <label>סדר תצוגה</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary">
            {editingId ? 'עדכן' : 'הוסף סוג פתח'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn"
              style={{ marginInlineStart: 8 }}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              ביטול
            </button>
          )}
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
                <th>מקדם פרופיל</th>
                <th>יחס זכוכית</th>
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
                      <td>{type.name_he}</td>
                      <td className="numeric">{type.profile_factor}</td>
                      <td className="numeric">{type.glass_area_ratio}</td>
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
