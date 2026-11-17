<script setup lang="ts">
// One letter from the mantel, decrypted on this device.
import type { ReadLetter } from '../../composables/useOpenLetter'

definePageMeta({ middleware: ['auth', 'keys'] })

const route = useRoute()
const openLetter = useOpenLetter()
const letter = ref<ReadLetter | null>(null)
const loading = ref(true)
const failure = ref<string | null>(null)

onMounted(async () => {
  try {
    letter.value = await openLetter(String(route.params.id))
    if (!letter.value) failure.value = 'This letter could not be opened on this device.'
  } catch {
    failure.value = 'That letter is not on your mantel.'
  } finally {
    loading.value = false
  }
})

const heading = computed(() => {
  const opened = letter.value
  if (!opened) return 'A letter'
  if (opened.news) {
    return opened.kind === 'return'
      ? `Returned: your news of ${opened.news}`
      : `News of ${opened.news}`
  }
  if (opened.kind === 'return') {
    return opened.name ? `Returned: your letter to ${opened.name}` : 'Returned: your letter'
  }
  return opened.name ? `From ${opened.name}` : 'A letter'
})

useSeo({
  title: 'A letter',
  description: 'A letter from your mantel.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-8 sm:py-12">
    <p v-if="loading" class="text-muted" role="status">Opening…</p>

    <template v-else>
      <div>
        <h1 class="text-3xl text-highlighted">{{ heading }}</h1>
        <p
          v-if="letter?.postmark"
          class="mt-2 font-mono text-xs tracking-wide text-muted uppercase"
        >
          <template v-if="letter.news && letter.kind === 'letter' && letter.name">
            From {{ letter.name }} ·
          </template>
          Postmarked {{ longDay(letter.postmark) }}
        </p>
      </div>

      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <template v-if="letter">
        <UAlert
          v-if="letter.kind === 'return'"
          color="info"
          variant="subtle"
          icon="i-lucide-undo-2"
          title="Returned to sender"
          description="This letter could not be delivered, so it has come back to you."
        />
        <p v-else-if="letter.inReplyTo" class="text-sm text-muted">
          A reply to
          <ULink :to="{ path: '/write', query: { letter: letter.inReplyTo } }" class="underline">
            a letter you sent</ULink
          >.
        </p>

        <!-- The sheet unfolds once as the letter is opened. -->
        <div class="play-unfold">
          <LetterPaper :doc="letter.doc" :photo-url="letter.photoUrl" />
        </div>

        <UButton
          v-if="letter.canReply"
          :to="{
            path: '/write',
            query: { to: letter.correspondenceId, reply: letter.letterId },
          }"
          class="self-start"
        >
          Reply
        </UButton>

        <WhoReads encrypted>This letter was opened on your device. We cannot read it.</WhoReads>
      </template>
    </template>
  </div>
</template>
