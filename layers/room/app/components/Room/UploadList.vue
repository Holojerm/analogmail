<script setup lang="ts">
import type { RoomUploadItem } from '../../composables/useRoomUpload'

defineProps<{ items: RoomUploadItem[] }>()
defineEmits<{ clear: [] }>()

const LABEL: Record<RoomUploadItem['status'], string> = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  done: 'Added',
  failed: 'Failed',
}
const COLOR = {
  waiting: 'neutral',
  uploading: 'primary',
  done: 'success',
  failed: 'error',
} as const
</script>

<template>
  <section v-if="items.length" aria-label="Uploads" class="rounded-md border border-default p-4">
    <ul class="flex flex-col gap-2" aria-live="polite">
      <li v-for="item in items" :key="item.key" class="flex items-center gap-3">
        <span class="min-w-0 flex-1 truncate text-sm text-default">{{ item.name }}</span>
        <span v-if="item.error" class="text-sm text-error">{{ item.error }}</span>
        <UBadge :color="COLOR[item.status]" variant="subtle">{{ LABEL[item.status] }}</UBadge>
      </li>
    </ul>
    <UButton color="neutral" variant="ghost" size="sm" class="mt-3" @click="$emit('clear')">
      Clear finished
    </UButton>
  </section>
</template>
