// The text of a letter: paragraphs, headings, lists, quotes and rules, with
// bold, italic, underline, strike and fixed-width text. It is the editor's own document shape,
// held to exactly these parts. A letter comes from another person's browser,
// so anything outside this list makes it unreadable rather than rendered:
// there are no links, no images and no HTML in a letter.

import { z } from 'zod'

// `code` is what typing between backticks makes; it is drawn in a fixed-width face.
export const RICH_MARKS = ['bold', 'italic', 'underline', 'strike', 'code'] as const
export type RichMark = (typeof RICH_MARKS)[number]

export interface RichText {
  type: 'text'
  text: string
  marks?: { type: RichMark }[]
}
export interface RichBreak {
  type: 'hardBreak'
}
export type RichInline = RichText | RichBreak

export interface RichParagraph {
  type: 'paragraph'
  content?: RichInline[]
}
export interface RichHeading {
  type: 'heading'
  attrs: { level: 2 | 3 }
  content?: RichInline[]
}
export interface RichRule {
  type: 'horizontalRule'
}
export interface RichListItem {
  type: 'listItem'
  content: RichBlock[]
}
export interface RichList {
  type: 'bulletList' | 'orderedList'
  content: RichListItem[]
}
export interface RichQuote {
  type: 'blockquote'
  content: RichBlock[]
}
export type RichBlock = RichParagraph | RichHeading | RichRule | RichList | RichQuote
export interface RichDoc {
  type: 'doc'
  content: RichBlock[]
}

const inlineSchema: z.ZodType<RichInline> = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string().min(1),
    marks: z
      .array(z.object({ type: z.enum(RICH_MARKS) }))
      .max(RICH_MARKS.length)
      .optional(),
  }),
  z.object({ type: z.literal('hardBreak') }),
])

const blockSchema: z.ZodType<RichBlock> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('paragraph'), content: z.array(inlineSchema).optional() }),
    z.object({
      type: z.literal('heading'),
      attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
      content: z.array(inlineSchema).optional(),
    }),
    z.object({ type: z.literal('horizontalRule') }),
    z.object({
      type: z.enum(['bulletList', 'orderedList']),
      content: z.array(z.object({ type: z.literal('listItem'), content: z.array(blockSchema) })),
    }),
    z.object({ type: z.literal('blockquote'), content: z.array(blockSchema) }),
  ]),
)

/** How deep lists and quotes may nest. The editor stops well short of this. */
export const RICH_DEPTH_MAX = 12

function depthOf(blocks: RichBlock[], depth = 1): number {
  let deepest = depth
  for (const block of blocks) {
    if (block.type === 'blockquote') deepest = Math.max(deepest, depthOf(block.content, depth + 1))
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      for (const item of block.content) {
        deepest = Math.max(deepest, depthOf(item.content, depth + 1))
      }
    }
  }
  return deepest
}

export const richDocSchema: z.ZodType<RichDoc> = z
  .object({ type: z.literal('doc'), content: z.array(blockSchema) })
  .refine((doc) => depthOf(doc.content) <= RICH_DEPTH_MAX)

export const emptyRichDoc = (): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] })

/** Plain paragraphs, one per line. For tests and anything that starts from text. */
export const richDocFromText = (text: string): RichDoc => ({
  type: 'doc',
  content: text.split('\n').map((line) => ({
    type: 'paragraph',
    ...(line ? { content: [{ type: 'text', text: line }] } : {}),
  })),
})

const inlineLength = (nodes: RichInline[] = []) =>
  nodes.reduce((total, node) => total + (node.type === 'text' ? node.text.length : 1), 0)

function blocksLength(blocks: RichBlock[]): number {
  let total = 0
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') {
      total += inlineLength(block.content)
    } else if (block.type === 'blockquote') total += blocksLength(block.content)
    else if (block.type !== 'horizontalRule') {
      for (const item of block.content) total += blocksLength(item.content)
    }
  }
  return total
}

/** Characters of text in the letter, the measure its length limit uses. */
export const richTextLength = (doc: RichDoc) => blocksLength(doc.content)

function hasText(blocks: RichBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'paragraph' || block.type === 'heading') {
      return (block.content ?? []).some((node) => node.type === 'text' && node.text.trim() !== '')
    }
    if (block.type === 'blockquote') return hasText(block.content)
    if (block.type === 'horizontalRule') return false
    return block.content.some((item) => hasText(item.content))
  })
}

/** Whether there is anything to send. */
export const isBlankRichDoc = (doc: RichDoc) => !hasText(doc.content)
