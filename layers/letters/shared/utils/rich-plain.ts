// A letter's text as plain text, for the copy a person keeps: a file any
// device can read long after this one is gone.

import type { RichBlock, RichDoc, RichInline } from './rich-text'

const inlineText = (nodes: RichInline[] = []) =>
  nodes.map((node) => (node.type === 'text' ? node.text : '\n')).join('')

const indent = (text: string, first: string, rest: string) =>
  text
    .split('\n')
    .map((line, index) => (index === 0 ? first : rest) + line)
    .join('\n')

function blockText(block: RichBlock): string {
  switch (block.type) {
    case 'paragraph':
      return inlineText(block.content)
    case 'heading': {
      const title = inlineText(block.content)
      const rule = (block.attrs.level === 2 ? '=' : '-').repeat(Math.max(3, title.length))
      return `${title}\n${rule}`
    }
    case 'horizontalRule':
      return '* * *'
    case 'blockquote':
      return indent(blocksText(block.content), '> ', '> ')
    default:
      return block.content
        .map((item, index) => {
          const mark = block.type === 'bulletList' ? '- ' : `${index + 1}. `
          return indent(blocksText(item.content), mark, ' '.repeat(mark.length))
        })
        .join('\n')
  }
}

const blocksText = (blocks: RichBlock[]) => blocks.map(blockText).join('\n\n')

export const richDocToText = (doc: RichDoc) => blocksText(doc.content)
