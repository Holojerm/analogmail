<script setup lang="ts">
// The cat of the house, asleep. It carries nothing and goes nowhere: it is
// here so that an empty shelf is not an empty screen.
</script>

<template>
  <svg
    viewBox="0 0 96 56"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <g class="cat-tail">
      <path d="M70 46c14 2 20-6 16-16" fill="none" stroke-width="6" />
      <path d="M70 46c14 2 20-6 16-16" fill="none" stroke="var(--art-clay)" stroke-width="3" />
    </g>
    <g class="cat-body">
      <path d="M22 54c-6-16 6-30 28-30s32 14 26 30z" fill="var(--art-clay)" />
    </g>
    <path d="M10 34l2-12 9 6M36 28l7-8 3 12" fill="var(--art-clay)" />
    <ellipse cx="26" cy="40" rx="17" ry="13" fill="var(--art-clay)" />
    <g stroke="var(--line)" fill="none" stroke-width="1.5">
      <path d="M17 40q3 3 6 0M29 40q3 3 6 0" />
      <path d="M25 44l1 1.500 1-1.500" />
      <path d="M12 44l-8-1M12 46l-7 2M40 44l8-1M40 46l7 2" stroke-width="1" />
    </g>
    <path d="M2 54h92" />
  </svg>
</template>

<style scoped>
.cat-body {
  transform-origin: 50px 54px;
  animation: breathe 3.2s ease-in-out infinite alternate;
}
.cat-tail {
  transform-origin: 70px 46px;
  animation: tail 6s ease-in-out infinite;
}
</style>
