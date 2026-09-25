import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Business } from '../api/types';
import { useAuth } from '../auth/AuthProvider';

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name || email || '?';
  return source.trim().charAt(0).toUpperCase();
}

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

  // A single business has nothing to choose between, so this list is just an extra click on
  // the way to the quotes page — skip straight there instead.
  useEffect(() => {
    if (!isLoading && businesses.length === 1) {
      navigate(`/b/${businesses[0].id}`, { replace: true });
    }
  }, [isLoading, businesses, navigate]);

  return (
    <div className="workspace-picker">
      <div className="workspace-picker-account">
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="user-avatar" referrerPolicy="no-referrer" />
        ) : (
          <div className="user-avatar user-avatar-fallback">{initials(user?.displayName, user?.email)}</div>
        )}
        <span className="workspace-picker-account-email">{user?.email}</span>
        <button className="link-button" onClick={() => signOut()}>
          התנתקות
        </button>
      </div>

      <div className="workspace-picker-card">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="workspace-picker-logo" />
        <h1 className="workspace-picker-title">העסקים שלי</h1>
        <p className="workspace-picker-subtitle">בחרו עסק כדי להמשיך</p>

        {isLoading ? (
          <div className="workspace-picker-loading">טוען...</div>
        ) : (
          <div className="workspace-list">
            {businesses.map((b) => (
              <button key={b.id} className="workspace-row" onClick={() => navigate(`/b/${b.id}`)}>
                <span className="workspace-row-tile" aria-hidden="true">
                  {(b.company_name || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="workspace-row-name">{b.company_name || '(ללא שם)'}</span>
                <span className="workspace-row-arrow" aria-hidden="true">
                  ‹
                </span>
              </button>
            ))}

            {businesses.length === 0 && !creating && (
              <div className="workspace-picker-empty">עדיין אין לכם עסק. צרו עסק חדש כדי להתחיל.</div>
            )}

            {creating ? (
              <div className="workspace-create-form">
                <input
                  className="workspace-create-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="שם העסק, לדוגמה: אלומור"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate()}
                />
                <div className="workspace-create-actions">
                  <button className="btn" onClick={() => setCreating(false)}>
                    ביטול
                  </button>
                  <button className="btn btn-primary" onClick={() => createMutation.mutate()}>
                    יצירת עסק
                  </button>
                </div>
                {error && <div className="error-text">{error}</div>}
              </div>
            ) : (
              <button className="workspace-row workspace-row-add" onClick={() => setCreating(true)}>
                <span className="workspace-row-tile workspace-row-tile-add" aria-hidden="true">
                  +
                </span>
                <span className="workspace-row-name">עסק חדש</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
