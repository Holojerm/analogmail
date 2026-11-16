<script setup lang="ts">
import { roomPhotoSrc, type RoomPhoto } from '../../../shared/utils/room-types'

defineProps<{ familyId: string; photos: RoomPhoto[] }>()
defineEmits<{ open: [photo: RoomPhoto] }>()
</script>

<template>
  <p v-if="!photos.length" class="text-muted">No photos here yet.</p>
  <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
    <!-- Prints laid on a table: none quite straight, and one straightens up
         when you reach for it. DESIGN.md › Play › The little things. -->
    <li
      v-for="photo in photos"
      :key="photo.id"
      class="play-rise transition-[rotate,translate] duration-200 ease-(--ease-spring) odd:-rotate-1 even:rotate-1 hover:-translate-y-1 hover:rotate-0"
    >
      <button
        type="button"
        class="block aspect-square w-full overflow-hidden rounded-sm border-4 border-(--ui-bg-elevated) bg-muted ring-1 ring-default focus-visible:outline-2 focus-visible:outline-primary"
        :aria-label="photo.caption ? `Open photo: ${photo.caption}` : 'Open photo'"
        @click="$emit('open', photo)"
      >
        <img
          :src="roomPhotoSrc(familyId, photo.id, 'thumb')"
          :alt="photo.caption ?? ''"
          loading="lazy"
          class="size-full object-cover"
        />
      </button>
    </li>
  </ul>
</template>
