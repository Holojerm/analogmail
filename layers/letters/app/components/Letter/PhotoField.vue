<script setup lang="ts">
// The one photo a letter may carry, while it is being written. The picture is
// resized and encrypted here before anything is sent.
import { PHOTO_ALT_MAX, type LetterPhoto } from '../../../shared/utils/letter-photo'

const props = defineProps<{
  letterId: string
  /** The letter's content key, which never leaves this device unwrapped. */
  contentKey: () => Uint8Array<ArrayBuffer> | null
  /** Makes sure the draft exists on the server, since a photo belongs to one. */
  ensureDraft: () => Promise<boolean>
}>()
const photo = defineModel<LetterPhoto | undefined>('photo')
const url = defineModel<string | null>('url', { default: null })

const busy = ref(false)
const failure = ref<string | null>(null)

const REASONS = {
  unreadable: 'That file could not be read as a picture. Try a JPEG or a PNG.',
  'too-large': 'That photo is too large to send.',
  failed: 'The photo was not saved. Check your connection and try again.',
} as const

async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const key = props.contentKey()
  if (!file || !key) return
  busy.value = true
  failure.value = null
  try {
    if (!(await props.ensureDraft())) {
      failure.value = REASONS.failed
      return
    }
    const result = await uploadLetterPhoto(key, props.letterId, file)
    if (!result.ok) {
      failure.value = REASONS[result.reason]
      return
    }
    url.value = result.url
    photo.value = result.photo
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function remove() {
  busy.value = true
  failure.value = null
  try {
    if (!(await removeLetterPhoto(props.letterId))) {
      failure.value = 'The photo was not removed. Try again.'
      return
    }
    photo.value = undefined
    url.value = null
  } finally {
    busy.value = false
  }
}

const describe = (alt: string | number) => {
  if (photo.value) photo.value = { ...photo.value, alt: String(alt) }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="photo">
      <img
        v-if="url"
        :src="url"
        :alt="photo.alt || 'The photo for this letter'"
        :width="photo.width"
        :height="photo.height"
        class="h-auto max-h-80 w-auto self-start rounded-sm border border-default"
      />
      <p v-else class="text-sm text-muted">
        This letter has a photo, which could not be opened on this device.
      </p>
      <UFormField
        label="Describe the photo"
        name="photo-alt"
        help="For a reader who cannot see it. It is encrypted with the letter."
      >
        <UInput
          :model-value="photo.alt"
          :maxlength="PHOTO_ALT_MAX"
          class="w-full"
          @update:model-value="describe"
        />
      </UFormField>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        class="self-start"
        :loading="busy"
        @click="remove"
      >
        Remove the photo
      </UButton>
    </template>

    <UFormField
      v-else
      label="Add a photo"
      name="photo"
      help="One photo. It is made smaller and encrypted on this device before it is saved."
    >
      <UInput
        type="file"
        accept="image/*"
        size="lg"
        class="w-full"
        :disabled="busy"
        @change="choose"
      />
      <p v-if="busy" class="mt-2 text-sm text-muted" role="status">Encrypting the photo…</p>
    </UFormField>
  </div>
</template>
