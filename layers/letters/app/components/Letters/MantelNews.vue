<script setup lang="ts">
// News of a child, on the page of the child's mantel: its keepers write it
// from here, ask people to read it, and see who does. Only keepers are ever
// shown this list.
const props = defineProps<{ mantelId: string; name: string }>()

interface News {
  correspondenceId: string
  readers: { userId: string; name: string; since: string }[]
  invites: { id: string; email: string; expiresAt: string; mine: boolean }[]
}

const news = ref<News | null>(null)
const email = ref('')
const link = ref<string | null>(null)
const failure = ref<string | null>(null)
const busy = ref(false)

const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'

async function load() {
  try {
    news.value = await $fetch<News>('/api/letters/news/readers', {
      method: 'POST',
      body: { mantelId: props.mantelId },
    })
  } catch (error) {
    failure.value = message(error)
  }
}
onMounted(load)

async function act(run: () => Promise<unknown>) {
  failure.value = null
  busy.value = true
  try {
    await run()
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

const invite = () =>
  act(async () => {
    const made = await $fetch<{ link: string }>('/api/letters/invites', {
      method: 'POST',
      body: { email: email.value, mantelId: props.mantelId, news: true },
    })
    link.value = made.link
    email.value = ''
  })
const withdraw = (id: string) =>
  act(async () => {
    await $fetch('/api/letters/invites/withdraw', { method: 'POST', body: { id } })
  })
const remove = (readerId: string) =>
  act(async () => {
    await $fetch('/api/letters/news/remove', {
      method: 'POST',
      body: { mantelId: props.mantelId, readerId },
    })
  })
</script>

<template>
  <section aria-labelledby="news-heading" class="flex flex-col gap-4">
    <div>
      <h2 id="news-heading" class="text-xl text-highlighted">News of {{ name }}</h2>
      <p class="mt-2 text-muted">
        A letter of news goes to the people you have asked to read it: a photo, a first word, a
        birthday. It travels like any letter and is encrypted to each of them. They read it and
        cannot write back. Letter by letter, you choose whether {{ name }}'s mantel gets a copy.
      </p>
    </div>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="news">
      <UButton
        :to="{ path: '/write', query: { to: news.correspondenceId } }"
        variant="outline"
        color="neutral"
        class="self-start"
      >
        Write news of {{ name }}
      </UButton>

      <div class="flex flex-col gap-2">
        <h3 class="text-lg text-highlighted">Who gets it</h3>
        <p v-if="news.readers.length === 0" class="text-muted">
          Nobody yet, apart from the people who keep this mantel.
        </p>
        <ul v-else class="flex flex-col divide-y divide-default">
          <li
            v-for="reader in news.readers"
            :key="reader.userId"
            class="flex items-center justify-between gap-4 py-3"
          >
            <span class="text-highlighted">{{ reader.name }}</span>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Stop sending news to ${reader.name}`"
              @click="remove(reader.userId)"
            >
              Stop
            </UButton>
          </li>
        </ul>
        <ul v-if="news.invites.length" class="flex flex-col divide-y divide-default">
          <li
            v-for="waiting in news.invites"
            :key="waiting.id"
            class="flex items-center justify-between gap-4 py-3"
          >
            <span class="min-w-0 truncate text-muted">{{ waiting.email }} · asked</span>
            <UButton
              v-if="waiting.mine"
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Withdraw the invitation to ${waiting.email}`"
              @click="withdraw(waiting.id)"
            >
              Withdraw
            </UButton>
          </li>
        </ul>
        <WhoReads encrypted>
          Only {{ name }}'s keepers see this list. Nobody who gets the news is told who else does.
        </WhoReads>
      </div>

      <form class="flex flex-col gap-3" @submit.prevent="invite">
        <UFormField
          label="Ask someone to read it"
          name="news-email"
          help="We send one email with your name, the child's name and a link. They need an account to read, because each letter is encrypted to them."
        >
          <UInput v-model="email" type="email" size="lg" class="w-full" autocomplete="off" />
        </UFormField>
        <UButton
          type="submit"
          variant="outline"
          color="neutral"
          class="self-start"
          :loading="busy"
          :disabled="!email.trim()"
        >
          Send the invitation
        </UButton>
      </form>
      <p v-if="link" class="text-sm text-muted">
        Sent. You can also pass this link on yourself:
        <span class="break-all text-default" data-testid="news-invite-link">{{ link }}</span>
      </p>
    </template>
  </section>
</template>
