import '@fontsource/source-code-pro/400.css';
import '@fontsource/source-code-pro/400-italic.css';
import '@fontsource/source-code-pro/700.css';
import './style.css';
import { buildTypst, parseMeta, splitFrontMatter } from './convert';
import { compilePdf, needsCjk } from './compiler';
import { createEditor, setDoc, setField } from './editor';
import { SKELETON } from './schema';
import { dataUrlToBytes, drawSignature, loadSignature, saveSignature, signatureFromFile } from './signature';

const STORAGE_KEY = 'md2din5008:source:v2';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const frame = $<HTMLIFrameElement>('#pdf-frame');
const statusEl = $<HTMLSpanElement>('#status');
const errorEl = $<HTMLPreElement>('#error');
const downloadBtn = $<HTMLButtonElement>('#download-pdf');

let pdfUrl: string | null = null;
let pdfName = 'letter.pdf';

function loadInitial(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SKELETON;
  } catch {
    return SKELETON;
  }
}
function persist(text: string) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
  }
}

const attached = new Map<string, Uint8Array>();
const fetched = new Map<string, Promise<Uint8Array>>();

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;

function extensionFor(ref: string, mime?: string): string {
  const m = ref.match(IMAGE_EXT);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (mime?.includes('svg')) return 'svg';
  if (mime?.includes('jpeg')) return 'jpg';
  if (mime?.includes('gif')) return 'gif';
  if (mime?.includes('webp')) return 'webp';
  return 'png';
}

async function resolveStamp(ref: string): Promise<{ path: string; bytes: Uint8Array } | undefined> {
  if (!ref) return undefined;
  const local = attached.get(ref);
  if (local) return { path: `/stamp.${extensionFor(ref)}`, bytes: local };
  if (!/^(https?:|data:)/i.test(ref)) {
    throw new Error(`Stamp image "${ref}" not found. Attach the file again with "Attach stamp image", or use a URL.`);
  }
  let p = fetched.get(ref);
  if (!p) {
    p = fetch(ref).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    fetched.set(ref, p);
    p.catch(() => fetched.delete(ref));
  }
  try {
    const mime = ref.startsWith('data:') ? ref.slice(5, ref.indexOf(';')) : undefined;
    return { path: `/stamp.${extensionFor(ref, mime)}`, bytes: await p };
  } catch (e) {
    throw new Error(`Could not load stamp image (${(e as Error).message}). The server may not allow cross-origin requests.`);
  }
}

let timer: number | undefined;
let generation = 0;
let cjkLoaded = false;

function setStatus(text: string, kind: 'busy' | 'ok' | 'err' = 'ok') {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(render, 350);
}

async function render() {
  const gen = ++generation;
  const text = editor.state.doc.toString();
  try {
    const meta = parseMeta(splitFrontMatter(text).yaml);
    const stamp = await resolveStamp(String(meta.stamp?.image ?? '').trim());
    if (gen !== generation) return;
    const files: Record<string, Uint8Array> = {};
    if (stamp) files[stamp.path] = stamp.bytes;
    if (signature) files[SIGNATURE_PATH] = signature;
    const { typst } = buildTypst(text, { stamp: stamp?.path, signature: signature ? SIGNATURE_PATH : undefined });
    setStatus(needsCjk(typst) && !cjkLoaded ? 'Loading CJK fonts…' : 'Compiling…', 'busy');
    const pdf = await compilePdf(typst, files);
    if (needsCjk(typst)) cjkLoaded = true;
    if (gen !== generation) return;
    errorEl.hidden = true;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
    frame.src = pdfUrl + '#view=FitH';
    const subject = String(meta.subject ?? '').trim();
    pdfName = (subject ? subject.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) : 'letter') + '.pdf';
    downloadBtn.disabled = false;
    setStatus(`Done · ${(pdf.byteLength / 1024).toFixed(0)} KB`);
  } catch (e) {
    if (gen !== generation) return;
    console.error(e);
    const msg = typeof e === 'string' ? e : ((e as Error).message ?? String(e));
    showError((e as Error)?.name === 'YAMLParseError' ? 'Front matter error: ' + msg : msg);
  }
}

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  setStatus('Error', 'err');
}

const editor = createEditor($('#editor'), loadInitial(), (text) => {
  persist(text);
  schedule();
});

const SIGNATURE_PATH = '/signature.png';
const sigButton = $<HTMLButtonElement>('#signature-btn');
const sigRemove = $<HTMLButtonElement>('#signature-remove');
let signature: Uint8Array | null = null;

function setSignature(dataUrl: string | null) {
  signature = dataUrl ? dataUrlToBytes(dataUrl) : null;
  saveSignature(dataUrl);
  sigButton.textContent = signature ? 'Signature ✓' : 'Signature';
  sigRemove.hidden = !signature;
  schedule();
}
setSignature(loadSignature());

const closeMenu = () => (document.activeElement as HTMLElement | null)?.blur();

$<HTMLInputElement>('#signature-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  closeMenu();
  if (!file) return;
  try {
    const trimmed = await signatureFromFile(file);
    if (trimmed) setSignature(trimmed);
    else showError('No signature found in the image: it looks empty or too light.');
  } catch {
    showError(`Could not read "${file.name}" as an image.`);
  }
});

$<HTMLButtonElement>('#signature-draw').addEventListener('click', async () => {
  closeMenu();
  const result = await drawSignature();
  if (result !== undefined) setSignature(result);
});

sigRemove.addEventListener('click', () => {
  closeMenu();
  setSignature(null);
});

$<HTMLInputElement>('#open-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  setDoc(editor, await file.text());
  input.value = '';
});

$<HTMLInputElement>('#stamp-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  attached.set(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!setField(editor, 'stamp.image', file.name)) {
    showError('No "stamp: image:" line found in the front matter. Add it, then attach the file again.');
  }
  input.value = '';
});

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

$<HTMLButtonElement>('#new-letter').addEventListener('click', () => {
  if (confirm('Replace the current letter with an empty template?')) setDoc(editor, SKELETON);
});

$<HTMLButtonElement>('#save-md').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([editor.state.doc.toString()], { type: 'text/markdown' }));
  download(url, pdfName.replace(/\.pdf$/, '.md'));
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

downloadBtn.addEventListener('click', () => {
  if (pdfUrl) download(pdfUrl, pdfName);
});

render();
