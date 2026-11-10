import { Lexer, type Token, type Tokens } from 'marked';
import { parse as parseYaml } from 'yaml';
import template from './typst/din5008.typ?raw';

interface Address {
  street?: string;
  ZIPcode?: string;
  city?: string;
}

export interface LetterMeta {
  form?: string;
  return?: { name?: string; address?: Address };
  stamp?: { image?: string; code?: string };
  recipient?: { firm?: string; name?: string; address?: Address };
  infoBlock?: (Record<string, string> | string | null)[];
  city?: string;
  date?: string;
  subject?: string;
  footer?: (string | string[] | null)[];
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(source: string): { yaml: string; body: string; hasFrontMatter: boolean } {
  const m = source.match(FRONT_MATTER);
  if (!m) return { yaml: '', body: source, hasFrontMatter: false };
  return { yaml: m[1], body: source.slice(m[0].length), hasFrontMatter: true };
}

export function parseMeta(yamlText: string): LetterMeta {
  if (!yamlText.trim()) return {};
  const data = parseYaml(yamlText, { schema: 'failsafe' });
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as LetterMeta) : {};
}

function str(s: unknown): string {
  const v = String(s ?? '');
  return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t') + '"';
}

export function escapeMarkup(s: string): string {
  return s.replace(/[\\#*_`$\[\]<>@~=\-+\/]/g, (c) => '\\' + c).replace(/\r?\n/g, ' ');
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim());

function arr(items: string[]): string {
  if (items.length === 0) return '()';
  return '(' + items.join(', ') + (items.length === 1 ? ',' : '') + ')';
}

function content(value: string): string {
  return '[' + escapeMarkup(value) + ']';
}

function contentOrNone(value: unknown): string {
  const t = text(value);
  return t ? content(t) : 'none';
}

function zipCity(a: Address | undefined): string {
  return [text(a?.ZIPcode), text(a?.city)].filter(Boolean).join(' ');
}

function infoEntries(items: LetterMeta['infoBlock']): [string, string][] {
  const out: [string, string][] = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item == null) continue;
    if (typeof item === 'string') {
      if (item.trim()) out.push(['', item.trim()]);
      continue;
    }
    for (const [label, value] of Object.entries(item)) {
      if (text(label) || text(value)) out.push([text(label), text(value)]);
    }
  }
  return out;
}

function footerColumns(cols: LetterMeta['footer']): string[] {
  return (Array.isArray(cols) ? cols : [])
    .map((c) => (Array.isArray(c) ? c.map(text) : text(c).split(/\r?\n/).map((l) => l.trim())).filter(Boolean))
    .filter((c) => c.length > 0)
    .slice(0, 3)
    .map((lines) => arr(lines.map(content)));
}

function metaToArgs(meta: LetterMeta): string {
  const ret = meta.return ?? {};
  const rcp = meta.recipient ?? {};

  const senderAddress = [text(ret.address?.street), zipCity(ret.address)].filter(Boolean);

  const recipient = [
    contentOrNone(rcp.firm),
    contentOrNone(rcp.name),
    contentOrNone(rcp.address?.street),
    contentOrNone(zipCity(rcp.address)),
  ];

  const info = infoEntries(meta.infoBlock);
  const date = [text(meta.city), text(meta.date)].filter(Boolean).join(', ');
  if (date) info.push(['Datum', date]);

  const args = [
    `form: ${str(text(meta.form).toUpperCase() === 'A' ? 'A' : 'B')}`,
    `sender-name: ${contentOrNone(ret.name)}`,
    `sender-address: ${arr(senderAddress.map(content))}`,
    `recipient: ${arr(recipient)}`,
    `stamp-code: ${contentOrNone(meta.stamp?.code)}`,
    `info: ${arr(info.map(([l, v]) => `(${content(l)}, ${content(v)})`))}`,
    `subject: ${contentOrNone(meta.subject)}`,
    `footer: ${arr(footerColumns(meta.footer))}`,
    `pdf-title: ${str(text(meta.subject) || 'Brief')}`,
  ];
  if (text(ret.name)) args.push(`pdf-author: ${str(text(ret.name))}`);
  return args.join(',\n  ');
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e);

function inline(tokens: Token[] | undefined): string {
  if (!tokens) return '';
  return tokens.map(inlineToken).join('');
}

