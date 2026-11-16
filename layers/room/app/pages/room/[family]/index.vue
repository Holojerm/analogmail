<script setup lang="ts">
// One family's room: its photo album. Any member adds photos and albums;
// whoever added something, or the organiser, can change or remove it.
import type { RoomAlbum, RoomFamily, RoomPhoto } from '../../../../shared/utils/room-types'

definePageMeta({ middleware: 'auth' })

interface RoomView {
  family: RoomFamily
  me: string
  albums: RoomAlbum[]
  usage: { photos: number; bytes: number; limit: number }
}
interface PhotoPage {
  photos: RoomPhoto[]
  nextCursor: string | null
}

const route = useRoute()
const router = useRouter()
const familyId = String(route.params.family)
const base = `/api/room/${familyId}`

// `?album=<id>`, `?album=none`, or absent for every photo.
const album = computed(() =>
  typeof route.query.album === 'string' ? route.query.album : undefined,
)
const uploadTarget = computed(() => (album.value && album.value !== 'none' ? album.value : null))

const { data: room, refresh: refreshRoom, error } = await useFetch<RoomView>(base)
const family = computed(() => room.value?.family ?? null)
const albums = computed(() => room.value?.albums ?? [])
const current = computed(() => albums.value.find((entry) => entry.id === album.value))
const canAdd = computed(() => Boolean(family.value && !family.value.closed))

const { data: firstPage, refresh: refreshPhotos } = await useFetch<PhotoPage>(`${base}/photos`, {
  query: { album },
  default: () => ({ photos: [], nextCursor: null }),
})
// Later pages append here; a new first page (album switch, upload) resets them.
const more = ref<RoomPhoto[]>([])
const cursor = ref<string | null>(null)
watch(
  firstPage,
  (page) => {
    more.value = []
    cursor.value = page.nextCursor
  },
  { immediate: true },
)
const photos = computed(() => [...firstPage.value.photos, ...more.value])

const failure = ref<string | null>(null)
const loadingMore = ref(false)
async function loadMore() {
  if (!cursor.value) return
  loadingMore.value = true
  try {
    const page = await $fetch<PhotoPage>(`${base}/photos`, {
      query: { album: album.value, cursor: cursor.value },
    })
    more.value.push(...page.photos)
    cursor.value = page.nextCursor
  } catch (caught) {
    failure.value = apiErrorMessage(caught, 'Could not load more photos.')
  } finally {
    loadingMore.value = false
  }
}

const refreshAll = () => Promise.all([refreshPhotos(), refreshRoom()])

const fileInput = ref<HTMLInputElement>()
const {
  items: uploads,
  busy: uploading,
  upload,
  clearFinished,
} = useRoomUpload(familyId, refreshAll)
function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void upload(files, uploadTarget.value)
}

// ── Albums ──────────────────────────────────────────────────────────────────
const nameModal = ref<'create' | 'rename' | null>(null)
const nameModalOpen = computed({
  get: () => nameModal.value !== null,
  set: (open) => {
    if (!open) nameModal.value = null
  },
})
const savingName = ref(false)

async function saveName(name: string) {
  savingName.value = true
  failure.value = null
  try {
    if (nameModal.value === 'create') {
      const created = await $fetch<{ id: string }>(`${base}/albums`, {
        method: 'POST',
        body: { name },
      })
      await router.push({ query: { album: created.id } })
    } else if (current.value) {
      await $fetch(`${base}/albums/${current.value.id}`, { method: 'PATCH', body: { name } })
    }
    await refreshRoom()
    nameModal.value = null
  } catch (caught) {
    failure.value = apiErrorMessage(caught, 'Could not save that album.')
  } finally {
    savingName.value = false
  }
}

async function deleteAlbum() {
  if (!current.value) return
  failure.value = null
  try {
    await $fetch(`${base}/albums/${current.value.id}`, { method: 'DELETE' })
    await router.push({ query: {} })
    await refreshAll()
  } catch (caught) {
    failure.value = apiErrorMessage(caught, 'Could not delete that album.')
  }
}

