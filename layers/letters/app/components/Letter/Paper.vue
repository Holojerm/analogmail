<script setup lang="ts">
// A letter as it reads: its text on its paper, in its hand and ink.
import type { LetterDoc } from '../../../shared/utils/letter-doc'

defineProps<{ doc: LetterDoc }>()
</script>

<template>
  <article
    class="rounded-md border border-default px-6 py-8 sm:px-10 sm:py-12"
    :class="stationeryClass(doc.stationery)"
  >
    <p class="whitespace-pre-wrap break-words">{{ doc.body }}</p>
    <p v-if="doc.from" class="mt-8 text-right">{{ doc.from }}</p>
  </article>
</template>
