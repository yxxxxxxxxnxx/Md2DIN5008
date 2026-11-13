import '@fontsource/source-code-pro/400.css';
import '@fontsource/source-code-pro/400-italic.css';
import '@fontsource/source-code-pro/700.css';
import './style.css';
import { buildTypst, parseMeta, splitFrontMatter } from './convert';
import { compilePdf, needsCjk } from './compiler';
import { createEditor, refreshHints, setDoc, setField } from './editor';
import { getLang, onLangChange, setLang as applyLang, t, translateDom, type Lang } from './i18n';
import { createForm } from './form';
import { SKELETON } from './schema';
import { migratePersonalData, sessionGet, sessionSet } from './storage';
import { dataUrlToBytes, drawSignature, loadSignature, saveSignature, signatureFromFile } from './signature';

const STORAGE_KEY = 'md2din5008:source:v2';
migratePersonalData();

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const frame = $<HTMLIFrameElement>('#pdf-frame');
const statusEl = $<HTMLSpanElement>('#status');
const errorEl = $<HTMLPreElement>('#error');
const downloadBtn = $<HTMLButtonElement>('#download-pdf');

let pdfUrl: string | null = null;
let pdfName = 'letter.pdf';

function loadInitial(): string {
  return sessionGet(STORAGE_KEY) ?? SKELETON;
}
function persist(text: string) {
  sessionSet(STORAGE_KEY, text);
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

const LOGO_KEY = 'md2din5008:logo';

function bytesToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
  });
}

function restoreLogo() {
  try {
    const saved = JSON.parse(sessionGet(LOGO_KEY) ?? 'null') as { name: string; dataUrl: string } | null;
    if (saved?.name && saved.dataUrl) attached.set(saved.name, dataUrlToBytes(saved.dataUrl));
  } catch {
  }
}
restoreLogo();

async function resolveImage(ref: string, kind: 'stamp' | 'logo', menuHint: string): Promise<{ path: string; bytes: Uint8Array } | undefined> {
  if (!ref) return undefined;
  const local = attached.get(ref);
  if (local) return { path: `/${kind}.${extensionFor(ref)}`, bytes: local };
  if (!/^(https?:|data:)/i.test(ref)) {
    throw new Error(t('err.imageMissing', { ref, menu: menuHint }));
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
    return { path: `/${kind}.${extensionFor(ref, mime)}`, bytes: await p };
  } catch (e) {
    throw new Error(t('err.imageLoad', { ref, reason: (e as Error).message }));
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
    const [stamp, logo] = await Promise.all([
      resolveImage(String(meta.stamp?.image ?? '').trim(), 'stamp', t('menuPath.stamp')),
      resolveImage(String(meta.letterhead?.image ?? '').trim(), 'logo', t('menuPath.logo')),
    ]);
    if (gen !== generation) return;
    const files: Record<string, Uint8Array> = {};
    if (stamp) files[stamp.path] = stamp.bytes;
    if (logo) files[logo.path] = logo.bytes;
    if (signature) files[SIGNATURE_PATH] = signature;
    const { typst } = buildTypst(text, { stamp: stamp?.path, logo: logo?.path, signature: signature ? SIGNATURE_PATH : undefined });
    setStatus(needsCjk(typst) && !cjkLoaded ? t('status.cjk') : t('status.compiling'), 'busy');
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
    setStatus(`${t('status.done')} · ${(pdf.byteLength / 1024).toFixed(0)} KB`);
  } catch (e) {
    if (gen !== generation) return;
    console.error(e);
    const msg = typeof e === 'string' ? e : ((e as Error).message ?? String(e));
    showError((e as Error)?.name === 'YAMLParseError' ? t('err.frontMatter', { msg }) : msg);
  }
}

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  setStatus(t('status.error'), 'err');
}

const MODE_KEY = 'md2din5008:mode';
const LANG_KEY = 'md2din5008:lang';
const editorEl = $<HTMLDivElement>('#editor');
const formEl = $<HTMLFormElement>('#letter-form');
const modeToggle = $<HTMLInputElement>('#mode-toggle');
const langToggle = $<HTMLInputElement>('#lang-toggle');
let fromForm = false;

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
}

