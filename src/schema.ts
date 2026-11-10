export interface FieldSpec {
  hint?: string;
  required?: boolean;
}

export const FIELDS: Record<string, FieldSpec> = {
  form: { hint: 'A or B', required: true },
  'return.name': { required: true },
  'return.address.street': { required: true },
  'return.address.ZIPcode': { required: true },
  'return.address.city': { required: true },
  'stamp.image': { hint: 'URL or attached file name' },
  'stamp.code': {},
  'recipient.firm': {},
  'recipient.name': { required: true },
  'recipient.address.street': { required: true },
  'recipient.address.ZIPcode': { required: true },
  'recipient.address.city': { required: true },
  'infoBlock[]': { hint: 'Label: value' },
  city: { required: true },
  date: { hint: 'dd.MM.yyyy', required: true },
  subject: { required: true },
  'footer[]': { hint: 'Up to three columns' },
};

export const BODY_HINT = 'Letter body in Markdown: salutation, text, closing';

export const SKELETON = `---
form:

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
