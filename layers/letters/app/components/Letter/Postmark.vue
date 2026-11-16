<script setup lang="ts">
// A postmark: the one date that is stamped on something, and so the one date
// that is styled. DESIGN.md › Voice › Time.
defineProps<{
  /** 'YYYY-MM-DD', the sender's calendar. */
  date: string
}>()
</script>

<template>
  <span class="font-mono text-xs tracking-wide text-muted uppercase">
    <span class="sr-only">Postmarked </span>{{ postmarkDay(date) }}
  </span>
</template>