applyLang(readPref(LANG_KEY) === 'de' ? 'de' : 'en');
translateDom();
document.documentElement.lang = getLang();

const editor = createEditor(editorEl, loadInitial(), (text) => {
  persist(text);
  if (!fromForm && !formEl.hidden) form.load(text);
  schedule();
});

const onFormChange = (text: string) => {
  fromForm = true;
  setDoc(editor, text);
  fromForm = false;
};
let form = createForm(formEl, onFormChange);

function setMode(mode: 'markdown' | 'form') {
  const isForm = mode === 'form';
  modeToggle.checked = isForm;
  if (isForm) form.load(editor.state.doc.toString());
  formEl.hidden = !isForm;
  editorEl.hidden = isForm;
  writePref(MODE_KEY, mode);
}
for (const toggle of document.querySelectorAll<HTMLLabelElement>('label.toggle')) {
  const input = toggle.querySelector('input')!;
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    const choice = (e.target as HTMLElement).closest<HTMLElement>('[data-value]')?.dataset.value;
    const next = choice ? choice === 'on' : !input.checked;
    if (next === input.checked) return;
    input.checked = next;
    input.dispatchEvent(new Event('change'));
  });
}

modeToggle.addEventListener('change', () => setMode(modeToggle.checked ? 'form' : 'markdown'));
setMode(readPref(MODE_KEY) === 'form' ? 'form' : 'markdown');

onLangChange(() => {
  translateDom();
  document.documentElement.lang = getLang();
  form = createForm(formEl, onFormChange);
  if (!formEl.hidden) form.load(editor.state.doc.toString());
  refreshHints(editor);
  schedule();
});

function setLang(lang: Lang) {
  langToggle.checked = lang === 'de';
  document.documentElement.dataset.uiLang = lang;
  writePref(LANG_KEY, lang);
  applyLang(lang);
}
langToggle.addEventListener('change', () => setLang(langToggle.checked ? 'de' : 'en'));
setLang(getLang());

const SIGNATURE_PATH = '/signature.png';
const sigButton = $<HTMLButtonElement>('#signature-btn');
const sigRemove = $<HTMLButtonElement>('#signature-remove');
let signature: Uint8Array | null = null;

function setSignature(dataUrl: string | null) {
  signature = dataUrl ? dataUrlToBytes(dataUrl) : null;
  saveSignature(dataUrl);
  sigRemove.hidden = !signature;
  schedule();
}
setSignature(loadSignature());

const sigDialog = $<HTMLDialogElement>('#signature-dialog');
const closeMenu = () => {
  if (sigDialog.open) sigDialog.close();
  (document.activeElement as HTMLElement | null)?.blur();
};
sigButton.addEventListener('click', () => sigDialog.showModal());
$<HTMLButtonElement>('#signature-cancel').addEventListener('click', closeMenu);
sigDialog.addEventListener('click', (e) => {
  const r = sigDialog.getBoundingClientRect();
  const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  if (e.target === sigDialog && outside) closeMenu();
});

$<HTMLInputElement>('#signature-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  closeMenu();
  if (!file) return;
  try {
    const trimmed = await signatureFromFile(file);
    if (trimmed) setSignature(trimmed);
    else showError(t('err.noSignature'));
  } catch {
    showError(t('err.readImage', { name: file.name }));
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

$<HTMLInputElement>('#logo-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  (document.activeElement as HTMLElement | null)?.blur();
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  attached.set(file.name, bytes);
  sessionSet(LOGO_KEY, JSON.stringify({ name: file.name, dataUrl: await bytesToDataUrl(bytes, file.type || 'image/png') }));
  if (!setField(editor, 'letterhead.image', file.name)) {
    showError(t('err.noLogoLine'));
  }
});

$<HTMLInputElement>('#stamp-file').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  attached.set(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!setField(editor, 'stamp.image', file.name)) {
    showError(t('err.noStampLine'));
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
  if (confirm(t('confirm.new'))) setDoc(editor, SKELETON);
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
