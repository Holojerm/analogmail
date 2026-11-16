<script setup lang="ts">
// Who can read what is on this page, said the same way everywhere: a label,
// then plain words in the slot. DESIGN.md › Who can read this.
defineProps<{
  /** Left out, the line says "Not encrypted": the mistake to make is the honest one. */
  encrypted?: boolean
}>()
</script>

<template>
  <p class="text-sm text-muted">
    <!-- Set like a rubber stamp: boxed, and not quite straight. -->
    <span
      class="mr-2 inline-block -rotate-2 rounded-sm border border-current px-1 font-mono text-xs tracking-wide text-toned uppercase"
    >
      {{ encrypted ? 'Encrypted' : 'Not encrypted' }}
    </span>
    <slot />
  </p>
</template>
