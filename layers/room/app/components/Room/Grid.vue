<script setup lang="ts">
import { roomPhotoSrc, type RoomPhoto } from '../../../shared/utils/room-types'

defineProps<{ familyId: string; photos: RoomPhoto[] }>()
defineEmits<{ open: [photo: RoomPhoto] }>()
</script>

<template>
  <p v-if="!photos.length" class="text-muted">No photos here yet.</p>
  <ul v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
    <li v-for="photo in photos" :key="photo.id">
      <button
        type="button"
        class="block aspect-square w-full overflow-hidden rounded-sm border border-default bg-muted focus-visible:outline-2 focus-visible:outline-primary"
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
