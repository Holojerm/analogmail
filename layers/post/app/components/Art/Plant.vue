<script setup lang="ts">
// A plant in a pot, for the end of a shelf. Its leaves move as if a window
// were open somewhere.
</script>

<template>
  <svg
    viewBox="0 0 48 72"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <g class="leaf leaf-a">
      <path d="M24 50C12 44 8 30 12 18c10 4 14 18 12 32z" fill="var(--art-kraft)" />
    </g>
    <g class="leaf leaf-b">
      <path d="M24 50c-2-14 2-30 12-36 6 12 0 28-12 36z" fill="var(--art-kraft)" />
    </g>
    <g class="leaf leaf-c">
      <path d="M24 50c-4-10-2-24 0-34 6 8 6 24 0 34z" fill="var(--art-kraft)" />
    </g>
    <path d="M12 50h24l-3 20H15z" fill="var(--art-clay)" />
    <path d="M10 50h28" />
    <path d="M3 70h42" />
  </svg>
</template>

<style scoped>
.leaf {
  transform-origin: 24px 50px;
  animation: rustle 5s ease-in-out infinite alternate;
}
.leaf-b {
  animation-duration: 6.2s;
  animation-direction: alternate-reverse;
}
.leaf-c {
  animation-duration: 7.4s;
}
</style>
