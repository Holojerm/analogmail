<script setup lang="ts">
// One photo, large. Whoever added it, or the family's organiser, can caption
// it, move it or delete it; the server holds the same rule.
import {
  ROOM_CAPTION_MAX,
  roomPhotoSrc,
  type RoomAlbum,
  type RoomPhoto,
} from '../../../shared/utils/room-types'

const props = defineProps<{
  familyId: string
  photo: RoomPhoto
  albums: RoomAlbum[]
  canEdit: boolean
}>()
const emit = defineEmits<{ changed: [] }>()
const open = defineModel<boolean>('open', { required: true })

const by = computed(() => props.photo.uploaderName ?? 'someone in the family')
const addedOn = computed(() =>
  new Date(props.photo.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }),
)

const caption = ref('')
const albumId = ref('none')
watch(
  () => props.photo,
  (photo) => {
    caption.value = photo.caption ?? ''
    albumId.value = photo.albumId ?? 'none'
  },
  { immediate: true },
)
const albumItems = computed(() => [
  { label: 'No album', value: 'none' },
  ...props.albums.map((album) => ({ label: album.name, value: album.id })),
])

const busy = ref<'save' | 'delete' | null>(null)
const failure = ref<string | null>(null)
const address = computed(() => `/api/room/${props.familyId}/photos/${props.photo.id}`)

async function run(action: 'save' | 'delete', request: () => Promise<unknown>) {
  busy.value = action
  failure.value = null
  try {
    await request()
    if (action === 'delete') open.value = false
    emit('changed')
  } catch (error) {
    failure.value = apiErrorMessage(error, 'That did not work. Try again.')
  } finally {
    busy.value = null
  }
}

// Explicit type arguments: inferring the route from a plain `string` makes
// Nuxt 4.6's typed-route matcher recurse past TypeScript's depth limit.
const save = () =>
  run('save', () =>
    $fetch<unknown, string>(address.value, {
      method: 'PATCH',
      body: {
        caption: caption.value.trim() || null,
        albumId: albumId.value === 'none' ? null : albumId.value,
      },
    }),
  )
const remove = () =>
  run('delete', () => $fetch<unknown, string>(address.value, { method: 'DELETE' }))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="photo.caption || 'A family photo'"
    :description="`Added by ${by} on ${addedOn}`"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <img
          :src="roomPhotoSrc(familyId, photo.id, 'full')"
          :alt="photo.caption || `A photo added by ${by}`"
          :width="photo.width"
          :height="photo.height"
          class="max-h-[70dvh] w-full rounded-sm bg-muted object-contain"
        />
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="failure"
        />
        <form v-if="canEdit" class="flex flex-col gap-4" @submit.prevent="save">
          <UFormField label="Caption" name="caption">
            <UInput v-model="caption" :maxlength="ROOM_CAPTION_MAX" size="lg" class="w-full" />
          </UFormField>
          <UFormField v-if="albums.length" label="Album" name="album">
            <USelect v-model="albumId" :items="albumItems" size="lg" class="w-full" />
          </UFormField>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <UButton type="submit" :loading="busy === 'save'">Save</UButton>
            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :loading="busy === 'delete'"
              @click="remove"
            >
              Delete photo
            </UButton>
          </div>
        </form>
      </div>
    </template>
  </UModal>
</template>
