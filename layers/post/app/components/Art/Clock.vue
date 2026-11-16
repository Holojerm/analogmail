<script setup lang="ts">
// The mantel clock. It tells the real time where the reader is, because a
// product about waiting should know what time it is. Its pendulum never
// stops (unless motion is turned down).
const now = ref<Date | null>(null)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = new Date()
  timer = setInterval(() => (now.value = new Date()), 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

// Ten past ten until the browser says otherwise: the server has no idea what
// time it is where the reader lives.
const hour = computed(() =>
  now.value ? ((now.value.getHours() % 12) + now.value.getMinutes() / 60) * 30 : 305,
)
const minute = computed(() => (now.value ? now.value.getMinutes() * 6 : 60))
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
    <path d="M6 70V26a18 18 0 0 1 36 0v44z" fill="var(--art-kraft)" />
    <circle cx="24" cy="26" r="12" fill="var(--art-paper)" />
    <g stroke="var(--line)">
      <path d="M24 26V19" :style="{ rotate: `${hour}deg`, transformOrigin: '24px 26px' }" />
      <path
        d="M24 26V16.500"
        stroke-width="1.5"
        :style="{ rotate: `${minute}deg`, transformOrigin: '24px 26px' }"
      />
    </g>
    <rect x="16" y="44" width="16" height="20" rx="2" fill="var(--art-paper)" />
    <g class="clock-pendulum">
      <path d="M24 44v12" />
      <circle cx="24" cy="58" r="3" fill="var(--art-clay)" />
    </g>
    <path d="M3 70h42" />
  </svg>
</template>

<style scoped>
.clock-pendulum {
  transform-origin: 24px 44px;
  animation: pendulum 1s ease-in-out infinite alternate;
}
</style>
