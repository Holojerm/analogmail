<script setup lang="ts">
// A sealed envelope. With `stamped`, its stamp lands with a thunk (after
// --stamp-delay), which is how sealing a letter ends.
defineProps<{ stamped?: boolean }>()
</script>

<template>
  <svg
    viewBox="0 0 120 80"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <rect x="2" y="2" width="116" height="76" rx="3" fill="var(--art-paper)" />
    <path d="M2 4l58 40 58-40" fill="none" stroke="var(--ui-primary)" />
    <g :class="{ 'envelope-stamp': stamped }">
      <rect x="92" y="8" width="18" height="22" fill="var(--art-kraft)" />
      <circle cx="101" cy="19" r="4" fill="var(--art-clay)" stroke-width="1.5" />
    </g>
    <path d="M14 58h36M14 66h24" stroke="var(--ui-border-accented)" />
  </svg>
</template>

<style scoped>
.envelope-stamp {
  transform-box: fill-box;
  transform-origin: center;
  animation: thunk 380ms var(--ease-spring) both;
  animation-delay: var(--stamp-delay, 0ms);
}
</style>
