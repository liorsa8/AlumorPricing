import html2canvas from 'html2canvas';
import { ProjectDetail } from '../api/types';
import { formatCurrency } from './format';

export function buildQuoteShareText(project: ProjectDetail): { label: string; summary: string } {
  const label = `הצעת מחיר #${project.quote_number}`;
  const summary = `${label}${project.customer_name ? ` עבור ${project.customer_name}` : ''} — סה"כ לתשלום ${formatCurrency(
    project.total
  )}`;
  return { label, summary };
}

// Rasterizes the given (already correctly RTL-shaped) quote node via html2canvas — this
// captures the browser's own text layout as pixels rather than re-typesetting text through
// a PDF library, which is how this stays Hebrew/bidi-safe. Returns a user-facing notice
// string when it had to fall back to a plain download, or null on a native share / cancel.
export async function shareQuoteImage(node: HTMLElement, project: ProjectDetail): Promise<string | null> {
  const { label, summary } = buildQuoteShareText(project);
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('image generation failed');
  const file = new File([blob], `${label}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: label, text: summary });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null;
      throw err;
    }
    return null;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  return 'שיתוף ישיר לא נתמך בדפדפן זה — התמונה הורדה, ניתן לצרף אותה ידנית בוואטסאפ או ב-Gmail.';
}

export function openWhatsAppShare(project: ProjectDetail) {
  const { summary } = buildQuoteShareText(project);
  window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
}

export function openGmailShare(project: ProjectDetail) {
  const { label, summary } = buildQuoteShareText(project);
  const params = new URLSearchParams({ view: 'cm', fs: '1', su: label, body: summary });
  window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank');
}
