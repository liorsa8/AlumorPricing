import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Customer } from '../api/types';

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' };

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/api/customers'),
  });

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] });

  function buildPayload() {
    return {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/customers', buildPayload()),
    onSuccess: () => {
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (id: number) => api.put(`/api/customers/${id}`, buildPayload()),
    onSuccess: () => {
      setForm(emptyForm);
      setEditingId(null);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/customers/${id}`),
    onSuccess: invalidate,
    onError: () => alert('לא ניתן למחוק לקוח שיש לו הצעות מחיר'),
  });

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('חובה להזין שם לקוח');
      return;
    }
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h2>לקוחות</h2>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label>שם</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>טלפון</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>אימייל</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>כתובת</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" className="btn btn-primary">
            {editingId ? 'עדכן' : 'הוסף לקוח'}
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
        {customers.length === 0 ? (
          <div className="empty-state">אין עדיין לקוחות</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>טלפון</th>
                <th>אימייל</th>
                <th>כתובת</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{c.address ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => startEdit(c)}>
                      עריכה
                    </button>{' '}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (confirm('למחוק את הלקוח?')) deleteMutation.mutate(c.id);
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
