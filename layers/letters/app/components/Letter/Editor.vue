<script setup lang="ts">
// Where a letter is written. The editor is held to what a letter may contain
// (shared/utils/rich-text.ts): no links, images, code or mentions, so what it
// saves is what the reader's page can draw.
import type { EditorToolbarItem } from '@nuxt/ui'

import { richDocSchema, type RichDoc } from '../../../shared/utils/rich-text'

const content = defineModel<RichDoc>({ required: true })

// The editor component brings its own rule and inline-code extensions, so
// neither is switched on here: a second copy of either breaks the keymap.
const STARTER_KIT = {
  heading: { levels: [2, 3] as (2 | 3)[] },
  link: false,
  codeBlock: false,
} as const

const EDITOR_PROPS = {
  attributes: {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': 'Your letter',
    spellcheck: 'true',
    autocorrect: 'on',
    autocapitalize: 'sentences',
  },
}

const ITEMS: EditorToolbarItem[][] = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': 'Italic' },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', 'aria-label': 'Underline' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough', 'aria-label': 'Strike out' },
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', 'aria-label': 'Heading' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', 'aria-label': 'Small heading' },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', 'aria-label': 'List' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', 'aria-label': 'Numbered list' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', 'aria-label': 'Quote' },
    { kind: 'horizontalRule', icon: 'i-lucide-minus', 'aria-label': 'Line across the page' },
  ],
  [
    { kind: 'undo', icon: 'i-lucide-undo-2', 'aria-label': 'Undo' },
    { kind: 'redo', icon: 'i-lucide-redo-2', 'aria-label': 'Redo' },
  ],
]

// The editor keeps its own copy of the document. Its copy carries attributes
// a letter does not keep, and handing it back anything but what it produced
// makes it reset itself mid-sentence. Only the parts a letter is made of are
// passed on.
const draft = shallowRef<RichDoc>(content.value)
watch(draft, (value) => {
  const parsed = richDocSchema.safeParse(value)
  if (parsed.success) content.value = parsed.data
})
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    v-model="draft"
    content-type="json"
    :starter-kit="STARTER_KIT"
    :image="false"
    :mention="false"
    :editor-props="EDITOR_PROPS"
    :placeholder="{ placeholder: 'Dear…', mode: 'firstLine' }"
    :ui="{ base: 'letter-prose min-h-80' }"
  >
    <UEditorToolbar
      :editor="editor"
      :items="ITEMS"
      layout="fixed"
      aria-label="Formatting"
      class="-mx-2 mb-6 border-b border-default pb-2"
      :ui="{ base: 'flex-wrap gap-y-1' }"
    />
  </UEditor>
</template>
