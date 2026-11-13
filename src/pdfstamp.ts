import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

const PROBE_SCALE = 2;
const TARGET_DPI = 600;
const MAX_PIXELS = 12_000_000;
const PAD_PT = 0.5;
const LINK_PT = 8;

const STAMP_TEXT = [
  /^[A-ZÄÖÜ][A-ZÄÖÜß\s.\-/+&]*$/,
  /\d{2}\.\d{2}\.\d{2,4}/,
  /^\d+,\d{2}$/,
  /^[A-Z0-9]{2}(\s+[A-Z0-9]{2,5}){2,}$/,
  /Deutsche Post|DHL|Muster|Entgelt|Internetmarke/i,
];
const ANCHOR_TEXT = [/^IM$/, /\d{2}\.\d{2}\.\d{2,4}/];

type Rect = { x0: number; y0: number; x1: number; y1: number };

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

async function textRects(page: PDFPageProxy) {
  const content = await page.getTextContent();
  const keep: { str: string; rect: Rect }[] = [];
  const drop: Rect[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const [a, b, , , e, f] = item.transform;
    const size = Math.hypot(a, b) || item.height;
    const rect = { x0: e, y0: f - size * 0.25, x1: e + item.width, y1: f + size };
    if (STAMP_TEXT.some((re) => re.test(str))) keep.push({ str, rect });
    else drop.push(rect);
  }
  return { keep, drop };
}

function toViewport(viewport: PageViewport, r: Rect): Rect {
  const [x0, y0] = viewport.convertToViewportPoint(r.x0, r.y0);
  const [x1, y1] = viewport.convertToViewportPoint(r.x1, r.y1);
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

function whiteOut(ctx: CanvasRenderingContext2D, viewport: PageViewport, rects: Rect[]) {
  ctx.fillStyle = '#fff';
  for (const r of rects) {
    const v = toViewport(viewport, r);
    ctx.fillRect(v.x0 - 1, v.y0 - 1, v.x1 - v.x0 + 2, v.y1 - v.y0 + 2);
  }
}

function inkGrid(ctx: CanvasRenderingContext2D, width: number, height: number, cell: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const grid = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16 || (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225)) continue;
      grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = 1;
    }
  }
  return { grid, cols, rows };
}

function clusters(grid: Uint8Array, cols: number, rows: number, reach: number) {
  const label = new Int32Array(grid.length).fill(-1);
  const out: { cells: number; box: Rect }[] = [];
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || label[start] >= 0) continue;
    const id = out.length;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let cells = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const k = stack.pop()!;
      const cx = k % cols, cy = (k - cx) / cols;
      cells++;
      box.x0 = Math.min(box.x0, cx); box.y0 = Math.min(box.y0, cy);
      box.x1 = Math.max(box.x1, cx + 1); box.y1 = Math.max(box.y1, cy + 1);
      for (let y = Math.max(0, cy - reach); y <= Math.min(rows - 1, cy + reach); y++) {
        for (let x = Math.max(0, cx - reach); x <= Math.min(cols - 1, cx + reach); x++) {
          const n = y * cols + x;
          if (grid[n] && label[n] < 0) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
    }
    out.push({ cells, box });
  }
  return out;
}

function overlaps(a: Rect, b: Rect) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export async function pdfToStampPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const { keep, drop } = await textRects(page);

    const probe = page.getViewport({ scale: PROBE_SCALE });
    const p = canvas2d(Math.ceil(probe.width), Math.ceil(probe.height));
    await page.render({ canvas: p.canvas, canvasContext: p.ctx, viewport: probe }).promise;
    whiteOut(p.ctx, probe, drop);

    const { grid, cols, rows } = inkGrid(p.ctx, p.canvas.width, p.canvas.height, PROBE_SCALE);
    const groups = clusters(grid, cols, rows, LINK_PT);
    if (!groups.length) return null;

    const anchors = keep.filter((k) => ANCHOR_TEXT.some((re) => re.test(k.str))).map((k) => {
      const v = toViewport(probe, k.rect);
      return { x0: v.x0 / PROBE_SCALE, y0: v.y0 / PROBE_SCALE, x1: v.x1 / PROBE_SCALE, y1: v.y1 / PROBE_SCALE };
    });
    const anchored = groups.filter((g) => anchors.some((a) => overlaps(a, g.box)));
    const pick = (anchored.length ? anchored : groups).reduce((a, b) => (b.cells > a.cells ? b : a));

    const base = page.getViewport({ scale: 1 });
    const x = Math.max(0, pick.box.x0 - PAD_PT);
    const top = Math.max(0, pick.box.y0 - PAD_PT);
    const w = Math.min(base.width, pick.box.x1 + PAD_PT) - x;
    const h = Math.min(base.height, pick.box.y1 + PAD_PT) - top;

    const scale = Math.min(TARGET_DPI / 72, Math.sqrt(MAX_PIXELS / (w * h)));
    const view = page.getViewport({ scale, offsetX: -x * scale, offsetY: -top * scale });
    const out = canvas2d(Math.ceil(w * scale), Math.ceil(h * scale));
    await page.render({ canvas: out.canvas, canvasContext: out.ctx, viewport: view }).promise;
    whiteOut(out.ctx, view, drop);

    const blob = await new Promise<Blob | null>((resolve) => out.canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    await task.destroy();
  }
}
