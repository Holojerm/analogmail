<script setup lang="ts">
// A copy of your letters to keep: one archive per correspondence, made on
// this device from the letters you sent and the ones you have opened.
import { fileSafe, type ArchiveShelf } from '../../shared/utils/archive'
import { buildArchive } from '../utils/archive-build'
import { saveFile } from '../utils/save-file'

definePageMeta({ middleware: ['auth', 'keys'] })

const { data } = await useFetch<{ shelves: ArchiveShelf[] }>('/api/letters/archive')
const shelves = computed(() => data.value?.shelves ?? [])
const letterKeys = useLetterKeys()

const working = ref<string | null>(null)
const progress = ref('')
const outcome = ref<{ id: string; text: string; failed: boolean } | null>(null)

const title = (shelf: ArchiveShelf) => shelf.name || 'Someone who has left'
const count = (n: number) => `${n} ${n === 1 ? 'letter' : 'letters'}`

function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

async function keep(shelf: ArchiveShelf) {
  working.value = shelf.correspondenceId
  outcome.value = null
  progress.value = 'Opening your letters…'
  try {
    const day = today()
    const built = await buildArchive(shelf, letterKeys.open, day, (done, total) => {
      progress.value = `Opening letter ${Math.min(done + 1, total)} of ${total}…`
    })
    if (built.letters === 0) {
      outcome.value = {
        id: shelf.correspondenceId,
        text: 'None of these letters could be opened on this device.',
        failed: true,
      }
      return
    }
    saveFile(built.blob, `Dear Mantel ${fileSafe(title(shelf))} ${day}.zip`)
    outcome.value = {
      id: shelf.correspondenceId,
      text:
        built.skipped > 0
          ? `Saved ${count(built.letters)}. ${count(built.skipped)} could not be opened on this device and ${built.skipped === 1 ? 'was' : 'were'} left out.`
          : `Saved ${count(built.letters)}.`,
      failed: false,
    }
  } catch {
    outcome.value = {
      id: shelf.correspondenceId,
      text: 'The copy could not be made. Check your connection and try again.',
      failed: true,
    }
  } finally {
    working.value = null
    progress.value = ''
  }
}

useSeo({
  title: 'Keep a copy',
  description: 'Save a copy of your letters to this device.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <LetterNav />
    <div class="flex flex-col gap-3">
      <h1 class="text-3xl text-highlighted">Keep a copy</h1>
      <p class="text-muted">
        Save your letters to this device: one page with every letter, each letter as a text file,
        and the photos. The copy is made here, from the letters you sent and the ones you have
        opened.
      </p>
      <p class="text-muted">
        The copy is not encrypted. Anyone who has the file can read it, so keep it where you would
        keep the letters themselves.
      </p>
    </div>

    <p v-if="shelves.length === 0" class="text-muted">There are no letters to copy yet.</p>

    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="shelf in shelves" :key="shelf.correspondenceId" class="flex flex-col gap-2 py-4">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate text-highlighted">{{ title(shelf) }}</p>
            <p class="text-sm text-muted">
              {{ count(shelf.entries.length) }}
              <template v-if="shelf.unopened">
                · {{ shelf.unopened }} unopened, left out until you open
                {{ shelf.unopened === 1 ? 'it' : 'them' }}
              </template>
            </p>
          </div>
          <UButton
            variant="outline"
            color="neutral"
            :disabled="shelf.entries.length === 0 || working !== null"
            :loading="working === shelf.correspondenceId"
            :aria-label="`Save a copy of your letters with ${title(shelf)}`"
            @click="keep(shelf)"
          >
            Save a copy
          </UButton>
        </div>
        <p v-if="working === shelf.correspondenceId" class="text-sm text-muted" role="status">
          {{ progress }}
        </p>
        <p
          v-else-if="outcome?.id === shelf.correspondenceId"
          class="text-sm"
          :class="outcome.failed ? 'text-error' : 'text-muted'"
          role="status"
        >
          {{ outcome.text }}
        </p>
      </li>
    </ul>
  </div>
</template>
