import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div style={{ padding: 32 }}>טוען...</div>;
  if (user) return <Navigate to="/businesses" replace />;

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch {
      setError('ההתחברות נכשלה, נסו שוב');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" style={{ width: 72, height: 72 }} />
      <h1 style={{ margin: 0 }}>AlumorPricing</h1>
      <p className="text-muted" style={{ margin: 0 }}>הצעות מחיר לחלונות ודלתות</p>
      <button className="btn btn-primary" onClick={handleSignIn}>
        התחברות עם Google
      </button>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
