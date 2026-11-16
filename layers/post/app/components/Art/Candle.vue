<script setup lang="ts">
// A candle. It is lit when the lamps are: in dark mode.
</script>

<template>
  <svg
    viewBox="0 0 32 72"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <g class="flame opacity-0 dark:opacity-100">
      <path d="M16 30c-5-5-3-10 0-16 3 6 5 11 0 16z" fill="var(--art-kraft)" />
    </g>
    <path d="M16 34v-4" />
    <rect x="11" y="34" width="10" height="26" rx="1" fill="var(--art-paper)" />
    <path d="M6 62h20l-2 8H8z" fill="var(--art-blush)" />
    <path d="M2 70h28" />
  </svg>
</template>

<style scoped>
.flame {
  transform-origin: 16px 30px;
  animation: flicker 1.3s ease-in-out infinite;
}
</style>