function inlineToken(t: Token): string {
  switch (t.type) {
    case 'text': {
      const tt = t as Tokens.Text;
      return tt.tokens ? inline(tt.tokens) : escapeMarkup(decode(tt.text));
    }
    case 'escape':
      return escapeMarkup(decode((t as Tokens.Escape).text));
    case 'strong':
      return `#strong[${inline((t as Tokens.Strong).tokens)}]`;
    case 'em':
      return `#emph[${inline((t as Tokens.Em).tokens)}]`;
    case 'del':
      return `#strike[${inline((t as Tokens.Del).tokens)}]`;
    case 'codespan':
      return `#raw(${str(decode((t as Tokens.Codespan).text))})`;
    case 'br':
      return ' \\\n';
    case 'link': {
      const l = t as Tokens.Link;
      return `#link(${str(l.href)})[${inline(l.tokens)}]`;
    }
    case 'image': {
      const i = t as Tokens.Image;
      return escapeMarkup(i.text || i.href);
    }
    case 'html':
      return '';
    default:
      return 'raw' in t ? escapeMarkup(decode(String(t.raw))) : '';
  }
}

function indent(value: string, n: number): string {
  const pad = ' '.repeat(n);
  return value
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}

function blocks(tokens: Token[], tight = false): string {
  const out: string[] = [];
  for (const t of tokens) {
    const b = blockToken(t, tight);
    if (b !== '') out.push(b);
  }
  return out.join(tight ? '\n' : '\n\n');
}

function blockToken(t: Token, tight: boolean): string {
  switch (t.type) {
    case 'space':
      return '';
    case 'paragraph':
      return inline((t as Tokens.Paragraph).tokens);
    case 'text': {
      const tt = t as Tokens.Text;
      return tt.tokens ? inline(tt.tokens) : escapeMarkup(decode(tt.text));
    }
    case 'heading':
      return `#heading(level: ${(t as Tokens.Heading).depth}, outlined: false)[${inline((t as Tokens.Heading).tokens)}]`;
    case 'list': {
      const l = t as Tokens.List;
      const marker = l.ordered ? '+' : '-';
      const items = l.items.map((item) => {
        const inner = blocks(item.tokens, !item.loose);
        const [first, ...rest] = inner.split('\n');
        return `${marker} ${first}` + (rest.length ? '\n' + indent(rest.join('\n'), 2) : '');
      });
      const start = l.ordered && typeof l.start === 'number' && l.start !== 1 ? `#set enum(start: ${l.start})\n` : '';
      const body = items.join(l.loose ? '\n\n' : '\n');
      return start ? `#[${start}${body}\n]` : body;
    }
    case 'blockquote':
      return `#quote(block: true)[\n${blocks((t as Tokens.Blockquote).tokens)}\n]`;
    case 'code': {
      const c = t as Tokens.Code;
      return `#raw(block: true, ${c.lang ? `lang: ${str(c.lang)}, ` : ''}${str(c.text)})`;
    }
    case 'hr':
      return '#line(length: 100%, stroke: 0.4pt + luma(120))';
    case 'table': {
      const tb = t as Tokens.Table;
      const aligns = tb.align.map((a) => (a === 'center' ? 'center' : a === 'right' ? 'right' : 'left'));
      const cells = [
        ...tb.header.map((h) => `[#strong[${inline(h.tokens)}]]`),
        ...tb.rows.flatMap((r) => r.map((c) => `[${inline(c.tokens)}]`)),
      ];
      return `#table(columns: ${tb.header.length}, align: (${aligns.join(', ')},),\n  ${cells.join(', ')})`;
    }
    case 'html':
      return '';
    default:
      return tight ? '' : 'raw' in t ? escapeMarkup(decode(String(t.raw))) : '';
  }
}

export function markdownToTypst(md: string): string {
  const tokens = new Lexer({ gfm: true, breaks: true }).lex(md);
  return blocks(tokens);
}

export interface ImagePaths {
  stamp?: string;
  signature?: string;
}

export function buildTypst(source: string, images: ImagePaths = {}): { typst: string; meta: LetterMeta } {
  const { yaml, body } = splitFrontMatter(source);
  const meta = parseMeta(yaml);
  let args = metaToArgs(meta);
  if (images.stamp) args += `,\n  stamp-image: ${str(images.stamp)}`;
  if (images.signature) args += `,\n  signature-image: ${str(images.signature)}`;
  const typst = `${template}\n\n#show: letter.with(\n  ${args}\n)\n\n${markdownToTypst(body)}\n`;
  return { typst, meta };
}
