import html2canvas from 'html2canvas';
import { ProjectDetail } from '../api/types';
import { formatCurrency } from './format';
import { downloadBlob } from './download';

export function buildQuoteShareText(project: ProjectDetail): { label: string; summary: string } {
  const label = `הצעת מחיר #${project.quote_number}`;
  const summary = `${label}${project.customer_name ? ` עבור ${project.customer_name}` : ''} — סה"כ לתשלום ${formatCurrency(
    project.total
  )}`;
  return { label, summary };
}

// Rasterizes the given (already correctly RTL-shaped) quote node via html2canvas — this
// captures the browser's own text layout as pixels rather than re-typesetting text through
// a PDF library, which is how this stays Hebrew/bidi-safe — then hands the image to the OS
// share sheet via the Web Share API, so the person can pick WhatsApp, Gmail, or anything else
// installed and send it as a real attachment. There's no way for a web page to attach a file
// directly into one specific app — wa.me/Gmail-compose links only ever carry text, that's a
// hard platform limitation — a native share sheet is the only mechanism that can hand over an
// actual file at all, which is also why this is one "שתף" button and not one per app: they'd
// all just open the same sheet anyway.
// Falls back to downloading the image (with a notice to attach it manually) where Web Share
// isn't supported, mainly desktop browsers. Returns null on a native share / cancel, or the
// notice string when it had to fall back to a download.
export async function shareQuoteImage(node: HTMLElement, project: ProjectDetail): Promise<string | null> {
  const { label, summary } = buildQuoteShareText(project);
  // scale: 3, not 2 — WhatsApp recompresses images sent as "photos" (lossy, quality-reduced),
  // which hits fine text hardest. A higher-resolution source before that compression holds up
  // noticeably better than one already sitting right at WhatsApp's typical downscale target.
  const canvas = await html2canvas(node, { scale: 3, backgroundColor: '#ffffff' });
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

  downloadBlob(blob, file.name);
  return 'שיתוף ישיר לא נתמך בדפדפן זה — התמונה הורדה, ניתן לצרף אותה ידנית בוואטסאפ או ב-Gmail.';
}
