import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useCatalogAdminMode } from '../lib/useCatalogAdminMode';
import { formatCurrency } from '../lib/format';

export interface CatalogField {
  key: string;
  label: string;
  type?: 'text' | 'number';
  step?: string;
  defaultValue?: string;
}

interface CatalogItem {
  id: string;
  is_active: number;
  forked_from_global?: boolean;
  [key: string]: unknown;
}

interface CatalogCrudPageProps {
  title: string;
  kind: string;
  businessId: string;
  queryKey: string;
  fields: CatalogField[];
  addButtonLabel: string;
  emptyStateLabel: string;
  deleteConfirmText: string;
}

// Two namespaces behind one page: /catalog/:kind (the true global catalog, admin-write-only —
// enforced by firestore.rules, not just this toggle) and /businesses/:businessId/:kind (the
// merged, per-business view). Editing a merged row that originated in the global catalog forks
// it into a private override for this business only; "deleting" such a fork just reverts to
// the current global value (see firestoreApi's DELETE handler) — never touches other businesses.
export default function CatalogCrudPage({
  title,
  kind,
  businessId,
  queryKey,
  fields,
  addButtonLabel,
  emptyStateLabel,
  deleteConfirmText,
}: CatalogCrudPageProps) {
  const { isAdmin, adminMode, setAdminMode, editingGlobal, endpoint } = useCatalogAdminMode(kind, businessId);

  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? '']));
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: [queryKey, businessId, editingGlobal],
    queryFn: () => api.get<CatalogItem[]>(endpoint),
  });

  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  function buildPayload() {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = form[f.key];
      payload[f.key] = f.type === 'number' ? Number(raw) || 0 : raw || f.defaultValue || null;
    }
    return payload;
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
    onError: (e: Error) => setError(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.put(`${endpoint}/${id}`, { is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    const next: Record<string, string> = {};
    for (const f of fields) {
      const value = item[f.key];
      next[f.key] = value === null || value === undefined ? '' : String(value);
    }
    setForm(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form[fields[0].key]?.trim()) {
      setError(`חובה להזין ${fields[0].label}`);
      return;
    }
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        {isAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={adminMode}
              onChange={(e) => {
                setAdminMode(e.target.checked);
                setEditingId(null);
                setForm(emptyForm);
              }}
            />
            עריכת הקטלוג הגלובלי (משפיע על כל העסקים)
          </label>
        )}
      </div>

      {!editingGlobal && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          עריכת פריט מהקטלוג הגלובלי יוצרת עותק פרטי לעסק שלכם בלבד; "איפוס לברירת מחדל" מוחק את העותק ומחזיר אתכם לערך הגלובלי הנוכחי.
        </p>
      )}

      <div className="card">
        <form onSubmit={submit}>
          <div className="form-grid">
            {fields.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  step={f.step}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary">
            {editingId ? 'עדכן' : addButtonLabel}
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
        {items.length === 0 ? (
          <div className="empty-state">{emptyStateLabel}</div>
        ) : (
          <table>
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isFork = !editingGlobal && Boolean(item.forked_from_global);
                return (
                  <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                    {fields.map((f) => {
                      const value = item[f.key];
                      return (
                        <td key={f.key} className={f.type === 'number' ? 'numeric' : undefined}>
                          {f.type === 'number'
                            ? formatCurrency(Number(value) || 0)
                            : value !== null && value !== undefined && value !== ''
                              ? String(value)
                              : '—'}
                        </td>
                      );
                    })}
                    <td>{item.is_active ? 'פעיל' : 'לא פעיל'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => startEdit(item)}>
                        עריכה
                      </button>{' '}
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          // Toggling an item that's still merged straight from the global catalog
                          // forks it into a private, business-scoped copy (see the PUT handler in
                          // firestoreApi.ts) — warn before silently detaching it from future
                          // global catalog updates.
                          if (
                            !editingGlobal &&
                            !isFork &&
                            !confirm('שינוי הסטטוס ייצור עותק פרטי לעסק שלכם, שלא יתעדכן יותר אוטומטית מהקטלוג הגלובלי. להמשיך?')
                          ) {
                            return;
                          }
                          toggleActiveMutation.mutate({ id: item.id, is_active: !item.is_active });
                        }}
                      >
                        {item.is_active ? 'השבת' : 'הפעל'}
                      </button>{' '}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm(isFork ? 'לאפס את הפריט לערך הגלובלי המקורי?' : deleteConfirmText)) deleteMutation.mutate(item.id);
                        }}
                      >
                        {isFork ? 'איפוס לברירת מחדל' : 'מחיקה'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
