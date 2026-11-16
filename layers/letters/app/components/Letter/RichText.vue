<script setup lang="ts">
// A letter's text, drawn from its document one node at a time. Nothing in a
// letter is ever set as HTML: what another person wrote can only become the
// handful of tags named here.
import { h, type VNode } from 'vue'

import type {
  RichAlign,
  RichBlock,
  RichDoc,
  RichInline,
  RichMark,
} from '../../../shared/utils/rich-text'

const props = defineProps<{ doc: RichDoc }>()

const MARK_TAG: Record<RichMark, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
}

function inline(nodes: RichInline[] = []): (VNode | string)[] {
  // An empty line keeps its height.
  if (nodes.length === 0) return [h('br')]
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return h('br')
    return (node.marks ?? []).reduce<VNode | string>(
      (inner, mark) => h(MARK_TAG[mark.type], inner),
      node.text,
    )
  })
}

const aligned = (align?: RichAlign) => (align ? { class: `letter-align-${align}` } : null)

function block(node: RichBlock): VNode {
  switch (node.type) {
    case 'paragraph':
      return h('p', aligned(node.attrs?.textAlign), inline(node.content))
    case 'heading':
      return h(
        node.attrs.level === 2 ? 'h2' : 'h3',
        aligned(node.attrs.textAlign),
        inline(node.content),
      )
    case 'horizontalRule':
      return h('hr')
    case 'blockquote':
      return h('blockquote', node.content.map(block))
    default:
      return h(
        node.type === 'bulletList' ? 'ul' : 'ol',
        node.content.map((item) => h('li', item.content.map(block))),
      )
  }
}

const Blocks = () => props.doc.content.map(block)
</script>

<template>
  <div class="letter-prose">
    <Blocks />
  </div>
</template>
