# Md2DIN5008

A web tool that converts business letters written in Markdown into PDFs laid out according to **DIN 5008:2020 (Form A / Form B)**.
The PDF is generated entirely in the browser with [Typst](https://typst.app) (WASM, via [typst.ts](https://github.com/Myriad-Dreamin/typst.ts)); no server or external CDN is required.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ → deployable to any static host
```

## Editor

The left pane is a Markdown editor and the right pane shows the live PDF preview.

- **Hints** – text in parentheses, e.g. `(dd.MM.yyyy)`, is shown in gray after empty fields. It disappears while the cursor is on that line or once a value is entered, and reappears if you leave the line empty.
- **Required fields** – shown as `Required*`. If you place the cursor on a required field and leave it without entering a value, the line turns red.
- **Auto spacing** – placing the cursor on an empty `key:` or `-` line inserts one space after the colon/dash.
- **Signature** – hover *Signature* in the toolbar and choose *Upload…* or *Draw…* (mouse, trackpad, pen or touch). Light background is made transparent, the image is cropped to the ink, and it is printed 15 mm high (width keeps the aspect ratio). The signature is stored in this browser only; *Remove* deletes it.
- **Stamp image** – use *Attach stamp image* to load a local file (kept in memory only), or enter a URL / `data:` URI in `stamp.image`.

## Input format

Letter details go in the YAML front matter; the letter body (salutation, text, closing) follows as Markdown.

```markdown
---
form: B                    # A or B *

return:                    # sender; printed as "Name  |  Street, ZIP City" in the return-address line
  name: Max Mustermann     # *
  address:
    street: Musterstraße 12  # *
    ZIPcode: 01067           # *
    city: Dresden            # *

stamp:
  image:                   # URL, data: URI, or the name of an attached file
  code: Einschreiben Einwurf

recipient:
  firm:                    # optional; the line stays blank in the PDF when empty
  name: Frau Erika Beispiel  # *
  address:
    street: Hauptstraße 5    # *
    ZIPcode: 80331           # *
    city: München            # *

infoBlock:                 # "Label: value" entries
  - Ihr Zeichen: EB-2026-17
  - Unser Zeichen: MM/04

city: Dresden              # *
date: 10.11.2026           # dd.MM.yyyy *

subject: Angebot           # *

footer:                    # up to three columns; a column may be a list of lines
                           # 1 column: full text width, centred; 2–3 columns: equal widths, 5 mm gutter, left-aligned
  - Max Mustermann
  - [IBAN DE00 0000 0000 0000, BIC XXXXDEXX]
---

Sehr geehrte Frau Beispiel,

…

Mit freundlichen Grüßen

Max Mustermann
```

After the body's last line the PDF adds the signature image (if any) on the next line, then `return.name` on the line after that.
A single newline in the body is a line break in the PDF; a blank line starts a new paragraph. Body text is justified.

All values are read as plain strings, so ZIP codes with a leading zero are preserved.
The body supports paragraphs, lists, tables, bold/italic, links, code, block quotes, and headings.

## Layout dimensions

| Element | Form A | Form B |
|---|---|---|
| Letterhead height | 27 mm | 45 mm |
| Address field (left 20 mm, 85 × 45 mm) | top 27 mm | top 45 mm |
| Information block (left 125 mm, width 75 mm) | top 32 mm | top 50 mm |
| Fold marks | 87 / 192 mm | 105 / 210 mm |
| Punch mark | 148.5 mm | 148.5 mm |

Body margins are 25 mm (left) and 20 mm (right); the PDF typeface is Noto Sans at 11 pt, with Noto Sans KR as fallback for Korean and other CJK text.
The CJK font files (about 12 MB) are downloaded only when a letter contains CJK characters. The editor uses Source Code Pro.
The template lives in [src/typst/din5008.typ](src/typst/din5008.typ).

## Third-party software

| Package | Purpose | License |
|---|---|---|
| typst.ts / typst-ts-web-compiler | Typst compiler (WASM) | Apache-2.0 |
| CodeMirror 6 | Editor | MIT |
| marked | Markdown parser | MIT |
| yaml | YAML parser | ISC |
| Noto Sans, Noto Sans KR | PDF typefaces | SIL OFL 1.1 |
| Source Code Pro (@fontsource) | Editor typeface | SIL OFL 1.1 |
