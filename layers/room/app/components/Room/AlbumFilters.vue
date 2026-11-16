<script setup lang="ts">
// The album switcher. `selected`: an album id, 'none', or undefined for all.
import type { RoomAlbum } from '../../../shared/utils/room-types'

defineProps<{ albums: RoomAlbum[]; selected?: string; canAdd: boolean }>()
defineEmits<{ create: [] }>()

const chip = (active: boolean) => ({
  color: active ? ('primary' as const) : ('neutral' as const),
  variant: active ? ('subtle' as const) : ('ghost' as const),
  'aria-current': active ? ('page' as const) : undefined,
})
</script>

<template>
  <nav aria-label="Albums" class="flex flex-wrap items-center gap-2">
    <UButton :to="{ query: {} }" size="sm" v-bind="chip(selected === undefined)">All</UButton>
    <UButton
      v-for="album in albums"
      :key="album.id"
      :to="{ query: { album: album.id } }"
      size="sm"
      v-bind="chip(selected === album.id)"
    >
      {{ album.name }}
      <span class="text-xs text-muted tabular-nums">{{ album.photoCount }}</span>
    </UButton>
    <UButton
      v-if="albums.length"
      :to="{ query: { album: 'none' } }"
      size="sm"
      v-bind="chip(selected === 'none')"
    >
      Not in an album
    </UButton>
    <UButton
      v-if="canAdd"
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-plus"
      @click="$emit('create')"
    >
      New album
    </UButton>
  </nav>
</template>
