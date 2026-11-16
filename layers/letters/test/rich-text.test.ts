// What a letter's text may contain. It arrives from another person's browser,
// so the shape is the whole defence: anything else is not a letter.

import { describe, expect, it } from 'vitest'

import { DEFAULT_STATIONERY, LETTER_BODY_MAX, parseLetterDoc } from '../shared/utils/letter-doc'
import {
  emptyRichDoc,
  isBlankRichDoc,
  RICH_DEPTH_MAX,
  richDocFromText,
  richDocSchema,
  richTextLength,
  type RichBlock,
  type RichDoc,
} from '../shared/utils/rich-text'

const letter = (content: unknown) =>
  JSON.stringify({ v: 2, content, stationery: DEFAULT_STATIONERY, from: 'Ann' })

const FULL: RichDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'August' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The plums are ' },
        { type: 'text', text: 'ripe', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'Come soon.', marks: [{ type: 'underline' }] },
      ],
    },
    { type: 'horizontalRule' },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bring the dog' }] }],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'As you said.' }] }],
    },
    { type: 'paragraph' },
  ],
}

describe('a letter document', () => {
  it('accepts every part a letter is made of', () => {
    expect(richDocSchema.safeParse(FULL).success).toBe(true)
    expect(parseLetterDoc(letter(FULL))?.content).toEqual(FULL)
  })

  it("drops attributes the editor adds that a letter doesn't keep", () => {
    const fromEditor = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 4, type: null },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { x: 1 } }] }],
        },
      ],
    }
    expect(richDocSchema.parse(fromEditor)).toEqual({
      type: 'doc',
      content: [
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      ],
    })
  })

  it('keeps a line set to the centre or the right, and nothing for the left', () => {
    const fromEditor = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' } },
        { type: 'paragraph', attrs: { textAlign: 'right' } },
        { type: 'paragraph', attrs: { textAlign: 'left' } },
        { type: 'paragraph', attrs: { textAlign: null } },
        { type: 'heading', attrs: { level: 3, textAlign: null } },
      ],
    }
    expect(richDocSchema.parse(fromEditor)).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' } },
        { type: 'paragraph', attrs: { textAlign: 'right' } },
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 3 } },
      ],
    })
    const justified = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'justify' } }],
    }
    expect(richDocSchema.safeParse(justified).success).toBe(false)
  })

  it.each([
    [
      'a link mark',
      { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://x' } }] },
    ],
    ['a highlight mark', { type: 'text', text: 'x', marks: [{ type: 'highlight' }] }],
    ['an image', { type: 'image', attrs: { src: 'https://x/y.png' } }],
    ['a mention', { type: 'mention', attrs: { id: 'bob' } }],
    ['empty text', { type: 'text', text: '' }],
  ])('refuses %s', (_name, node) => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [node] }] }
    expect(richDocSchema.safeParse(doc).success).toBe(false)
    expect(parseLetterDoc(letter(doc))).toBeNull()
  })

  it.each([
    ['a top-level heading', { type: 'heading', attrs: { level: 1 } }],
    ['a code block', { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }],
    ['raw HTML', { type: 'html', html: '<script>alert(1)</script>' }],
  ])('refuses %s', (_name, block) => {
    expect(richDocSchema.safeParse({ type: 'doc', content: [block] }).success).toBe(false)
  })

  it('refuses the old plain-text shape, text that is not JSON, and nesting without end', () => {
    expect(
      parseLetterDoc(JSON.stringify({ v: 1, body: 'x', stationery: DEFAULT_STATIONERY, from: '' })),
    ).toBeNull()
    expect(parseLetterDoc('not json')).toBeNull()

    const nest = (depth: number): RichBlock =>
      depth === 0 ? { type: 'paragraph' } : { type: 'blockquote', content: [nest(depth - 1)] }
    expect(
      richDocSchema.safeParse({ type: 'doc', content: [nest(RICH_DEPTH_MAX - 1)] }).success,
    ).toBe(true)
    expect(richDocSchema.safeParse({ type: 'doc', content: [nest(RICH_DEPTH_MAX)] }).success).toBe(
      false,
    )
    expect(parseLetterDoc(letter({ type: 'doc', content: [nest(5000)] }))).toBeNull()
  })

  it('is limited by its text, however it is formatted', () => {
    expect(parseLetterDoc(letter(richDocFromText('a'.repeat(LETTER_BODY_MAX))))).not.toBeNull()
    expect(parseLetterDoc(letter(richDocFromText('a'.repeat(LETTER_BODY_MAX + 1))))).toBeNull()
  })
})

describe('measuring a letter', () => {
  it('counts text and line breaks, wherever they sit', () => {
    expect(richTextLength(FULL)).toBe(
      'August'.length +
        'The plums are ripe'.length +
        1 +
        'Come soon.'.length +
        'Bring the dog'.length +
        'As you said.'.length,
    )
    expect(richTextLength(emptyRichDoc())).toBe(0)
  })

  it('knows a sheet with nothing written on it', () => {
    expect(isBlankRichDoc(emptyRichDoc())).toBe(true)
    expect(isBlankRichDoc(richDocFromText('  \n '))).toBe(true)
    expect(isBlankRichDoc({ type: 'doc', content: [{ type: 'horizontalRule' }] })).toBe(true)
    expect(isBlankRichDoc(FULL)).toBe(false)
  })
})
