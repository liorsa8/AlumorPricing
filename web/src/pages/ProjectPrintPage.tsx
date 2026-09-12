import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectDetail, Settings } from '../api/types';
import PrintableQuote from '../components/PrintableQuote';

// Pure, read-only preview — no buttons or interactive controls of any kind. All actions
// (print, share, WhatsApp, Gmail) live on ProjectDetailPage; this page only ever renders
// the quote itself, either for the shop owner to look at or via ?autoprint=1 to open
// straight into the OS print dialog.
export default function ProjectPrintPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const [searchParams] = useSearchParams();
  const autoprint = searchParams.get('autoprint') === '1';

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${projectId}`),
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/api/settings'),
  });

  useEffect(() => {
    document.title = project ? `הצעת מחיר #${project.quote_number}` : 'הצעת מחיר';
  }, [project]);

  useEffect(() => {
    if (!autoprint || !project) return;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [autoprint, project]);

  if (!project) return <div style={{ padding: 32 }}>טוען...</div>;

  return <PrintableQuote project={project} settings={settings} />;
}
