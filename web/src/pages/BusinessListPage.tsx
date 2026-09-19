import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Business } from '../api/types';
import { useAuth } from '../auth/AuthProvider';

export default function BusinessListPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => api.get<Business[]>('/businesses'),
  });

  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post<Business>('/businesses', { company_name: newName || undefined }),
    onSuccess: (business) => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      navigate(`/b/${business.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
      <div className="page-header">
        <h2>העסקים שלי</h2>
        <button className="btn btn-sm" onClick={() => signOut()}>
          התנתקות ({user?.email})
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div>טוען...</div>
        ) : businesses.length === 0 ? (
          <div className="empty-state">עדיין אין לכם עסק. צרו עסק חדש כדי להתחיל.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>שם העסק</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>{b.company_name || '(ללא שם)'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => navigate(`/b/${b.id}`)}>
                      כניסה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        {creating ? (
          <div className="form-grid">
            <div className="field">
              <label>שם העסק</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="לדוגמה: אלומור" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()}>
                יצירת עסק
              </button>
              <button className="btn" onClick={() => setCreating(false)}>
                ביטול
              </button>
            </div>
            {error && <div className="error-text">{error}</div>}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            עסק חדש +
          </button>
        )}
      </div>
    </div>
  );
}
