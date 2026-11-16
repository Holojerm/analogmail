// The archive's one page: every letter in order, in a single file that opens
// in any browser with nothing else installed and prints one letter to a
// sheet. It is written as text, so every word a person wrote is escaped here
// and only the tags named below are ever produced.

import type { LetterDoc } from './letter-doc'
import type { RichBlock, RichInline, RichMark } from './rich-text'

export interface ArchivePageLetter {
  heading: string
  when: string | null
  doc: LetterDoc
  /** Path of the photo inside the archive, when it could be opened. */
  photoFile: string | null
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]!)

const MARK_TAG: Record<RichMark, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
}

function inline(nodes: RichInline[] = []): string {
  if (nodes.length === 0) return '<br>'
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<br>'
      return (node.marks ?? []).reduce(
        (inner, mark) => `<${MARK_TAG[mark.type]}>${inner}</${MARK_TAG[mark.type]}>`,
        escapeHtml(node.text),
      )
    })
    .join('')
}

const aligned = (align?: 'center' | 'right') => (align ? ` class="${align}"` : '')

function block(node: RichBlock): string {
  switch (node.type) {
    case 'paragraph':
      return `<p${aligned(node.attrs?.textAlign)}>${inline(node.content)}</p>`
    case 'heading': {
      const tag = node.attrs.level === 2 ? 'h3' : 'h4'
      return `<${tag}${aligned(node.attrs.textAlign)}>${inline(node.content)}</${tag}>`
    }
    case 'horizontalRule':
      return '<hr>'
    case 'blockquote':
      return `<blockquote>${node.content.map(block).join('')}</blockquote>`
    default: {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol'
      const items = node.content.map((item) => `<li>${item.content.map(block).join('')}</li>`)
      return `<${tag}>${items.join('')}</${tag}>`
    }
  }
}

// The faces are named first so a device that has them uses them; every one
// falls back to something every device has. Colours are written out because
// this file has no stylesheet to lean on.
const STYLE = `
body{margin:0;background:#f4efe8;color:#2b2623;font-family:Georgia,'Times New Roman',serif;line-height:1.6}
main{max-width:42rem;margin:0 auto;padding:3rem 1.25rem}
h1{font-size:2rem;font-weight:400;margin:0 0 .5rem}
.intro{color:#6b625b;margin:0 0 3rem}
section{margin:0 0 3.5rem}
h2{font-size:1.25rem;font-weight:400;margin:0}
.when{color:#6b625b;font-size:.9rem;margin:.2rem 0 1rem}
article{border:1px solid #e0d7cb;border-radius:6px;padding:2.5rem 2rem;font-synthesis:weight style;overflow-wrap:break-word}
.paper-plain{background:#fffdf9}.paper-soft{background:#f9f3ea}.paper-card{background:#fff}
.ink-black{color:#2b2623}.ink-accent{color:#a63e24}.ink-faded{color:#6b625b}
.face-serif{font-family:Lora,Georgia,serif;font-size:1.125rem;line-height:1.7}
.face-sans{font-family:Inter,system-ui,sans-serif;font-size:1rem;line-height:1.7}
.face-typewriter{font-family:'Courier Prime','Courier New',monospace;font-size:1rem;line-height:1.8}
.face-hand{font-family:Caveat,'Bradley Hand',cursive;font-size:1.5rem;line-height:1.45}
.face-print{font-family:Kalam,'Comic Sans MS',cursive;font-size:1.125rem;line-height:1.75}
.face-cursive{font-family:'Homemade Apple','Snell Roundhand',cursive;font-size:1.0625rem;line-height:2.1}
article p{margin:.9em 0;white-space:pre-wrap}
article h3{font-size:1.45em;line-height:1.3;margin:.9em 0}
article h4{font-size:1.2em;line-height:1.3;margin:.9em 0}
article>:first-child{margin-top:0}
.center{text-align:center}.right{text-align:right}
blockquote{margin:.9em 0;padding-left:1em;border-left:2px solid currentColor;font-style:italic;opacity:.85}
hr{border:0;border-top:1px solid currentColor;opacity:.35;margin:1.6em 0}
code{font-family:'Courier Prime','Courier New',monospace}
.signature{text-align:right;margin:2rem 0 0}
img{display:block;max-width:100%;height:auto;margin:2rem 0 0;border-radius:3px}
.missing{color:#6b625b;font-size:.9rem}
@media print{body{background:#fff}main{padding:0;max-width:none}section{break-after:page}article{border:0;padding:0}}
`.trim()

function letter(item: ArchivePageLetter): string {
  const { doc } = item
  const classes = `paper-${doc.stationery.paper} ink-${doc.stationery.ink} face-${doc.stationery.font}`
  const photo = doc.photo
    ? item.photoFile
      ? `<img src="${escapeHtml(encodeURI(item.photoFile))}" width="${doc.photo.width}" height="${doc.photo.height}" alt="${escapeHtml(doc.photo.alt || 'A photo enclosed with this letter')}">`
      : '<p class="missing">This letter had a photo, which could not be opened when this copy was made.</p>'
    : ''
  return [
    '<section>',
    `<h2>${escapeHtml(item.heading)}</h2>`,
    item.when ? `<p class="when">${escapeHtml(item.when)}</p>` : '',
    `<article class="${classes}">`,
    doc.content.content.map(block).join(''),
    doc.from ? `<p class="signature">${escapeHtml(doc.from)}</p>` : '',
    photo,
    '</article>',
    '</section>',
  ].join('\n')
}

export function archivePage(title: string, intro: string, letters: ArchivePageLetter[]): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="intro">${escapeHtml(intro)}</p>`,
    ...letters.map(letter),
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