const mine = (ownerId: string | null) =>
  Boolean(room.value && (room.value.family.organiser || room.value.me === ownerId))
const canEditAlbum = computed(() => Boolean(current.value) && mine(current.value!.createdBy))

// ── Viewer ──────────────────────────────────────────────────────────────────
const viewing = ref<RoomPhoto | null>(null)
const viewerOpen = ref(false)
function view(photo: RoomPhoto) {
  viewing.value = photo
  viewerOpen.value = true
}

function size(bytes: number): string {
  const megabytes = bytes / 1024 ** 2
  if (megabytes >= 1024) return `${Math.round(megabytes / 102.4) / 10} GB`
  return megabytes < 1 ? 'under 1 MB' : `${Math.round(megabytes)} MB`
}
const heading = computed(() => {
  if (album.value === 'none') return 'Not in an album'
  return current.value?.name ?? 'All photos'
})

useSeo({ title: 'Family room', description: "A family's shared photos.", noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 py-12">
    <LetterNav />

    <UAlert
      v-if="error || !family"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      description="You are not in that family."
    />

    <template v-else>
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-sm text-muted">The room of {{ family.name }}</p>
          <h1 class="text-3xl text-highlighted">{{ heading }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <template v-if="canEditAlbum">
            <UButton color="neutral" variant="ghost" size="sm" @click="nameModal = 'rename'">
              Rename album
            </UButton>
            <UButton color="error" variant="ghost" size="sm" @click="deleteAlbum">
              Delete album
            </UButton>
          </template>
          <template v-if="canAdd">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              multiple
              class="sr-only"
              tabindex="-1"
              aria-label="Choose photos to add"
              @change="onFiles"
            />
            <UButton icon="i-lucide-image-plus" :loading="uploading" @click="fileInput?.click()">
              Add photos
            </UButton>
          </template>
        </div>
      </header>

      <RoomTabs :family-id="familyId" />
      <RoomNotice />
      <UAlert
        v-if="family.closed"
        color="neutral"
        variant="subtle"
        icon="i-lucide-archive"
        description="This family is closed. Its photos stay here for its members; nothing new can be added."
      />
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <RoomAlbumFilters
        :albums="albums"
        :selected="album"
        :can-add="canAdd"
        @create="nameModal = 'create'"
      />
      <RoomUploadList :items="uploads" @clear="clearFinished" />
      <RoomGrid :family-id="familyId" :photos="photos" @open="view" />

      <UButton
        v-if="cursor"
        color="neutral"
        variant="outline"
        class="self-center"
        :loading="loadingMore"
        @click="loadMore"
      >
        Load more
      </UButton>

      <p v-if="room" class="text-sm text-muted">
        {{ room.usage.photos }} {{ room.usage.photos === 1 ? 'photo' : 'photos' }},
        {{ size(room.usage.bytes) }} of {{ size(room.usage.limit) }}. Photos are made smaller on
        your device before they are sent, which also removes where they were taken. A photo you add
        stays with the family if you leave it; delete it first if you want it gone.
        <ULink :to="`/room/${familyId}/keep`" class="underline underline-offset-4">
          Keep a copy of the room
        </ULink>
      </p>

      <RoomPhotoViewer
        v-if="viewing"
        v-model:open="viewerOpen"
        :family-id="familyId"
        :photo="viewing"
        :albums="albums"
        :can-edit="mine(viewing.uploadedBy)"
        @changed="refreshAll"
      />
      <RoomNameModal
        v-model:open="nameModalOpen"
        v-model:saving="savingName"
        :title="nameModal === 'rename' ? 'Rename album' : 'New album'"
        :submit-label="nameModal === 'rename' ? 'Save' : 'Create album'"
        :initial-name="nameModal === 'rename' ? current?.name : ''"
        @submit="saveName"
      />
    </template>
  </div>
</template>
