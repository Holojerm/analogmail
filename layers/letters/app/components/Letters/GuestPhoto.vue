<script setup lang="ts">
// The one photo a guest's letter may carry. It is redrawn smaller here and
// held on this device until the letter is sent: a guest has no draft on the
// server, so nothing is uploaded before then.
import { PHOTO_ALT_MAX } from '../../../shared/utils/letter-photo'

export interface HeldPhoto {
  image: ArrayBuffer
  width: number
  height: number
  url: string
  alt: string
}

const photo = defineModel<HeldPhoto | null>({ default: null })
const busy = ref(false)
const failure = ref<string | null>(null)

async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  failure.value = null
  try {
    const prepared = await preparePhoto(file)
    const url = prepared ? await photoDataUrl(prepared.image) : null
    if (!prepared || !url) {
      failure.value = 'That file could not be read as a picture. Try a JPEG or a PNG.'
      return
    }
    photo.value = { ...prepared, url, alt: '' }
  } finally {
    busy.value = false
    input.value = ''
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
        :src="photo.url"
        :alt="photo.alt || 'The photo for this letter'"
        :width="photo.width"
        :height="photo.height"
        class="h-auto max-h-80 w-auto self-start rounded-sm border border-default"
      />
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
        @click="photo = null"
      >
        Remove the photo
      </UButton>
    </template>

    <UFormField
      v-else
      label="Add a photo"
      name="photo"
      help="One photo. It is made smaller here and encrypted with the letter when you send it."
    >
      <UInput
        type="file"
        accept="image/*"
        size="lg"
        class="w-full"
        :disabled="busy"
        @change="choose"
      />
      <p v-if="busy" class="mt-2 text-sm text-muted" role="status">Preparing the photo…</p>
    </UFormField>
  </div>
</template>
