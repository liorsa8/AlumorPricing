import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectDetail } from '../api/types';

vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('./download', () => ({ downloadBlob: vi.fn() }));

import html2canvas from 'html2canvas';
import { downloadBlob } from './download';
import { buildQuoteShareText, shareQuoteImage } from './shareQuote';

const project = {
  quote_number: 1,
  customer_name: 'לקוח בדיקה',
  total: 1746,
} as unknown as ProjectDetail;

function fakeCanvas(blob: Blob | null) {
  return { toBlob: (cb: (b: Blob | null) => void) => cb(blob) } as unknown as HTMLCanvasElement;
}

describe('buildQuoteShareText', () => {
  it('includes the customer name and the formatted total', () => {
    const { label, summary } = buildQuoteShareText(project);
    expect(label).toBe('הצעת מחיר #1');
    expect(summary).toContain('לקוח בדיקה');
    expect(summary).toContain('1,746.00');
  });

  it('omits the customer clause when there is no customer yet', () => {
    const { summary } = buildQuoteShareText({ ...project, customer_name: null } as ProjectDetail);
    expect(summary).not.toContain('עבור');
  });
});

// shareQuoteImage is the single "שתף" button's implementation. There's no way to target a
// specific app with a file from a web page — only a native share sheet can carry one — so on
// a phone this hands the image to that sheet and the person picks WhatsApp/Gmail/anything
// else themselves. Where Web Share isn't supported at all (mainly desktop), it falls back to
// downloading the image with a notice instead.
describe('shareQuoteImage', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.mocked(html2canvas).mockReset();
    vi.mocked(downloadBlob).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  });

  function stubNavigator(overrides: Partial<Navigator>) {
    Object.defineProperty(globalThis, 'navigator', { value: overrides, configurable: true });
  }

  it('downloads the image and returns a notice when the browser has no canShare at all', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas(new Blob(['x'])));
    stubNavigator({});

    const notice = await shareQuoteImage({} as HTMLElement, project);

    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(notice).toMatch(/לא נתמך/);
  });

  it('downloads the image and returns a notice when the browser cannot share files', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas(new Blob(['x'])));
    stubNavigator({ canShare: vi.fn().mockReturnValue(false) } as unknown as Navigator);

    const notice = await shareQuoteImage({} as HTMLElement, project);

    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(notice).toMatch(/לא נתמך/);
  });

  it('shares the rasterized quote as a file and returns null when supported', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas(new Blob(['x'])));
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ canShare: vi.fn().mockReturnValue(true), share } as unknown as Navigator);

    const notice = await shareQuoteImage({} as HTMLElement, project);

    expect(notice).toBeNull();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'הצעת מחיר #1' }));
  });

  it('treats a cancelled share sheet as done, not a failure', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas(new Blob(['x'])));
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    stubNavigator({
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(abortError),
    } as unknown as Navigator);

    const notice = await shareQuoteImage({} as HTMLElement, project);

    expect(notice).toBeNull();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('rethrows a real share failure instead of silently falling back', async () => {
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas(new Blob(['x'])));
    stubNavigator({
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Navigator);

    await expect(shareQuoteImage({} as HTMLElement, project)).rejects.toThrow('boom');
  });
});
