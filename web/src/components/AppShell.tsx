import { useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { firstLetterInitial } from '../lib/format';
import { useBusinessQuery, useProjectsQuery } from '../lib/queries';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { businessId } = useParams<{ businessId: string }>();
  const { user, signOut } = useAuth();
  const b = `/b/${businessId}`;

  const { data: business } = useBusinessQuery(businessId);
  // Same hook (same queryKey/queryFn) as ProjectsListPage's own fetch — react-query dedupes the
  // two into one request and shares the cache, so the nav badge doesn't cost an extra round trip.
  const { data: projects = [] } = useProjectsQuery(businessId);

  return (
    <div className="app-shell">
      <aside className="app-nav">
        {/* In RTL flex layout, the first element in markup order sits on the right — the
            toggle comes first so it lands on the same side as the rest of the nav, not the
            far left. */}
        <div className="app-nav-header">
          <button
            type="button"
            className="nav-toggle"
            aria-label="תפריט"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <div className="app-brand">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="app-logo" />
            <h1>AlumorPricing</h1>
          </div>
        </div>
        <div className="subtitle">הצעות מחיר לחלונות ודלתות</div>
        {/* Only meaningful on mobile, where nav becomes a slide-in drawer — tapping outside
            it (on this backdrop) closes it, same as picking a link. */}
        {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} />}
        {/* Closing on any click inside is deliberate — every actionable child here is a nav
            link or the switch/sign-out links, so this collapses the mobile drawer as soon as
            the user picks a destination. */}
        <div className={`app-nav-panel${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
          <nav>
            <NavLink to={b} className={navLinkClass} end>
              הצעות מחיר
              <span className="nav-count">{projects.length}</span>
            </NavLink>
            <NavLink to={`${b}/customers`} className={navLinkClass}>
              לקוחות
            </NavLink>
          </nav>

          <div className="nav-group">
            <div className="nav-group-title">קטלוג</div>
            <NavLink to={`${b}/catalog/opening-types`} className={navLinkClass}>
              סוגי פתחים
            </NavLink>
            <NavLink to={`${b}/catalog/profile-systems`} className={navLinkClass}>
              מערכות פרופיל
            </NavLink>
            <NavLink to={`${b}/catalog/glass-types`} className={navLinkClass}>
              סוגי זכוכית
            </NavLink>
            <NavLink to={`${b}/catalog/accessories`} className={navLinkClass}>
              אביזרים
            </NavLink>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">הגדרות</div>
            <NavLink to={`${b}/settings`} className={navLinkClass}>
              עלויות והגדרות
            </NavLink>
          </div>

          <div className="app-user-card">
            <div className="app-user-avatar">{firstLetterInitial(business?.company_name)}</div>
            <div className="app-user-info">
              <div className="app-user-name">{business?.company_name || 'העסק שלי'}</div>
              <div className="app-user-links">
                <NavLink to="/businesses" state={{ manualSwitch: true }}>
                  החלפת עסק
                </NavLink>
                <span>·</span>
                <button type="button" onClick={() => signOut()} title={user?.email ?? ''}>
                  התנתקות
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
