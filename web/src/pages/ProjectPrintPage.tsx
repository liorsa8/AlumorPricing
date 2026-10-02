import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectDetail, Business } from '../api/types';
import PrintableQuote from '../components/PrintableQuote';

// Pure, read-only preview — no buttons or interactive controls of any kind. All actions
// (print, share, WhatsApp, Gmail) live on ProjectDetailPage; this page only ever renders
// the quote itself, either for the shop owner to look at or via ?autoprint=1 to open
// straight into the OS print dialog.
export default function ProjectPrintPage() {
  const { businessId, id } = useParams<{ businessId: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoprint = searchParams.get('autoprint') === '1';

  const { data: project } = useQuery({
    queryKey: ['project', businessId, id],
    queryFn: () => api.get<ProjectDetail>(`/businesses/${businessId}/projects/${id}`),
  });
  const { data: business } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => api.get<Business>(`/businesses/${businessId}`),
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

  return (
    <>
      <div className="print-back-bar">
        <button type="button" className="btn" onClick={() => navigate(`/b/${businessId}/projects/${id}`)}>
          ← חזרה
        </button>
      </div>
      <PrintableQuote project={project} settings={business} />
    </>
  );
}
