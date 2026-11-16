<script setup lang="ts">
// A pen squiggle under a word. It draws itself once, when it is first seen.
</script>

<template>
  <svg
    viewBox="0 0 120 12"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="var(--ui-primary)"
    stroke-width="3"
    stroke-linecap="round"
    class="squiggle h-3 w-full"
  >
    <path d="M3 7c10-6 18 6 28 0s18-6 28 0 18 6 28 0 18-6 30 1" pathLength="1" />
  </svg>
</template>

<style scoped>
.squiggle path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 700ms 250ms ease-out forwards;
}
</style>
