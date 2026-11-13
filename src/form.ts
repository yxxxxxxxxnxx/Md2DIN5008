import { Document, stringify } from 'yaml';
import { parseMeta, splitFrontMatter, type LetterMeta } from './convert';
import { FIELDS, hintText } from './schema';
import { t, type MessageKey } from './i18n';

interface FormState {
  form: string;
  letterheadImage: string;
  letterheadText: string;
  returnName: string;
  returnStreet: string;
  returnZip: string;
  returnCity: string;
  stampImage: string;
  stampCode: string;
  firm: string;
  recipientName: string;
  recipientStreet: string;
  recipientZip: string;
  recipientCity: string;
  info: { label: string; value: string }[];
  city: string;
  date: string;
  subject: string;
  footer: string[];
  body: string;
}

const s = (v: unknown) => (v == null ? '' : String(v));

function stateFromText(text: string): FormState {
  const { yaml, body } = splitFrontMatter(text);
  let m: LetterMeta = {};
  try {
    m = parseMeta(yaml);
  } catch {
    m = {};
  }
  const info: FormState['info'] = [];
  for (const item of Array.isArray(m.infoBlock) ? m.infoBlock : []) {
    if (item == null || item === '') continue;
    if (typeof item === 'string') info.push({ label: '', value: item });
    else for (const [label, value] of Object.entries(item)) info.push({ label, value: s(value) });
  }
  const footer = (Array.isArray(m.footer) ? m.footer : [])
    .map((c) => (Array.isArray(c) ? c.map(s).join('\n') : s(c)))
    .filter((c) => c.trim() !== '')
    .slice(0, 3);
  return {
    form: s(m.form).toUpperCase() === 'A' ? 'A' : s(m.form).toUpperCase() === 'B' ? 'B' : '',
    letterheadImage: s(m.letterhead?.image),
    letterheadText: s(m.letterhead?.text),
    returnName: s(m.return?.name),
    returnStreet: s(m.return?.address?.street),
    returnZip: s(m.return?.address?.ZIPcode),
    returnCity: s(m.return?.address?.city),
    stampImage: s(m.stamp?.image),
    stampCode: s(m.stamp?.code),
    firm: s(m.recipient?.firm),
    recipientName: s(m.recipient?.name),
    recipientStreet: s(m.recipient?.address?.street),
    recipientZip: s(m.recipient?.address?.ZIPcode),
    recipientCity: s(m.recipient?.address?.city),
    info,
    city: s(m.city),
    date: s(m.date),
    subject: s(m.subject),
    footer,
    body: body.replace(/^\n+/, ''),
  };
}

function scalar(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return ' ' + stringify(t, { schema: 'failsafe', lineWidth: 0 }).trimEnd();
}

function flowList(items: string[]): string {
  const doc = new Document(items, { schema: 'failsafe' });
  (doc.contents as { flow?: boolean }).flow = true;
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
}

function textFromState(st: FormState): string {
  const info = st.info.filter((e) => e.label.trim() || e.value.trim());
  const infoLines = info.length
    ? info.map((e) => '  - ' + stringify({ [e.label.trim() || 'Info']: e.value.trim() }, { schema: 'failsafe', lineWidth: 0 }).trimEnd())
    : ['  -'];
  const cols = st.footer.map((c) => c.split('\n').map((l) => l.trim()).filter(Boolean)).filter((c) => c.length);
  const footerLines = cols.length
    ? cols.map((c) => '  - ' + (c.length === 1 ? scalar(c[0]).trimStart() : flowList(c)))
    : ['  -'];
  return [
    '---',
    `form:${scalar(st.form)}`,
    '',
    'letterhead:',
    `  image:${scalar(st.letterheadImage)}`,
    `  text:${scalar(st.letterheadText)}`,
    '',
    'return:',
    `  name:${scalar(st.returnName)}`,
    '  address:',
    `    street:${scalar(st.returnStreet)}`,
    `    ZIPcode:${scalar(st.returnZip)}`,
    `    city:${scalar(st.returnCity)}`,
    '',
    'stamp:',
    `  image:${scalar(st.stampImage)}`,
    `  code:${scalar(st.stampCode)}`,
    '',
    'recipient:',
    `  firm:${scalar(st.firm)}`,
    `  name:${scalar(st.recipientName)}`,
    '  address:',
    `    street:${scalar(st.recipientStreet)}`,
    `    ZIPcode:${scalar(st.recipientZip)}`,
    `    city:${scalar(st.recipientCity)}`,
    '',
    'infoBlock:',
    ...infoLines,
    '',
    `city:${scalar(st.city)}`,
    `date:${scalar(st.date)}`,
    '',
    `subject:${scalar(st.subject)}`,
    '',
    'footer:',
    ...footerLines,
    '---',
    '',
    st.body,
  ].join('\n');
}

