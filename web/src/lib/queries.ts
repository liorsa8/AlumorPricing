import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Business, ProjectListItem } from '../api/types';

// Shared by AppShell (for the sidebar's quote-count badge) and ProjectsListPage (for the table
// itself) — same queryKey/queryFn in one place, so react-query dedupes them into a single
// request/cache entry without each call site having to redeclare (and keep in sync) the fetch.
export function useProjectsQuery(businessId: string | undefined) {
  return useQuery({
    queryKey: ['projects', businessId],
    queryFn: () => api.get<ProjectListItem[]>(`/businesses/${businessId}/projects`),
  });
}

export function useBusinessQuery(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business', businessId],
    queryFn: () => api.get<Business>(`/businesses/${businessId}`),
  });
}
