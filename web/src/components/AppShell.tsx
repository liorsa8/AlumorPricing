import { NavLink, Outlet } from 'react-router-dom';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

export default function AppShell() {
  return (
    <div className="app-shell">
      <aside className="app-nav">
        <h1>AlumorPricing</h1>
        <div className="subtitle">הצעות מחיר לחלונות ודלתות</div>
        <nav>
          <NavLink to="/" className={navLinkClass} end>
            הצעות מחיר
          </NavLink>
          <NavLink to="/customers" className={navLinkClass}>
            לקוחות
          </NavLink>

          <div className="nav-group-title">קטלוג</div>
          <NavLink to="/catalog/opening-types" className={navLinkClass}>
            סוגי פתחים
          </NavLink>
          <NavLink to="/catalog/profile-systems" className={navLinkClass}>
            מערכות פרופיל
          </NavLink>
          <NavLink to="/catalog/glass-types" className={navLinkClass}>
            סוגי זכוכית
          </NavLink>
          <NavLink to="/catalog/accessories" className={navLinkClass}>
            אביזרים
          </NavLink>

          <div className="nav-group-title">הגדרות</div>
          <NavLink to="/settings" className={navLinkClass}>
            עלויות והגדרות
          </NavLink>
        </nav>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