type Key = Exclude<keyof FormState, 'info' | 'footer'>;

const SECTIONS: { title: MessageKey; path?: string; fields: { key: Key; label: MessageKey; path: string; wide?: boolean; select?: boolean }[] }[] = [
  { title: 'form.layout', fields: [{ key: 'form', label: 'field.form', path: 'form', select: true, wide: true }] },
  {
    title: 'form.letterhead', path: 'letterhead',
    fields: [
      { key: 'letterheadImage', label: 'field.logoImage', path: 'letterhead.image', wide: true },
      { key: 'letterheadText', label: 'field.logoText', path: 'letterhead.text', wide: true },
    ],
  },
  {
    title: 'form.return',
    fields: [
      { key: 'returnName', label: 'field.name', path: 'return.name', wide: true },
      { key: 'returnStreet', label: 'field.street', path: 'return.address.street', wide: true },
      { key: 'returnZip', label: 'field.zip', path: 'return.address.ZIPcode' },
      { key: 'returnCity', label: 'field.city', path: 'return.address.city' },
    ],
  },
  {
    title: 'form.stamp', path: 'stamp',
    fields: [
      { key: 'stampImage', label: 'field.image', path: 'stamp.image', wide: true },
      { key: 'stampCode', label: 'field.code', path: 'stamp.code', wide: true },
    ],
  },
  {
    title: 'form.recipient',
    fields: [
      { key: 'firm', label: 'field.firm', path: 'recipient.firm', wide: true },
      { key: 'recipientName', label: 'field.name', path: 'recipient.name', wide: true },
      { key: 'recipientStreet', label: 'field.street', path: 'recipient.address.street', wide: true },
      { key: 'recipientZip', label: 'field.zip', path: 'recipient.address.ZIPcode' },
      { key: 'recipientCity', label: 'field.city', path: 'recipient.address.city' },
    ],
  },
];

const SECTIONS_AFTER_INFO: typeof SECTIONS = [
  {
    title: 'form.date',
    fields: [
      { key: 'city', label: 'field.city', path: 'city' },
      { key: 'date', label: 'field.date', path: 'date' },
    ],
  },
  { title: 'form.subject', fields: [{ key: 'subject', label: 'field.subject', path: 'subject', wide: true }] },
];

