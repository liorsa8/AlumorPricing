import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ProjectDetail, Settings } from '../api/types';
import { formatCurrency, formatDate } from '../lib/format';
import '../styles/print.css';

export default function ProjectPrintPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

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

  if (!project) return <div style={{ padding: 32 }}>טוען...</div>;

  const companyLine = [settings?.company_phone, settings?.company_address].filter(Boolean).join(' · ');
  const termsLines = settings?.standard_terms ? settings.standard_terms.split('\n').filter(Boolean) : [];

  // Line prices shown on the printed quote must already include labor + installation
  // (and reflect any discount), so they sum to the "לפני מע"מ" total below — a raw
  // material-only price per line would not reconcile with the quote's bottom line.
  const markupFactor = 1 + (project.labor_pct_snapshot + project.installation_pct_snapshot) / 100;
  const discountFactor = 1 - project.discount_pct / 100;
  const lineDisplayFactor = markupFactor * discountFactor;

  return (
    <div>
      <div className="print-actions">
        <button className="btn btn-primary" onClick={() => window.print()}>
          הדפס / שמור כ-PDF
        </button>
      </div>

      <div className="print-page">
        <div className="print-header">
          <div className="print-header-row">
            <div className="print-date">{formatDate(project.created_at)}</div>
            {project.customer_name && <div className="print-recipient">לכבוד: {project.customer_name}</div>}
          </div>

          <h1 className="print-title">הצעת מחיר מס' {project.quote_number}</h1>

          <div className="print-header-row print-meta">
            <div>
              {settings?.company_name && <div>{settings.company_name}</div>}
              {companyLine && <div>{companyLine}</div>}
            </div>
            {project.title && <div>באתר: {project.title}</div>}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>תיאור</th>
              <th>סדרה</th>
              <th>זכוכית</th>
              <th>גובה (מ"מ)</th>
              <th>רוחב (מ"מ)</th>
              <th>כמות</th>
              <th>מחיר ליח'</th>
              <th>סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {project.openings.map((o, idx) => (
              <tr key={o.id}>
                <td>{idx + 1}</td>
                <td>
                  {o.opening_type_name_snapshot}
                  {o.label ? ` – ${o.label}` : ''}
                </td>
                <td>{o.profile_system_series_code_snapshot || o.profile_system_name_snapshot}</td>
                <td>{o.glass_type_name_snapshot}</td>
                <td>{o.height_mm}</td>
                <td>{o.width_mm}</td>
                <td>{o.quantity}</td>
                <td>{formatCurrency(o.unit_subtotal * lineDisplayFactor)}</td>
                <td>{formatCurrency(o.line_subtotal * lineDisplayFactor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-totals">
          <table>
            <tbody>
              <tr>
                <td>לפני מע"מ</td>
                <td>{formatCurrency(project.pre_vat_total)}</td>
              </tr>
              <tr>
                <td>מע"מ ({project.vat_pct_snapshot}%)</td>
                <td>{formatCurrency(project.vat_amount)}</td>
              </tr>
              <tr className="grand-total">
                <td>סה"כ לתשלום</td>
                <td>{formatCurrency(project.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {project.notes && (
          <>
            <div className="print-section-title">הערות להצעה זו</div>
            <p>{project.notes}</p>
          </>
        )}

        {termsLines.length > 0 && (
          <>
            <div className="print-section-title">תנאים כלליים</div>
            <ol className="print-terms">
              {termsLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
