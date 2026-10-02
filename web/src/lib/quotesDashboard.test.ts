import { describe, it, expect } from 'vitest';
import { ProjectListItem } from '../api/types';
import {
  approvedMonthChangePct,
  closeRatePct,
  computeDashboardKpiStats,
  countByStatus,
  filterProjectsByQuery,
} from './quotesDashboard';

function project(overrides: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: '1',
    customer_id: null,
    customer_name: null,
    customer_address: null,
    quote_number: 1,
    title: '',
    status: 'draft',
    total: 100,
    created_at: '2026-10-01T10:00:00.000Z',
    openings: [],
    ...overrides,
  };
}

describe('filterProjectsByQuery', () => {
  const projects = [
    project({ id: '1', quote_number: 14, customer_name: 'משפחת לוי', customer_address: 'הרצל 42, רמת גן' }),
    project({ id: '2', quote_number: 9, customer_name: 'נועה פרידמן', customer_address: 'הגפן 21, חיפה' }),
    project({ id: '3', quote_number: 3, customer_name: null, customer_address: null }),
  ];

  it('returns every project for an empty or whitespace-only query', () => {
    expect(filterProjectsByQuery(projects, '')).toEqual(projects);
    expect(filterProjectsByQuery(projects, '   ')).toEqual(projects);
  });

  it('matches by a substring of the customer name', () => {
    expect(filterProjectsByQuery(projects, 'לוי')).toEqual([projects[0]]);
  });

  it('matches by a substring of the address', () => {
    expect(filterProjectsByQuery(projects, 'חיפה')).toEqual([projects[1]]);
  });

  it('matches by the quote number', () => {
    expect(filterProjectsByQuery(projects, '14')).toEqual([projects[0]]);
  });

  it('never throws on a project with no customer (null name/address)', () => {
    expect(filterProjectsByQuery(projects, '3')).toEqual([projects[2]]);
  });

  it('finds nothing for a query matching no project', () => {
    expect(filterProjectsByQuery(projects, 'שום דבר')).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('tallies every known status, including ones with zero matches', () => {
    const projects = [
      project({ status: 'draft' }),
      project({ status: 'draft' }),
      project({ status: 'sent' }),
      project({ status: 'accepted' }),
    ];
    expect(countByStatus(projects)).toEqual({ all: 4, draft: 2, sent: 1, accepted: 1, rejected: 0, archived: 0 });
  });

  it('returns all-zero counts for an empty list', () => {
    expect(countByStatus([])).toEqual({ all: 0, draft: 0, sent: 0, accepted: 0, rejected: 0, archived: 0 });
  });
});

describe('computeDashboardKpiStats', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');

  it('counts only "sent" quotes as open, summing their totals', () => {
    const projects = [
      project({ status: 'sent', total: 100 }),
      project({ status: 'sent', total: 50 }),
      project({ status: 'draft', total: 999 }),
      project({ status: 'accepted', total: 999 }),
    ];
    const stats = computeDashboardKpiStats(projects, now);
    expect(stats.openCount).toBe(2);
    expect(stats.openTotal).toBe(150);
  });

  it('splits approved totals into this-month vs last-month by created_at', () => {
    const projects = [
      project({ status: 'accepted', total: 100, created_at: '2026-10-01T00:00:00.000Z' }), // this month
      project({ status: 'accepted', total: 50, created_at: '2026-09-29T00:00:00.000Z' }), // last month
      project({ status: 'accepted', total: 999, created_at: '2026-08-15T00:00:00.000Z' }), // two months ago
      project({ status: 'draft', total: 999, created_at: '2026-10-01T00:00:00.000Z' }), // wrong status
    ];
    const stats = computeDashboardKpiStats(projects, now);
    expect(stats.approvedThisMonthTotal).toBe(100);
    expect(stats.approvedLastMonthTotal).toBe(50);
  });

  it('counts approved and rejected quotes regardless of date', () => {
    const projects = [
      project({ status: 'accepted', created_at: '2020-01-01T00:00:00.000Z' }),
      project({ status: 'rejected', created_at: '2020-01-01T00:00:00.000Z' }),
      project({ status: 'rejected' }),
    ];
    const stats = computeDashboardKpiStats(projects, now);
    expect(stats.approvedCount).toBe(1);
    expect(stats.rejectedCount).toBe(2);
  });

  it('returns all zeros for an empty list (the real-world "brand new account" case)', () => {
    const stats = computeDashboardKpiStats([project({ status: 'draft' })], now);
    expect(stats).toEqual({
      openTotal: 0,
      openCount: 0,
      approvedThisMonthTotal: 0,
      approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    });
  });
});

describe('closeRatePct', () => {
  it('is null when nothing has been answered yet (no approved or rejected quotes)', () => {
    expect(closeRatePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 0, approvedCount: 0, rejectedCount: 0 })).toBeNull();
  });

  it('is 100% when every answered quote was approved', () => {
    expect(closeRatePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 0, approvedCount: 3, rejectedCount: 0 })).toBe(100);
  });

  it('is 0% when every answered quote was rejected', () => {
    expect(closeRatePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 0, approvedCount: 0, rejectedCount: 3 })).toBe(0);
  });

  it('rounds to the nearest whole percent', () => {
    // 2 approved of 3 answered = 66.67% -> 67
    expect(closeRatePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 0, approvedCount: 2, rejectedCount: 1 })).toBe(67);
  });
});

describe('approvedMonthChangePct', () => {
  it('is null when last month had no approved total to compare against', () => {
    expect(
      approvedMonthChangePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 5, approvedLastMonthCount: 0, approvedCount: 0, rejectedCount: 0 })
    ).toBeNull();
  });

  it('is positive when this month is ahead of last month', () => {
    expect(
      approvedMonthChangePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 150, approvedLastMonthCount: 100, approvedCount: 0, rejectedCount: 0 })
    ).toBe(50);
  });

  it('is negative when this month is behind last month', () => {
    expect(
      approvedMonthChangePct({ openTotal: 0, openCount: 0, approvedThisMonthTotal: 0, approvedLastMonthTotal: 0, approvedThisMonthCount: 0, approvedLastMonthCount: 100, approvedCount: 0, rejectedCount: 0 })
    ).toBe(-100);
  });
});
