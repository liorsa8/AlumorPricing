import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectListItem, ProjectDetail } from '../api/types';
import { formatCurrency, formatDate, STATUS_LABELS } from '../lib/format';

export default function ProjectsListPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', businessId, statusFilter],
    queryFn: () =>
      api.get<ProjectListItem[]>(`/businesses/${businessId}/projects${statusFilter ? `?status=${statusFilter}` : ''}`),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<ProjectDetail>(`/businesses/${businessId}/projects`, {}),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', businessId] });
      navigate(`/b/${businessId}/projects/${project.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${businessId}/projects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', businessId] }),
  });

  return (
    <div>
      <div className="page-header">
        <h2>הצעות מחיר</h2>
        <button className="btn btn-primary" onClick={() => createMutation.mutate()}>
          הצעת מחיר חדשה +
        </button>
      </div>

      <div className="card">
        <div className="field" style={{ maxWidth: 200, marginBottom: 12 }}>
          <label>סטטוס</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">הכל</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">אין עדיין הצעות מחיר. לחצו על "הצעת מחיר חדשה" כדי להתחיל.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>מס' הצעה</th>
                <th>לקוח</th>
                <th>כותרת</th>
                <th>סטטוס</th>
                <th>סה"כ</th>
                <th>תאריך</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/b/${businessId}/projects/${p.id}`}>#{p.quote_number}</Link>
                  </td>
                  <td>{p.customer_name ?? '—'}</td>
                  <td>{p.title || '—'}</td>
                  <td>
                    <span className={`badge status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  </td>
                  <td className="numeric">{formatCurrency(p.total)}</td>
                  <td>{formatDate(p.created_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (confirm('למחוק את ההצעה?')) deleteMutation.mutate(p.id);
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
