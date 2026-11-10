#let line-pitch = 4.23mm

#let din-geometry(form) = {
  if form == "A" {
    (
      header-height: 27mm,
      address-top: 27mm,
      return-zone: 5mm,
      note-zone: 12.7mm,
      info-top: 32mm,
      fold-marks: (87mm, 192mm),
    )
  } else {
    (
      header-height: 45mm,
      address-top: 45mm,
      return-zone: 0mm,
      note-zone: 17.7mm,
      info-top: 50mm,
      fold-marks: (105mm, 210mm),
    )
  }
}

#let page-width = 210mm
#let margin-left = 25mm
#let margin-right = 20mm
#let address-left = 20mm
#let address-width = 85mm
#let address-height = 45mm
#let address-inset = 5mm
#let recipient-zone = 27.3mm
#let info-left = 125mm
#let info-width = 75mm
#let info-min-height = 40mm
#let text-gap = 2 * line-pitch
#let text-bottom = 260.38mm
#let page-number-top = text-bottom + line-pitch
#let footer-top = page-number-top + 2 * line-pitch
#let footer-height = 4 * line-pitch
#let punch-mark = 148.5mm
#let fold-mark-length = 10mm
#let punch-mark-length = 15mm
#let follow-page-top = 20mm

#let font-size = 11pt

#let join-lines(items) = items.map(l => if l == none { hide[X] } else { l }).join(linebreak())

#let letter(
  form: "B",
  sender-name: none,
  sender-address: (),
  recipient: (),
  stamp-image: none,
  stamp-code: none,
  signature-image: none,
  info: (),
  subject: none,
  footer: (),
  pdf-title: "Brief",
  pdf-author: none,
  body,
) = {
  let g = din-geometry(form)
  let text-width = page-width - margin-left - margin-right

  let address-line = if sender-address.len() > 0 { sender-address.join(", ") } else { none }
  let ret-parts = (sender-name, address-line).filter(p => p != none)
  let ret = if ret-parts.len() > 0 { ret-parts.join("  |  ") } else { none }

  let info-grid = grid(
    columns: (auto, 1fr),
    column-gutter: 3mm,
    row-gutter: 1.6mm,
    ..info.map(((label, value)) => (text(size: 8pt, label), text(size: 9pt, value))).flatten()
  )

  let first-page-elements = {
    place(top + left, dx: margin-left, dy: 0mm,
      block(width: text-width, height: g.header-height, inset: (top: 8mm, bottom: 4mm),
        align(right + bottom, {
          if sender-name != none { text(size: 16pt, weight: "bold", sender-name) }
          if address-line != none {
            linebreak()
            text(size: 9pt, address-line)
          }
        })
      )
    )

    place(top + left, dx: address-left, dy: g.address-top,
      block(width: address-width, height: address-height, inset: (left: address-inset, right: address-inset), {
        set block(spacing: 0pt)
        set par(justify: false)
        let ret-line = if ret != none { text(size: 7pt, underline(offset: 1.5pt, ret)) }
        if g.return-zone > 0mm {
          block(height: g.return-zone, width: 100%, align(bottom, ret-line))
        }
        block(height: g.note-zone, width: 100%, {
          if g.return-zone == 0mm and ret-line != none { place(top + left, dy: 1mm, ret-line) }
          if stamp-code != none { place(bottom + left, dy: -1mm, text(size: 8pt, stamp-code)) }
          if stamp-image != none {
            let top-offset = if g.return-zone == 0mm { 4.5mm } else { 0.5mm }
            place(top + right, dy: top-offset, image(stamp-image, height: g.note-zone - top-offset - 0.5mm, fit: "contain"))
          }
        })
        block(height: recipient-zone, width: 100%, clip: true, join-lines(recipient))
      })
    )

    if info.len() > 0 {
      place(top + left, dx: info-left, dy: g.info-top, block(width: info-width, info-grid))
    }

    for y in g.fold-marks {
      place(top + left, dx: 0mm, dy: y, line(length: fold-mark-length, stroke: 0.3pt + luma(90)))
    }
    place(top + left, dx: 0mm, dy: punch-mark, line(length: punch-mark-length, stroke: 0.3pt + luma(90)))
  }

  let footer-cols = footer.slice(0, calc.min(footer.len(), 3))

  let page-elements = context {
    let total = counter(page).final().first()
    if total > 1 {
      place(top + left, dx: margin-left, dy: page-number-top,
        block(width: text-width, height: line-pitch,
          align(right + horizon, text(size: 9pt)[Seite #counter(page).display() von #total])))
    }
    if footer-cols.len() > 0 {
      place(top + left, dx: margin-left, dy: footer-top,
        block(width: text-width, height: footer-height, {
          set text(size: 8pt, top-edge: 0.8em, bottom-edge: -0.2em)
          set par(leading: line-pitch - 8pt, justify: false)
          let n = footer-cols.len()
          grid(columns: (1fr,) * n, column-gutter: 5mm,
            ..footer-cols.map(c => align(if n == 1 { center } else { left }, c.join(linebreak()))))
        }))
    }
  }

  set document(title: pdf-title, author: if pdf-author != none { pdf-author } else { () })
  set text(font: ("Noto Sans", "Noto Sans KR"), size: font-size, lang: "de", region: "DE", top-edge: 0.8em, bottom-edge: -0.2em)
  set par(leading: line-pitch - font-size, spacing: 2 * line-pitch - font-size, justify: true)

  set page(
    paper: "a4",
    margin: (left: margin-left, right: margin-right, top: follow-page-top, bottom: 297mm - text-bottom),
    background: context {
      if counter(page).get().first() == 1 { first-page-elements }
      page-elements
    },
  )

  show heading: it => block(above: 2 * line-pitch - font-size, below: line-pitch - font-size, text(size: font-size, weight: "bold", it.body))
  show link: underline
  show raw.where(block: true): it => block(fill: luma(245), inset: 2mm, radius: 1mm, width: 100%, text(size: 9pt, it))
  set list(indent: 0mm, body-indent: 3mm)
  set enum(indent: 0mm, body-indent: 3mm)
  set table(stroke: 0.4pt + luma(120), inset: 1.5mm)
  show table: set par(justify: false)
  show quote.where(block: true): it => pad(left: 6mm, it.body)

  context {
    let info-h = if info.len() > 0 { calc.max(info-min-height, measure(block(width: info-width, info-grid)).height) } else { 0mm }
    let text-top = calc.max(g.address-top + address-height, if info.len() > 0 { g.info-top + info-h } else { 0mm }) + text-gap
    v(text-top - follow-page-top)
  }

  if subject != none {
    block(above: 0pt, below: 3 * line-pitch - font-size, par(justify: false, text(weight: "bold", subject)))
  }

  body

  if sender-name != none or signature-image != none {
    block(above: line-pitch - font-size, breakable: false, {
      set par(justify: false)
      if signature-image != none {
        block(above: 0pt, below: line-pitch - font-size, image(signature-image, height: 15mm))
      }
      if sender-name != none { sender-name }
    })
  }
}
