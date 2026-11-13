import { EditorView, basicSetup } from 'codemirror';
import { Decoration, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateEffect, type Text } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { FIELDS, hintText } from './schema';
import { t as tr } from './i18n';

const refreshEffect = StateEffect.define<null>();

export interface FieldLine {
  line: number;
  path: string;
  valueFrom: number;
  empty: boolean;
  parent: boolean;
}

const KEY_LINE = /^(\s*)(- +)?([^\s:#][^:#]*?)\s*:(?=\s|$)[ \t]*(.*)$/;
const ITEM_LINE = /^(\s*)-(?=\s|$)[ \t]*(.*)$/;

function frontMatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0;
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === '---') return n;
  }
  return 0;
}

export function analyzeFields(doc: Text): FieldLine[] {
  const end = frontMatterEnd(doc);
  if (!end) return [];
  const fields: FieldLine[] = [];
  const stack: { indent: number; key: string }[] = [];

  const pathAt = (indent: number) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    return stack.map((s) => s.key);
  };

  for (let n = 2; n < end; n++) {
    const line = doc.line(n);
    const raw = line.text;
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;

    const key = raw.match(KEY_LINE);
    if (key) {
      const indent = key[1].length;
      const isItem = key[2] !== undefined;
      const parents = pathAt(indent);
      if (isItem) parents.push(parents.pop() + '[]');
      const name = key[3].trim();
      const value = key[4].replace(/\s+#.*$/, '').trim();
      const valueFrom = line.from + raw.length - key[4].length;
      const keyIndent = indent + (isItem ? key[2]!.length : 0);
      stack.push({ indent: keyIndent, key: name });
      const path = [...parents, name].join('.');
      fields.push({ line: n, path, valueFrom, empty: value === '', parent: false });
      continue;
    }

    const item = raw.match(ITEM_LINE);
    if (item) {
      const indent = item[1].length;
      const parents = pathAt(indent);
      const path = parents.join('.') + '[]';
      const value = item[2].replace(/\s+#.*$/, '').trim();
      fields.push({ line: n, path, valueFrom: line.from + raw.length - item[2].length, empty: value === '', parent: false });
    }
  }

  const indentOf = (ln: number) => doc.line(ln).text.match(/^\s*/)![0].length;
  for (let i = 0; i < fields.length - 1; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.empty && (indentOf(next.line) > indentOf(f.line) || next.path.startsWith(f.path + '[]'))) f.parent = true;
  }
  return fields;
}

class HintWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: HintWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-hint';
    span.textContent = this.label;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

const missingLine = Decoration.line({ class: 'cm-required-missing' });
const structureLine = Decoration.line({ class: 'cm-structure' });

function hintLabel(path: string): string | null {
  return hintText(path, tr) || null;
}

