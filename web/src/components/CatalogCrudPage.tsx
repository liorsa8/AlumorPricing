import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatCurrency } from '../lib/format';

export interface CatalogField {
  key: string;
  label: string;
  type?: 'text' | 'number';
  step?: string;
  defaultValue?: string;
}

interface CatalogItem {
  id: number;
  is_active: number;
  [key: string]: unknown;
}

interface CatalogCrudPageProps {
  title: string;
  endpoint: string;
  queryKey: string;
  fields: CatalogField[];
  addButtonLabel: string;
  emptyStateLabel: string;
  deleteConfirmText: string;
}

export default function CatalogCrudPage({
  title,
  endpoint,
  queryKey,
  fields,
  addButtonLabel,
  emptyStateLabel,
  deleteConfirmText,
}: CatalogCrudPageProps) {
  const emptyForm = Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? '']));
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: () => api.get<CatalogItem[]>(endpoint),
  });

  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
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
    mutationFn: (id: number) => api.put(`${endpoint}/${id}`, buildPayload()),
    onSuccess: () => {
      setForm(emptyForm);
      setEditingId(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`${endpoint}/${id}`),
    onSuccess: invalidate,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => api.put(`${endpoint}/${id}`, { is_active }),
    onSuccess: invalidate,
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
      </div>

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
              {items.map((item) => (
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
                      onClick={() => toggleActiveMutation.mutate({ id: item.id, is_active: !item.is_active })}
                    >
                      {item.is_active ? 'השבת' : 'הפעל'}
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (confirm(deleteConfirmText)) deleteMutation.mutate(item.id);
                      }}
                    >
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
