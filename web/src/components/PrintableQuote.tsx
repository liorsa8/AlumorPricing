import { forwardRef } from 'react';
import { ProjectDetail, Business } from '../api/types';
import { formatCurrency, formatDate } from '../lib/format';
import '../styles/print.css';

interface PrintableQuoteProps {
  project: ProjectDetail;
  settings: Business | undefined;
}

// Pure presentational quote layout — used both for the read-only /print preview page and,
// rendered off-screen, as the source node captured into an image for sharing. Keeping this
// as one component means both call sites always render byte-for-byte the same quote.
const PrintableQuote = forwardRef<HTMLDivElement, PrintableQuoteProps>(function PrintableQuote(
  { project, settings },
  ref
) {
  const companyLine = [settings?.company_phone, settings?.company_email, settings?.company_address]
    .filter(Boolean)
    .join(' · ');
  const taxIdLine = settings?.company_tax_id ? `ח.פ / עוסק מורשה: ${settings.company_tax_id}` : '';
  const termsLines = settings?.standard_terms ? settings.standard_terms.split('\n').filter(Boolean) : [];

  // Line prices shown on the quote must already include labor + installation (and reflect
  // any discount), so they sum to the "לפני מע"מ" total below — a raw material-only price
  // per line would not reconcile with the quote's bottom line.
  const markupFactor = 1 + (project.labor_pct_snapshot + project.installation_pct_snapshot) / 100;
  const discountFactor = 1 - project.discount_pct / 100;
  const lineDisplayFactor = markupFactor * discountFactor;

  return (
    <div className="print-page" ref={ref}>
      <div className="print-header">
        {settings?.company_logo && (
          <div className="print-logo">
            <img src={settings.company_logo} alt={settings.company_name || 'לוגו'} />
          </div>
        )}
        <div className="print-header-row">
          <div className="print-date">{formatDate(project.created_at)}</div>
          {project.customer_name && <div className="print-recipient">לכבוד: {project.customer_name}</div>}
        </div>

        <h1 className="print-title">הצעת מחיר מס' {project.quote_number}</h1>

        <div className="print-header-row print-meta">
          <div>
            {settings?.company_name && <div>{settings.company_name}</div>}
            {companyLine && <div>{companyLine}</div>}
            {taxIdLine && <div>{taxIdLine}</div>}
          </div>
          {project.title && <div>באתר: {project.title}</div>}
        </div>
      </div>

      <div className="print-table-wrap">
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
      </div>

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
  );
});

export default PrintableQuote;
