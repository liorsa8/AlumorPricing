import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectDetail, ProjectStatus } from '../api/types';
import {
  STATUS_LABELS,
  avatarColors,
  clientInitials,
  formatDateDMY,
  formatLongHebrewDate,
  formatQuoteTotal,
  summarizeOpenings,
} from '../lib/format';
import { shareQuoteImage } from '../lib/shareQuote';
import { useBusinessQuery, useProjectsQuery } from '../lib/queries';
import {
  approvedMonthChangePct,
  closeRatePct,
  computeDashboardKpiStats,
  countByStatus,
  filterProjectsByQuery,
} from '../lib/quotesDashboard';
import PrintableQuote from '../components/PrintableQuote';

const STATUS_TABS: Array<ProjectStatus | 'all'> = ['all', 'draft', 'sent', 'accepted', 'rejected', 'archived'];

// null = neutral/muted (no signal to show, e.g. nothing to compare against yet).
function trendColor(pct: number | null): string {
  if (pct === null) return 'var(--color-text-muted)';
  return pct >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
  );
}

export default function ProjectsListPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ProjectStatus | 'all'>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareNodeRef = useRef<HTMLDivElement>(null);

  // Same hook (same queryKey/queryFn) as AppShell's own fetch for the nav badge — react-query
  // dedupes them into one request and shares the cache.
  const { data: projects = [] } = useProjectsQuery(businessId);
  const { data: business } = useBusinessQuery(businessId);
  const { data: sharingProject } = useQuery({
    queryKey: ['project', businessId, sharingId],
    queryFn: () => api.get<ProjectDetail>(`/businesses/${businessId}/projects/${sharingId}`),
    enabled: !!sharingId,
  });

  const invalidateProjects = () => queryClient.invalidateQueries({ queryKey: ['projects', businessId] });

  const createMutation = useMutation({
    mutationFn: () => api.post<ProjectDetail>(`/businesses/${businessId}/projects`, {}),
    onSuccess: (project) => {
      invalidateProjects();
      navigate(`/b/${businessId}/projects/${project.id}`);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post<ProjectDetail>(`/businesses/${businessId}/projects/${id}/duplicate`, {}),
    onSuccess: (project) => {
      invalidateProjects();
      navigate(`/b/${businessId}/projects/${project.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/businesses/${businessId}/projects/${id}`),
    onSuccess: invalidateProjects,
  });

  // Every row-menu action closes the menu first — this just removes that repeated line from
  // each handler below.
  function closeMenuThen(action: () => void) {
    setMenuOpenId(null);
    action();
  }

  // Close the "⋯" row menu on an outside click.
  useEffect(() => {
    if (!menuOpenId) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpenId]);

  // Once the off-screen PrintableQuote for the quote being shared has actually rendered, capture
  // it and hand it to the OS share sheet — same mechanism as the quote detail page's "שתף"
  // button (see shareQuote.ts), just triggered from a list row instead of a loaded ProjectDetail.
  useEffect(() => {
    if (!sharingId || !sharingProject || !shareNodeRef.current) return;
    const node = shareNodeRef.current;
    const project = sharingProject;
    (async () => {
      try {
        setNotice(await shareQuoteImage(node, project));
      } catch {
        setNotice('שיתוף ההצעה נכשל, נסו שוב');
      } finally {
        setSharingId(null);
      }
    })();
  }, [sharingId, sharingProject]);

  const byQuery = useMemo(() => filterProjectsByQuery(projects, query), [projects, query]);
  const visibleRows = useMemo(() => (tab === 'all' ? byQuery : byQuery.filter((p) => p.status === tab)), [byQuery, tab]);
  const tabCounts = useMemo(() => countByStatus(byQuery), [byQuery]);

  const kpis = useMemo(() => {
    const stats = computeDashboardKpiStats(projects);
    const closeRate = closeRatePct(stats);
    const monthChange = approvedMonthChangePct(stats);

    return [
      {
        label: 'הצעות פתוחות',
        value: formatQuoteTotal(stats.openTotal),
        note: `${stats.openCount} הצעות ממתינות לתשובה`,
        noteColor: 'var(--color-text-muted)',
      },
      {
        label: 'אושרו החודש',
        value: formatQuoteTotal(stats.approvedThisMonthTotal),
        note: monthChange === null ? 'אין נתונים לחודש הקודם' : `${monthChange >= 0 ? '▲' : '▼'} ${Math.abs(monthChange)}% לעומת חודש קודם`,
        noteColor: trendColor(monthChange),
      },
      {
        label: 'אחוז סגירה',
        value: closeRate === null ? '—' : `${closeRate}%`,
        note: 'מתוך הצעות שקיבלו מענה',
        noteColor: 'var(--color-text-muted)',
      },
    ];
  }, [projects]);

  const shownSum = useMemo(() => visibleRows.reduce((s, p) => s + p.total, 0), [visibleRows]);

  return (
    <div>
      <div className="quotes-topbar">
        <div className="quotes-search">
          <SearchIcon />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי לקוח, מס׳ הצעה או כתובת" />
        </div>
        <div className="quotes-topbar-date">{formatLongHebrewDate(new Date())}</div>
      </div>

      {/* Off-screen (not display:none — html2canvas needs it actually laid out) copy of
          whichever quote is currently being shared from this list, captured into an image —
          same pattern ProjectDetailPage uses for its own "שתף" button. */}
      <div className="share-capture-node" style={{ position: 'fixed', top: 0, insetInlineStart: '-9999px', width: 800 }} aria-hidden="true">
        {sharingProject && <PrintableQuote ref={shareNodeRef} project={sharingProject} settings={business} />}
      </div>

      <div className="page-header">
        <div className="page-header-text">
          <h2>הצעות מחיר</h2>
          <div className="page-header-subtitle">יצירה, מעקב ושליחה של הצעות ללקוחות</div>
        </div>
        <button className="btn btn-primary" onClick={() => createMutation.mutate()}>
          <PlusIcon />
          הצעת מחיר חדשה
        </button>
      </div>

      {notice && <div className="quotes-notice">{notice}</div>}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value numeric">{k.value}</div>
            <div className="kpi-note" style={{ color: k.noteColor }}>
              {k.note}
            </div>
          </div>
        ))}
      </div>

      <div className="quotes-card">
        <div className="quotes-tabs">
          {STATUS_TABS.map((key) => (
            <button key={key} type="button" className={`quotes-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {key === 'all' ? 'הכל' : STATUS_LABELS[key]}
              <span className="quotes-tab-count">{tabCounts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="quotes-table-scroll">
          <div className="quotes-table-inner">
            <div className="quotes-row-grid quotes-table-head">
              <div>מס׳ הצעה</div>
              <div>לקוח</div>
              <div>כתובת פרויקט</div>
              <div>סטטוס</div>
              <div className="col-total">סה״כ</div>
              <div>תאריך</div>
              <div></div>
            </div>

            {visibleRows.map((p) => {
              const av = avatarColors(p.id);
              const hasClient = Boolean(p.customer_name);
              return (
                <div key={p.id} className="quotes-row quotes-row-grid" onClick={() => navigate(`/b/${businessId}/projects/${p.id}`)}>
                  <Link className="quotes-row-id" to={`/b/${businessId}/projects/${p.id}`} onClick={(e) => e.stopPropagation()}>
                    #{p.quote_number}
                  </Link>
                  <div className="quotes-row-client">
                    <div
                      className="quotes-avatar"
                      style={{ background: hasClient ? av.bg : '#F1F4F8', color: hasClient ? av.fg : '#8A97A8' }}
                    >
                      {hasClient ? clientInitials(p.customer_name) : '?'}
                    </div>
                    <div className="quotes-row-client-info">
                      <div className="quotes-row-client-name" style={hasClient ? undefined : { color: 'var(--color-text-faint)' }}>
                        {p.customer_name || 'ללא לקוח'}
                      </div>
                      <div className="quotes-row-client-items">{summarizeOpenings(p.openings)}</div>
                    </div>
                  </div>
                  <div className="quotes-row-address">{p.customer_address || '—'}</div>
                  <div>
                    <span className={`status-pill status-${p.status}`}>
                      <span className="status-dot" />
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <div className="quotes-row-total" dir="ltr">
                    {formatQuoteTotal(p.total)}
                  </div>
                  <div className="quotes-row-date">{formatDateDMY(p.created_at)}</div>
                  <div className="quotes-row-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" title="שיתוף" className="icon-btn" onClick={() => setSharingId(p.id)}>
                      <ShareIcon />
                    </button>
                    <button
                      type="button"
                      title="עוד"
                      className="icon-btn plain"
                      onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)}
                    >
                      ⋯
                    </button>
                    {menuOpenId === p.id && (
                      <div className="quotes-row-menu" ref={menuRef}>
                        <button type="button" onClick={() => closeMenuThen(() => navigate(`/b/${businessId}/projects/${p.id}`))}>
                          עריכה
                        </button>
                        <button type="button" onClick={() => closeMenuThen(() => duplicateMutation.mutate(p.id))}>
                          שכפול
                        </button>
                        <button
                          type="button"
                          onClick={() => closeMenuThen(() => window.open(`#/b/${businessId}/projects/${p.id}/print?autoprint=1`, '_blank'))}
                        >
                          הורדת PDF
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => closeMenuThen(() => confirm('למחוק את ההצעה?') && deleteMutation.mutate(p.id))}
                        >
                          מחיקה
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {visibleRows.length === 0 && <div className="empty-state">לא נמצאו הצעות התואמות לסינון</div>}
          </div>
        </div>

        <div className="quotes-table-footer">
          <div>
            מציג {visibleRows.length} מתוך {projects.length} הצעות
          </div>
          <div className="quotes-table-footer-sum">
            סה״כ בתצוגה: <b dir="ltr">{formatQuoteTotal(shownSum)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
