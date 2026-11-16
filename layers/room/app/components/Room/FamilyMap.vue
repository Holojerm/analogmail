<script setup lang="ts">
// The family's map. The geography arrives as SVG paths drawn on our server.
// Decorative: the list under it says every city in words, so the whole map is
// hidden from assistive technology.
import type { RoomMap } from '../../../shared/utils/room-types'

defineProps<{ map: RoomMap }>()
</script>

<template>
  <div class="overflow-hidden rounded-md border border-default bg-elevated/40" data-testid="map">
    <svg
      :viewBox="`0 0 ${map.width} ${map.height}`"
      class="block h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <g class="text-muted" fill="none" stroke="currentColor">
        <path v-if="map.outline" :d="map.outline" stroke-opacity="0.5" />
        <path :d="map.graticule" stroke-width="0.5" stroke-opacity="0.2" />
        <path :d="map.land" fill="currentColor" fill-opacity="0.14" stroke-opacity="0.7" />
        <path :d="map.borders" stroke-width="0.5" stroke-opacity="0.35" />
      </g>

      <!-- A pin pushed into the map: it lands once and then stays put. It never
           pulses, because this is where someone said they are, not where they
           are being watched. -->
      <g
        v-for="(point, index) in map.points"
        :key="point.id"
        class="map-pin text-primary"
        :style="{ animationDelay: `${200 + index * 90}ms` }"
        data-testid="map-place"
      >
        <circle
          :cx="point.x"
          :cy="point.y"
          :r="point.people > 1 ? 11 : 6"
          fill="currentColor"
          stroke="var(--line)"
          stroke-width="2"
        />
        <text
          v-if="point.people > 1"
          :x="point.x"
          :y="point.y"
          text-anchor="middle"
          dominant-baseline="central"
          class="fill-(--ui-bg) text-xs font-medium"
        >
          {{ point.people }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.map-pin {
  transform-box: fill-box;
  transform-origin: center;
  animation: pop 420ms var(--ease-spring) both;
}
</style>
