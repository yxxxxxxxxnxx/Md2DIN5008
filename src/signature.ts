const STORAGE_KEY = 'md2din5008:signature';
const TARGET_HEIGHT_PX = 354;

export function loadSignature(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSignature(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(STORAGE_KEY, dataUrl);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function trimSignature(source: CanvasImageSource, width: number, height: number): string | null {
  const scan = document.createElement('canvas');
  scan.width = width;
  scan.height = height;
  const ctx = scan.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const ink = d[i + 3] < 24 ? 0 : lum >= 235 ? 0 : lum <= 200 ? 1 : (235 - lum) / 35;
      d[i + 3] = Math.round(d[i + 3] * ink);
      if (d[i + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  ctx.putImageData(img, 0, 0);

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const scale = Math.min(1, TARGET_HEIGHT_PX / ch) || 1;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(scan, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export async function signatureFromFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 1200;
    const h = img.naturalHeight || 400;
    const limit = 2400 / Math.max(w, h);
    const s = Math.min(1, limit);
    return trimSignature(img, Math.round(w * s), Math.round(h * s));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawSignature(): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'sig-dialog';
    dialog.innerHTML = `
      <h3>Draw your signature</h3>
      <p class="sig-help">Use a mouse, trackpad, pen or finger.</p>
      <canvas class="sig-pad"></canvas>
      <div class="sig-actions">
        <button type="button" class="btn" data-act="clear">Clear</button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="button" class="btn primary" data-act="use">Use signature</button>
      </div>`;
    document.body.append(dialog);

    const canvas = dialog.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    let drawn = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      drawn = false;
    };

    let last: { x: number; y: number; w: number } | null = null;
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const p = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: 1.2 + p * 2.6 };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, last.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      drawn = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const events = e.getCoalescedEvents?.() ?? [e];
      for (const ev of events) {
        const p = pos(ev);
        ctx.lineWidth = (last.w + p.w) / 2;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last = p;
      }
    });
    const end = () => (last = null);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const close = (value: string | null | undefined) => {
      dialog.close();
      dialog.remove();
      window.removeEventListener('resize', resize);
      resolve(value);
    };

    dialog.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'clear') resize();
      if (act === 'cancel') close(undefined);
      if (act === 'use') close(drawn ? trimSignature(canvas, canvas.width, canvas.height) : null);
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(undefined);
    });

    dialog.showModal();
    resize();
    window.addEventListener('resize', resize);
  });
}
