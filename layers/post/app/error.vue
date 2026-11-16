<script setup lang="ts">
// The page for anything that goes wrong on the way to a page, a missing
// address above all. It keeps the house around it, so nobody is stranded.
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const missing = computed(() => props.error.statusCode === 404)

useHead({ title: missing.value ? 'Not at this address' : 'Something came unstuck' })
</script>

<template>
  <UApp>
    <NuxtLayout>
      <div class="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center">
        <div class="flex items-end gap-3" aria-hidden="true">
          <ArtPostbox class="h-28" />
          <ArtCat class="h-12" />
        </div>
        <h1 class="text-3xl text-highlighted">
          {{ missing ? 'Nothing was ever posted here' : 'Something came unstuck' }}
        </h1>
        <p class="font-serif text-lg text-toned">
          {{
            missing
              ? 'There is no page at this address. It may have moved, or the link lost a letter on the way.'
              : 'That one is on us, not you. Try again in a moment.'
          }}
        </p>
        <UButton @click="clearError({ redirect: '/' })">Go home</UButton>
      </div>
    </NuxtLayout>
  </UApp>
</template>
