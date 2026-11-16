<script setup lang="ts">
// A postage stamp, printed in the house's two inks. Which one a letter carries is
// worked out from its id, so the same letter always wears the same stamp and
// nothing about it is stored or collected. DESIGN.md › Play › The objects.
const props = defineProps<{ seed: string }>()

const MOTIFS = ['plum', 'moon', 'boat', 'sun', 'house', 'leaf', 'bird', 'cup'] as const
const PAPERS = ['blush', 'kraft', 'cream'] as const

const pick = computed(() => {
  let hash = 0
  for (const char of props.seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    motif: MOTIFS[hash % MOTIFS.length]!,
    paper: PAPERS[(hash >>> 3) % PAPERS.length]!,
    tilt: ((hash >>> 5) % 9) - 4,
  }
})
</script>

<template>
  <svg
    viewBox="0 0 40 48"
    aria-hidden="true"
    focusable="false"
    stroke="var(--line)"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
    :style="{ rotate: `${pick.tilt}deg` }"
  >
    <rect x="1" y="1" width="38" height="46" rx="1" fill="var(--art-paper)" />
    <rect
      x="1"
      y="1"
      width="38"
      height="46"
      rx="1"
      fill="none"
      stroke="var(--art-paper)"
      stroke-width="3"
      stroke-dasharray="0.1 4.2"
    />
    <rect x="5" y="5" width="30" height="38" :fill="`var(--art-${pick.paper})`" />
    <g v-if="pick.motif === 'plum'">
      <circle cx="20" cy="27" r="8" fill="var(--art-clay)" />
      <path d="M20 19c0-4 2-6 5-7" fill="none" />
      <path d="M22 15c3-3 7-2 8 0-2 3-6 3-8 0z" fill="var(--art-kraft)" />
    </g>
    <g v-else-if="pick.motif === 'moon'">
      <path d="M24 12a12 12 0 1 0 6 20 10 10 0 0 1-6-20z" fill="var(--art-paper)" />
      <path d="M12 14v3M10.500 15.500h3M29 36v2M28 37h2" fill="none" />
    </g>
    <g v-else-if="pick.motif === 'boat'">
      <path d="M20 12v16l-8 0z" fill="var(--art-paper)" />
      <path d="M22 16v12h7z" fill="var(--art-clay)" />
      <path d="M9 30h22l-4 6H13z" fill="var(--line)" />
      <path d="M8 40q3-2 6 0t6 0 6 0 6 0" fill="none" />
    </g>
    <g v-else-if="pick.motif === 'sun'">
      <circle cx="20" cy="24" r="7" fill="var(--art-clay)" />
      <path
        d="M20 10v3M20 35v3M6 24h3M31 24h3M10 14l2 2M28 32l2 2M30 14l-2 2M12 32l-2 2"
        fill="none"
      />
    </g>
    <g v-else-if="pick.motif === 'house'">
      <path d="M11 24h18v14H11z" fill="var(--art-paper)" />
      <path d="M8 25l12-11 12 11z" fill="var(--art-clay)" />
      <path d="M18 38v-7h4v7" fill="var(--line)" />
      <path d="M26 16v-4h2v6" fill="none" />
    </g>
    <g v-else-if="pick.motif === 'leaf'">
      <path d="M20 38C10 32 10 18 20 10c10 8 10 22 0 28z" fill="var(--art-paper)" />
      <path d="M20 38V16M20 24l-4-3M20 29l5-4" fill="none" />
    </g>
    <g v-else-if="pick.motif === 'bird'">
      <path
        d="M10 28c0-8 6-12 12-12 4 0 7 3 7 6l4 2-4 1c-1 6-6 9-11 9s-8-2-8-6z"
        fill="var(--art-paper)"
      />
      <path d="M14 27c3-1 7 0 8 3" fill="none" />
      <circle cx="25" cy="21" r="0.800" fill="var(--line)" />
      <path d="M17 34v4M21 34v4" fill="none" />
    </g>
    <g v-else>
      <path d="M11 22h16v8a8 8 0 0 1-16 0z" fill="var(--art-paper)" />
      <path d="M27 24h2a3 3 0 0 1 0 6h-2" fill="none" />
      <path d="M8 40h22" fill="none" />
      <path d="M16 18q-2-3 0-5M21 18q-2-3 0-5" fill="none" />
    </g>
  </svg>
</template>
