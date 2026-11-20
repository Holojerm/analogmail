<script setup lang="ts">
// A copy of the room to keep: every photo, with a page that shows them, made
// on this device. A large room comes in several parts so that no part has to
// be held in memory at once.
import { saveFile } from '#layers/post/app/utils/save-file'

import { roomExportParts, type RoomExport } from '../../../../shared/utils/room-export'
import { buildRoomExportPart } from '../../../utils/build-room-export'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const familyId = String(route.params.family)
const { appName } = useRuntimeConfig().public

const { data: room, error } = await useFetch<RoomExport>(`/api/room/${familyId}/export`)
const parts = computed(() => roomExportParts(room.value?.photos ?? []))

const working = ref<number | null>(null)
const progress = ref('')
const outcome = ref<{ part: number; text: string; failed: boolean } | null>(null)

const megabytes = (photos: { sizeBytes: number }[]) => {
  const total = photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) / 1024 ** 2
  return total < 1 ? 'under 1 MB' : `${Math.round(total)} MB`
}
const count = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`

async function keep(index: number) {
  if (!room.value) return
  working.value = index
  outcome.value = null
  progress.value = 'Fetching the photos…'
  try {
    const built = await buildRoomExportPart(
      room.value,
      parts.value,
      index,
      new Date(),
      appName,
      (done, of) => {
        progress.value = `Fetching photo ${Math.min(done + 1, of)} of ${of}…`
      },
    )
    saveFile(built.blob, built.name)
    const saved = (parts.value[index]?.length ?? 0) - built.missing
    outcome.value = {
      part: index,
      text:
        built.missing > 0
          ? `Saved ${count(saved)}. ${count(built.missing)} had been deleted and ${built.missing === 1 ? 'was' : 'were'} left out.`
          : `Saved ${count(saved)}.`,
      failed: false,
    }
  } catch {
    outcome.value = {
      part: index,
      text: 'The copy could not be made. Check your connection and try again.',
      failed: true,
    }
  } finally {
    working.value = null
  }
}

useSeo({
  title: 'Keep a copy of the room',
  description: 'Save every photo in a family room to your own device.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
    <UAlert
      v-if="error || !room"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      description="You are not in that family."
    />

    <template v-else>
      <header>
        <p class="text-sm text-muted">The room of {{ room.family.name }}</p>
        <h1 class="text-3xl text-highlighted">Keep a copy</h1>
      </header>
      <RoomTabs :family-id="familyId" />
      <RoomNotice />

      <p class="font-serif text-lg text-toned">
        Every photo in the room as it is stored, in folders by album, with a page that shows them
        beside their captions and a list of where everyone says they are. The copy is made on this
        device and saved as a zip file. It is yours whatever happens to {{ appName }}.
      </p>

      <p v-if="parts.length === 0" class="text-muted">There are no photos in this room yet.</p>
      <p v-else-if="parts.length > 1" class="text-sm text-muted">
        This room is large, so the copy comes in {{ parts.length }} parts. Save each one; every part
        opens on its own.
      </p>

      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="(part, index) in parts"
          :key="index"
          class="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div>
            <p class="text-highlighted">
              {{ parts.length > 1 ? `Part ${index + 1} of ${parts.length}` : 'The whole room' }}
            </p>
            <p class="text-sm text-muted">{{ count(part.length) }}, {{ megabytes(part) }}</p>
            <p
              v-if="outcome?.part === index"
              class="mt-1 text-sm"
              :class="outcome.failed ? 'text-error' : 'text-muted'"
              role="status"
            >
              {{ outcome.text }}
            </p>
            <p v-else-if="working === index" class="mt-1 text-sm text-muted" role="status">
              {{ progress }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-download"
            :loading="working === index"
            :disabled="working !== null && working !== index"
            @click="keep(index)"
          >
            {{ parts.length > 1 ? `Save part ${index + 1}` : 'Save the copy' }}
          </UButton>
        </li>
      </ul>
    </template>
  </div>
</template>
