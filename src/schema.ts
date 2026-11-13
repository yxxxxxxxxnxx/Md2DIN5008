import type { MessageKey } from './i18n';

export interface FieldSpec {
  hint?: MessageKey;
  required?: boolean;
  optional?: boolean;
}

export const FIELDS: Record<string, FieldSpec> = {
  form: { hint: 'hint.form', required: true },
  letterhead: { optional: true },
  'letterhead.image': { hint: 'hint.logoImage' },
  'letterhead.text': { hint: 'hint.logoText' },
  'return.name': { required: true },
  'return.address.street': { required: true },
  'return.address.ZIPcode': { required: true },
  'return.address.city': { required: true },
  stamp: { optional: true },
  'stamp.image': { hint: 'hint.stampImage' },
  'stamp.code': { hint: 'hint.stampCode' },
  'recipient.firm': { optional: true },
  'recipient.name': { required: true },
  'recipient.address.street': { required: true },
  'recipient.address.ZIPcode': { required: true },
  'recipient.address.city': { required: true },
  infoBlock: { optional: true },
  'infoBlock[]': { hint: 'hint.info' },
  city: { required: true },
  date: { hint: 'hint.date', required: true },
  subject: { optional: true },
  footer: { optional: true },
  'footer[]': { hint: 'hint.footer' },
};

export function hintText(path: string, t: (k: MessageKey) => string, withParens = true): string {
  const spec = FIELDS[path];
  if (!spec) return '';
  const parts: string[] = [];
  if (spec.optional) parts.push(t('hint.optional'));
  if (spec.hint) parts.push(withParens ? `(${t(spec.hint)})` : t(spec.hint));
  if (spec.required) parts.push(t('hint.required'));
  return parts.join(' ');
}

export const SKELETON = `---
form:

letterhead:
  image:
  text:

return:
  name:
  address:
    street:
    ZIPcode:
    city:

stamp:
  image:
  code:

recipient:
  firm:
  name:
  address:
    street:
    ZIPcode:
    city:

infoBlock:
  -

city:
date:

subject:

footer:
  -
---

`;
