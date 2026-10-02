import { ProjectListItem, ProjectStatus } from '../api/types';

// Pulled out of ProjectsListPage so the KPI/filter/tab-count math can be unit tested directly,
// without mounting the page or faking react-query — see quotesDashboard.test.ts.

export function filterProjectsByQuery(projects: ProjectListItem[], query: string): ProjectListItem[] {
  const q = query.trim();
  if (!q) return projects;
  return projects.filter((p) => `${p.customer_name ?? ''}${p.customer_address ?? ''}${p.quote_number}`.includes(q));
}

// Always includes every known status (even at 0), plus 'all' — so a tab for a status nobody has
// used yet still renders with a "0" instead of silently disappearing.
export function countByStatus(projects: ProjectListItem[]): Record<ProjectStatus | 'all', number> {
  const counts = { all: projects.length, draft: 0, sent: 0, accepted: 0, rejected: 0, archived: 0 };
  for (const p of projects) counts[p.status] += 1;
  return counts;
}

export interface DashboardKpiStats {
  openTotal: number;
  openCount: number;
  approvedThisMonthTotal: number;
  approvedLastMonthTotal: number;
  approvedCount: number;
  rejectedCount: number;
}

function isInMonth(iso: string, monthStart: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
}

// KPIs are computed from ALL quotes, not whatever the search/tab filters currently show (see
// ProjectsListPage) — "open" only counts 'sent' since the app has no way to tell when a client
// has actually viewed a shared quote (the design's dropped "נצפתה" status).
export function computeDashboardKpiStats(projects: ProjectListItem[], now: Date = new Date()): DashboardKpiStats {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const open = projects.filter((p) => p.status === 'sent');
  const approved = projects.filter((p) => p.status === 'accepted');
  const rejected = projects.filter((p) => p.status === 'rejected');
  const approvedThisMonth = approved.filter((p) => isInMonth(p.created_at, thisMonthStart));
  const approvedLastMonth = approved.filter((p) => isInMonth(p.created_at, lastMonthStart));

  return {
    openTotal: open.reduce((s, p) => s + p.total, 0),
    openCount: open.length,
    approvedThisMonthTotal: approvedThisMonth.reduce((s, p) => s + p.total, 0),
    approvedLastMonthTotal: approvedLastMonth.reduce((s, p) => s + p.total, 0),
    approvedCount: approved.length,
    rejectedCount: rejected.length,
  };
}

// null = "no answered quotes yet" (nothing to divide by) — the UI shows "—" for that, not "0%".
export function closeRatePct(stats: DashboardKpiStats): number | null {
  const answered = stats.approvedCount + stats.rejectedCount;
  if (answered === 0) return null;
  return Math.round((stats.approvedCount / answered) * 100);
}

// null = no approved total last month to compare against (including "last month was also zero"),
// so a percentage change would be either undefined or a meaningless "+Infinity%".
export function approvedMonthChangePct(stats: DashboardKpiStats): number | null {
  if (stats.approvedLastMonthTotal <= 0) return null;
  return Math.round(((stats.approvedThisMonthTotal - stats.approvedLastMonthTotal) / stats.approvedLastMonthTotal) * 100);
}