function placeholder(path: string): string {
  return hintText(path, t);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

export interface LetterForm {
  load(text: string): void;
}

export function createForm(container: HTMLElement, onChange: (text: string) => void): LetterForm {
  let state = stateFromText('');
  const inputs = new Map<Key, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const infoList = el('div', { className: 'f-rows' });
  const footerList = el('div', { className: 'f-cols' });
  const addFooter = el('button', { type: 'button', className: 'f-btn f-add', textContent: t('button.addColumn') });
  const addInfo = el('button', { type: 'button', className: 'f-btn f-add', textContent: t('button.addEntry') });

  const emit = () => onChange(textFromState(state));

  const markRequired = (input: HTMLElement, path: string) => {
    if (!FIELDS[path]?.required) return;
    input.addEventListener('blur', () => {
      const v = (input as HTMLInputElement).value.trim();
      input.closest('.f-field')?.classList.toggle('missing', v === '');
    });
    input.addEventListener('input', () => {
      if ((input as HTMLInputElement).value.trim()) input.closest('.f-field')?.classList.remove('missing');
    });
  };

  const field = (f: (typeof SECTIONS)[number]['fields'][number]) => {
    let input: HTMLInputElement | HTMLSelectElement;
    if (f.select) {
      input = el('select', {},
        el('option', { value: '', textContent: placeholder(f.path) }),
        el('option', { value: 'A', textContent: t('field.formA') }),
        el('option', { value: 'B', textContent: t('field.formB') }));
    } else {
      input = el('input', { type: 'text', placeholder: placeholder(f.path), spellcheck: false });
    }
    input.addEventListener(f.select ? 'change' : 'input', () => {
      state[f.key] = input.value;
      emit();
    });
    markRequired(input, f.path);
    inputs.set(f.key, input);
    const label = FIELDS[f.path]?.required ? `${t(f.label)}*` : t(f.label);
    return el('label', { className: 'f-field' + (f.wide ? ' wide' : '') + (f.select ? ' f-select' : '') }, el('span', { textContent: label }), input);
  };

  const section = (title: MessageKey, path: string | undefined, ...body: Node[]) => {
    const legend = el('legend', {}, t(title));
    if (path && FIELDS[path]?.optional) legend.append(' ', el('span', { className: 'f-optional', textContent: t('hint.optional') }));
    return el('fieldset', { className: 'f-section' }, legend, ...body);
  };

  const grid = (fields: (typeof SECTIONS)[number]['fields']) => el('div', { className: 'f-grid' }, ...fields.map(field));

  const renderInfo = () => {
    infoList.replaceChildren(
      ...state.info.map((entry, i) => {
        const label = el('input', { type: 'text', placeholder: t('field.label'), value: entry.label, spellcheck: false });
        const value = el('input', { type: 'text', placeholder: t('field.value'), value: entry.value, spellcheck: false });
        const remove = el('button', { type: 'button', className: 'f-btn f-remove', textContent: '×', title: t('button.removeEntry'), ariaLabel: t('button.removeEntry') });
        label.addEventListener('input', () => { entry.label = label.value; emit(); });
        value.addEventListener('input', () => { entry.value = value.value; emit(); });
        remove.addEventListener('click', () => { state.info.splice(i, 1); renderInfo(); emit(); });
        return el('div', { className: 'f-row' }, label, value, remove);
      }),
    );
  };

  const renderFooter = () => {
    footerList.replaceChildren(
      ...state.footer.map((col, i) => {
        const area = el('textarea', { rows: 3, placeholder: t('field.footerLines'), value: col, spellcheck: false });
        const remove = el('button', { type: 'button', className: 'f-btn f-remove', textContent: '×', title: t('button.removeColumn'), ariaLabel: t('button.removeColumn') });
        area.addEventListener('input', () => { state.footer[i] = area.value; emit(); });
        remove.addEventListener('click', () => { state.footer.splice(i, 1); renderFooter(); emit(); });
        return el('div', { className: 'f-col' }, el('div', { className: 'f-col-head' }, el('span', { textContent: t('field.column', { n: i + 1 }) }), remove), area);
      }),
    );
    addFooter.disabled = state.footer.length >= 3;
  };

  addInfo.addEventListener('click', () => {
    state.info.push({ label: '', value: '' });
    renderInfo();
    (infoList.lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus();
  });
  addFooter.addEventListener('click', () => {
    if (state.footer.length >= 3) return;
    state.footer.push('');
    renderFooter();
    (footerList.lastElementChild?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
  });

  const body = el('textarea', { className: 'f-body', placeholder: `(${t('hint.body')})`, spellcheck: true, rows: 3 });
  const fitBody = () => {
    if (!body.isConnected) return window.removeEventListener('resize', fitBody);
    if (!body.offsetParent) return;
    body.style.height = 'auto';
    const max = window.innerHeight * 0.75;
    const needed = body.scrollHeight + (body.offsetHeight - body.clientHeight);
    body.style.height = `${Math.min(needed, max)}px`;
    body.style.overflowY = needed > max ? 'auto' : 'hidden';
  };
  window.addEventListener('resize', fitBody);
  body.addEventListener('input', () => {
    fitBody();
    state.body = body.value;
    emit();
  });

  container.replaceChildren(
    ...SECTIONS.map((sec) => section(sec.title, sec.path, grid(sec.fields))),
    section('form.info', 'infoBlock', infoList, addInfo),
    ...SECTIONS_AFTER_INFO.map((sec) => section(sec.title, sec.path, grid(sec.fields))),
    section('form.body', undefined, body),
    section('form.footer', 'footer', footerList, addFooter),
  );

  return {
    load(text: string) {
      state = stateFromText(text);
      const active = document.activeElement;
      for (const [key, input] of inputs) if (input !== active) input.value = state[key];
      if (body !== active) body.value = state.body;
      requestAnimationFrame(fitBody);
      if (!infoList.contains(active)) renderInfo();
      if (!footerList.contains(active)) renderFooter();
    },
  };
}
