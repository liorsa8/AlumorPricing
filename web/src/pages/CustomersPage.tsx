import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Customer } from '../api/types';
import { useCollapsibleForm } from '../lib/useCollapsibleForm';

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' };

export default function CustomersPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', businessId],
    queryFn: () => api.get<Customer[]>(`/businesses/${businessId}/customers`),
  });

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { formOpen, formRef, openForm, closeForm } = useCollapsibleForm(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers', businessId] });

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
    mutationFn: () => api.post(`/businesses/${businessId}/customers`, buildPayload()),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/businesses/${businessId}/customers/${id}`, buildPayload()),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${businessId}/customers/${id}`),
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
    openForm();
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

      {!formOpen && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={openForm}>
          הוסף לקוח
        </button>
      )}

      <div className="card" ref={formRef} hidden={!formOpen}>
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
            שמור
          </button>
          <button type="button" className="btn" style={{ marginInlineStart: 8 }} onClick={closeForm}>
            ביטול
          </button>
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
