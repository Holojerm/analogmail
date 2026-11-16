<script setup lang="ts">
// The mantels this person keeps for someone else, and seats they have been
// offered. Their own mantel is `/mantel`.
definePageMeta({ middleware: ['auth', 'keys'] })

interface Kept {
  id: string
  kind: 'child' | 'anniversary'
  name: string
  role: string
}
interface Offer {
  id: string
  mantelName: string
  kind: 'child' | 'anniversary'
  role: string | null
  accepted: boolean
}

const mantelKeys = useMantelKeys()
const { data, refresh } = await useFetch<{ mantels: Kept[]; offers: Offer[] }>('/api/mantels')
const kept = computed(() => data.value?.mantels ?? [])
const offers = computed(() => data.value?.offers ?? [])
const failure = ref<string | null>(null)
const fingerprint = ref<string | null>(null)

const KIND = { child: "A child's mantel", anniversary: 'Anniversary letters' } as const

onMounted(async () => {
  if (offers.value.some((offer) => offer.accepted)) {
    fingerprint.value = await mantelKeys.myFingerprint().catch(() => null)
  }
})

async function act(id: string, action: 'accept' | 'withdraw') {
  failure.value = null
  try {
    await $fetch('/api/mantels/proposals/act', { method: 'POST', body: { id, action } })
    if (action === 'accept') fingerprint.value = await mantelKeys.myFingerprint()
  } catch (error) {
    failure.value =
      (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
  } finally {
    await refresh()
  }
}

useSeo({
  title: 'Mantels you keep',
  description: 'Mantels you keep for a child or a couple.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <LetterNav />
    <div>
      <h1 class="text-3xl text-highlighted">Mantels you keep</h1>
      <p class="mt-2 text-muted">
        A mantel for someone who cannot keep their own yet: a child, or a couple's letters that open
        on their anniversary. Its keepers hold its key. We never do.
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <section v-if="offers.length" aria-labelledby="offers-heading" class="flex flex-col gap-3">
      <h2 id="offers-heading" class="text-xl text-highlighted">You have been asked</h2>
      <UCard v-for="offer in offers" :key="offer.id">
        <div class="flex flex-col gap-3">
          <p>
            <span class="text-highlighted">{{ offer.mantelName }}</span>
            <span class="text-muted"> · {{ KIND[offer.kind] }}</span>
          </p>
          <template v-if="offer.accepted">
            <p class="text-sm text-muted">
              You accepted. Now read these to the keeper who asked you, by phone or in person. They
              see the same on their screen, and then give you the key.
            </p>
            <p
              v-if="fingerprint"
              class="font-mono text-lg text-highlighted"
              data-testid="my-fingerprint"
            >
              {{ fingerprint }}
            </p>
          </template>
          <template v-else>
            <p class="text-sm text-muted">
              Keeping a mantel means holding a copy of its key, so its letters are not lost if
              another keeper loses theirs.
            </p>
            <div class="flex gap-3">
              <UButton @click="act(offer.id, 'accept')">Accept</UButton>
            </div>
          </template>
        </div>
      </UCard>
    </section>

    <section aria-labelledby="kept-heading" class="flex flex-col gap-3">
      <h2 id="kept-heading" class="text-xl text-highlighted">Kept by you</h2>
      <p v-if="kept.length === 0" class="text-muted">You keep no mantels.</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="mantel in kept" :key="mantel.id" class="flex items-center justify-between py-3">
          <div>
            <p class="text-highlighted">{{ mantel.name }}</p>
            <p class="text-sm text-muted">{{ KIND[mantel.kind] }}</p>
          </div>
          <UButton
            size="sm"
            variant="outline"
            color="neutral"
            :to="`/mantels/${mantel.id}`"
            :aria-label="`Open ${mantel.name}`"
          >
            Open
          </UButton>
        </li>
      </ul>
      <UButton to="/mantels/new" class="self-start">Open a new mantel</UButton>
    </section>
  </div>
</template>