const fieldAssist = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    fields: FieldLine[];
    touched = new Set<string>();
    current: string | null = null;

    constructor(view: EditorView) {
      this.fields = analyzeFields(view.state.doc);
      this.current = this.fieldAtCursor(view);
      this.decorations = this.build(view);
    }

    fieldAtCursor(view: EditorView): string | null {
      if (!view.hasFocus) return null;
      const line = view.state.doc.lineAt(view.state.selection.main.head).number;
      return this.fields.find((f) => f.line === line)?.path ?? (line > frontMatterEnd(view.state.doc) ? '#body' : null);
    }

    update(u: ViewUpdate) {
      const refresh = u.transactions.some((x) => x.effects.some((e) => e.is(refreshEffect)));
      if (!(u.docChanged || u.selectionSet || u.focusChanged || refresh)) return;
      if (u.docChanged) this.fields = analyzeFields(u.state.doc);
      const next = this.fieldAtCursor(u.view);
      if (this.current && this.current !== next) this.touched.add(this.current);
      this.current = next;
      this.decorations = this.build(u.view);
    }

    build(view: EditorView): DecorationSet {
      const { doc } = view.state;
      const cursorLine = view.hasFocus ? doc.lineAt(view.state.selection.main.head).number : -1;
      const b = new RangeSetBuilder<Decoration>();

      const end = frontMatterEnd(doc);
      if (end) b.add(doc.line(1).from, doc.line(1).from, structureLine);

      for (const f of this.fields) {
        const line = doc.line(f.line);
        if (f.parent) {
          b.add(line.from, line.from, structureLine);
          const label = FIELDS[f.path]?.optional ? hintLabel(f.path) : null;
          if (label && f.line !== cursorLine) {
            const needsSpace = !/\s$/.test(doc.sliceString(line.from, f.valueFrom));
            b.add(line.to, line.to, Decoration.widget({ widget: new HintWidget((needsSpace ? ' ' : '') + label), side: 1 }));
          }
          continue;
        }
        if (!f.empty) continue;
        const spec = FIELDS[f.path];
        if (spec?.required && this.touched.has(f.path) && f.line !== cursorLine) b.add(line.from, line.from, missingLine);
        const label = hintLabel(f.path);
        if (label && f.line !== cursorLine) {
          const needsSpace = !/\s$/.test(doc.sliceString(line.from, f.valueFrom));
          b.add(line.to, line.to, Decoration.widget({ widget: new HintWidget((needsSpace ? ' ' : '') + label), side: 1 }));
        }
      }

      if (end) b.add(doc.line(end).from, doc.line(end).from, structureLine);
      if (end && doc.sliceString(doc.line(end).to).trim() === '') {
        const target = end < doc.lines ? end + 1 : end;
        if (target !== end && target !== cursorLine) {
          const l = doc.line(target);
          b.add(l.to, l.to, Decoration.widget({ widget: new HintWidget(`(${tr('hint.body')})`), side: 1 }));
        }
      }
      return b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

const autoSpaceAfterColon = EditorState.transactionFilter.of((tr) => {
  if (tr.docChanged || !tr.selection || tr.selection.ranges.length !== 1 || !tr.selection.main.empty) return tr;
  const doc = tr.startState.doc;
  const head = tr.selection.main.head;
  const line = doc.lineAt(head);
  if (!/(:|^\s*-)$/.test(line.text)) return tr;
  const field = analyzeFields(doc).find((f) => f.line === line.number);
  if (!field || !field.empty || field.parent) return tr;
  return [tr, { changes: { from: line.to, insert: ' ' }, selection: { anchor: line.to + 1 }, sequential: true }];
});

const highlight = HighlightStyle.define([
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--syn-key)' },
  { tag: [t.string, t.special(t.string), t.content], color: 'var(--syn-value)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-atom)' },
  { tag: [t.meta, t.processingInstruction, t.punctuation, t.separator, t.bracket, t.contentSeparator], color: 'var(--syn-punct)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.heading, color: 'var(--syn-heading)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--syn-link)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--syn-atom)' },
  { tag: t.quote, color: 'var(--syn-comment)' },
  { tag: t.list, color: 'var(--syn-punct)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', color: 'var(--text)', backgroundColor: 'var(--field)' },
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--field)', color: 'var(--syn-gutter)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--syn-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--syn-active)', color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--syn-selection) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--syn-selection)', outline: 'none' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--syn-active)', color: 'var(--syn-gutter)', border: '1px solid var(--border)' },
  '.cm-scroller': { fontFamily: '"Source Code Pro", ui-monospace, Menlo, Consolas, monospace', lineHeight: '1.5' },
  '.cm-hint': { color: 'var(--hint)', fontStyle: 'italic', pointerEvents: 'none', userSelect: 'none' },
  '.cm-required-missing, .cm-required-missing *': { color: 'var(--required) !important' },
  '.cm-structure, .cm-structure span:not(.cm-hint)': { color: 'var(--text) !important' },
});

export function createEditor(parent: HTMLElement, doc: string, onChange: (text: string) => void): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        yamlFrontmatter({ content: markdown() }),
        EditorView.lineWrapping,
        fieldAssist,
        autoSpaceAfterColon,
        syntaxHighlighting(highlight),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
}

export function refreshHints(view: EditorView) {
  view.dispatch({ effects: refreshEffect.of(null) });
}

export function setDoc(view: EditorView, text: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

export function setField(view: EditorView, path: string, value: string): boolean {
  const f = analyzeFields(view.state.doc).find((x) => x.path === path);
  if (!f) return false;
  const line = view.state.doc.line(f.line);
  const sep = /\s$/.test(view.state.doc.sliceString(line.from, f.valueFrom)) ? '' : ' ';
  view.dispatch({ changes: { from: f.valueFrom, to: line.to, insert: sep + value } });
  return true;
}
