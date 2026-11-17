<script setup lang="ts">
// A letter as it reads: its text on its paper, in its hand and ink, with its
// photo below the signature when it has one.
import type { LetterDoc } from '../../../shared/utils/letter-doc'

defineProps<{
  doc: LetterDoc
  /** The opened photo. Without it a letter with a photo says the photo is missing. */
  photoUrl?: string | null
}>()
</script>

<template>
  <!-- `ph-no-capture`: if analytics is ever switched on, autocapture and
       session replay skip this element. A decrypted letter is never recorded. -->
  <article
    class="ph-no-capture rounded-sm border border-default px-6 py-8 sm:px-10 sm:py-12"
    :class="stationeryClass(doc.stationery)"
  >
    <LetterRichText :doc="doc.content" />
    <p v-if="doc.from" class="mt-8 text-right">{{ doc.from }}</p>
    <template v-if="doc.photo">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        :alt="doc.photo.alt || 'A photo enclosed with this letter'"
        :width="doc.photo.width"
        :height="doc.photo.height"
        class="mt-8 h-auto w-full rounded-sm"
      />
      <p v-else class="mt-8 text-sm text-muted">
        This letter has a photo, which could not be opened on this device.
      </p>
    </template>
  </article>
</template>
