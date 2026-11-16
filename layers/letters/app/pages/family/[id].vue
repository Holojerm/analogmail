<script setup lang="ts">
// One family: who is in it, writing to all of them, and for its organiser
// inviting and removing. Leaving ends one place in it, never the family.
definePageMeta({ middleware: 'auth' })

interface FamilyView {
  id: string
  name: string
  correspondenceId: string
  organiserId: string | null
  me: string
  members: { userId: string; name: string }[]
  invited: { id: string; email: string }[]
}

const route = useRoute()
const family = ref<FamilyView | null>(null)
const loading = ref(true)
const failure = ref<string | null>(null)
const busy = ref(false)
const email = ref('')
const link = ref<string | null>(null)

const message = (error: unknown) =>
  (error as { data?: { message?: string } }).data?.message ?? 'That did not work. Try again.'
const organising = computed(() => family.value?.organiserId === family.value?.me)

async function load() {
  try {
    family.value = await $fetch<FamilyView>('/api/letters/families/view', {
      method: 'POST',
      body: { id: String(route.params.id) },
    })
  } catch {
    family.value = null
    failure.value = 'You are not in that family.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function invite() {
  busy.value = true
  failure.value = null
  link.value = null
  try {
    const sent = await $fetch<{ link: string }>('/api/letters/invites', {
      method: 'POST',
      body: { email: email.value, familyId: family.value!.id },
    })
    link.value = sent.link
    email.value = ''
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

async function leave(memberId?: string) {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/families/leave', {
      method: 'POST',
      body: { familyId: family.value!.id, memberId },
    })
    if (!memberId) return await navigateTo('/people')
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

const newName = ref('')
const confirming = ref(false)

async function rename() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/families/rename', {
      method: 'POST',
      body: { familyId: family.value!.id, name: newName.value },
    })
    newName.value = ''
    await load()
  } catch (error) {
    failure.value = message(error)
  } finally {
    busy.value = false
  }
}

async function close() {
  busy.value = true
  failure.value = null
  try {
    await $fetch('/api/letters/families/close', {
      method: 'POST',
      body: { familyId: family.value!.id },
    })
    await navigateTo('/people')
  } catch (error) {
    failure.value = message(error)
    confirming.value = false
  } finally {
    busy.value = false
  }
}

useSeo({ title: 'A family', description: 'A family you write with.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-12">
    <LetterNav />
    <h1 class="text-3xl text-highlighted">{{ family ? family.name : 'A family' }}</h1>

    <p v-if="loading" class="text-muted" role="status">Opening…</p>
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="failure"
    />

    <template v-if="family">
      <div class="flex flex-col gap-3">
        <p class="text-muted">
          A letter here goes to everyone in the family but you. Each copy arrives by post in that
          person's own city, so they do not all get it on the same day.
        </p>
        <UButton
          v-if="family.members.length > 1"
          class="self-start"
          :to="{ path: '/write', query: { to: family.correspondenceId } }"
        >
          Write to {{ family.name }}
        </UButton>
        <p v-else class="text-sm text-muted">
          There is nobody to write to yet. Invite someone below.
        </p>
      </div>

      <section aria-labelledby="members-heading" class="flex flex-col gap-3">
        <h2 id="members-heading" class="text-xl text-highlighted">In this family</h2>
        <ul class="flex flex-col divide-y divide-default">
          <li
            v-for="member in family.members"
            :key="member.userId"
            class="flex items-center justify-between gap-4 py-3"
          >
            <div>
              <p class="text-highlighted">
                {{ member.name }}{{ member.userId === family.me ? ' (you)' : '' }}
              </p>
              <p v-if="member.userId === family.organiserId" class="text-sm text-muted">
                Organiser
              </p>
            </div>
            <UButton
              v-if="organising && member.userId !== family.me"
              size="sm"
              variant="ghost"
              color="neutral"
              :disabled="busy"
              :aria-label="`Remove ${member.name} from ${family.name}`"
              @click="leave(member.userId)"
            >
              Remove
            </UButton>
          </li>
          <li v-for="waiting in family.invited" :key="waiting.id" class="py-3 text-muted">
            {{ waiting.email }} · invited
          </li>
        </ul>
      </section>

      <section v-if="organising" aria-labelledby="invite-heading" class="flex flex-col gap-3">
        <h2 id="invite-heading" class="text-xl text-highlighted">Invite someone</h2>
        <form class="flex flex-col gap-3" @submit.prevent="invite">
          <UFormField
            label="Their email"
            name="email"
            help="They will read what is written from the day they join, not what came before."
          >
            <UInput v-model="email" type="email" size="lg" class="w-full" autocomplete="off" />
          </UFormField>
          <UButton type="submit" class="self-start" :loading="busy" :disabled="!email.trim()">
            Send invitation
          </UButton>
        </form>
        <p v-if="link" class="text-sm text-muted">
          Sent. You can also pass this link on yourself:
          <span class="break-all text-default" data-testid="family-invite-link">{{ link }}</span>
        </p>
      </section>

      <section v-if="organising" aria-labelledby="name-heading" class="flex flex-col gap-3">
        <h2 id="name-heading" class="text-xl text-highlighted">Its name</h2>
        <form class="flex flex-col gap-3" @submit.prevent="rename">
          <UFormField label="A new name" name="family-name">
            <UInput v-model="newName" maxlength="60" size="lg" class="w-full" autocomplete="off" />
          </UFormField>
          <UButton
            type="submit"
            variant="outline"
            color="neutral"
            class="self-start"
            :loading="busy"
            :disabled="!newName.trim()"
          >
            Rename
          </UButton>
        </form>
      </section>

      <section aria-labelledby="leave-heading" class="flex flex-col gap-3">
        <h2 id="leave-heading" class="text-xl text-highlighted">Leave</h2>
        <p class="text-sm text-muted">
          The family goes on without you. Letters still on their way to you go back to whoever sent
          them. What you have received stays yours, and what you posted still arrives.
        </p>
        <UButton
          class="self-start"
          variant="outline"
          color="neutral"
          :loading="busy"
          @click="leave()"
        >
          Leave {{ family.name }}
        </UButton>
      </section>

      <section v-if="organising" aria-labelledby="close-heading" class="flex flex-col gap-3">
        <h2 id="close-heading" class="text-xl text-highlighted">Close the family</h2>
        <p class="text-sm text-muted">
          Nobody can write in it afterwards. Letters still on their way go back to whoever sent
          them. Everyone keeps what they have already received.
        </p>
        <UButton class="self-start" variant="outline" color="error" @click="confirming = true">
          Close {{ family.name }}
        </UButton>
        <UModal
          v-model:open="confirming"
          :title="`Close ${family.name}?`"
          description="This ends the family for everyone in it and cannot be undone."
        >
          <template #footer>
            <UButton variant="ghost" color="neutral" @click="confirming = false">Keep it</UButton>
            <UButton color="error" :loading="busy" @click="close">Close for everyone</UButton>
          </template>
        </UModal>
      </section>
    </template>
  </div>
</template>
