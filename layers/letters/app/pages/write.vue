<script setup lang="ts">
// The writing desk. A letter is encrypted in this browser before every save;
// the server stores ciphertext. Sealing hands it to the post.
import {
  DEFAULT_STATIONERY,
  FONTS,
  INKS,
  LETTER_BODY_MAX,
  PAPERS,
  letterDocSchema,
  type LetterDoc,
  type Stationery,
} from '../../shared/utils/letter-doc'
import { decryptLetter, encryptLetter, newContentKey, wrapContentKey } from '../utils/letter-crypto'

definePageMeta({ middleware: ['auth', 'keys'] })

interface SealPlan {
  recipientId: string
  recipientName: string
  recipientPublicKey: string
  zone: string
  pickupAt: string
  arrives: string
}

const route = useRoute()
const router = useRouter()
const letterKeys = useLetterKeys()

const loading = ref(true)
const failure = ref<string | null>(null)
const letterId = ref('')
const correspondenceId = ref('')
const sealed = ref(false)
const body = ref('')
const from = ref('')
const stationery = reactive<Stationery>({ ...DEFAULT_STATIONERY })
const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
const plan = ref<SealPlan | null>(null)
const confirming = ref(false)
const sealing = ref(false)

let contentKey: Uint8Array<ArrayBuffer> | null = null
let wrappedForMe = ''
let created = false
let timer: ReturnType<typeof setTimeout> | undefined

const message = (error: unknown, fallback: string) =>
  (error as { data?: { message?: string } }).data?.message ?? fallback

const doc = (): LetterDoc => ({
  v: 1,
  body: body.value,
  stationery: { ...stationery },
  from: from.value,
})

async function loadPlan() {
  try {
    plan.value = await $fetch<SealPlan>('/api/letters/seal-plan', {
      method: 'POST',
      body: { correspondenceId: correspondenceId.value },
    })
  } catch (error) {
    plan.value = null
    failure.value = message(error, 'This letter cannot be sent right now.')
  }
}

onMounted(async () => {
  try {
    const existing = typeof route.query.letter === 'string' ? route.query.letter : null
    if (existing) {
      const opened = await $fetch<{
        id: string
        correspondenceId: string
        ciphertext: string
        wrappedKey: string
        sealed: boolean
      }>('/api/letters/drafts/open', { method: 'POST', body: { id: existing } })
      const key = await letterKeys.open(opened.wrappedKey, opened.id)
      const text = key ? await decryptLetter(key, opened.id, opened.ciphertext) : null
      const parsed = text ? letterDocSchema.safeParse(JSON.parse(text)) : null
      if (!key || !parsed?.success) throw new Error('unreadable')
      contentKey = key
      wrappedForMe = opened.wrappedKey
      created = true
      letterId.value = opened.id
      correspondenceId.value = opened.correspondenceId
      sealed.value = opened.sealed
      body.value = parsed.data.body
      from.value = parsed.data.from
      Object.assign(stationery, parsed.data.stationery)
    } else {
      const to = typeof route.query.to === 'string' ? route.query.to : null
      if (!to) return await navigateTo('/people')
      correspondenceId.value = to
      letterId.value = crypto.randomUUID()
      contentKey = newContentKey()
      wrappedForMe = await letterKeys.wrapForMe(contentKey, letterId.value)
      from.value = (await $fetch<{ name: string | null }>('/api/letters/name')).name ?? ''
    }
    await loadPlan()
  } catch {
    failure.value = 'This letter could not be opened on this device.'
  } finally {
    await nextTick()
    loading.value = false
  }
})

async function save(): Promise<boolean> {
  if (sealed.value || !contentKey) return false
  clearTimeout(timer)
  saveState.value = 'saving'
  try {
    await $fetch('/api/letters/drafts', {
      method: 'PUT',
      body: {
        id: letterId.value,
        correspondenceId: correspondenceId.value,
        ciphertext: await encryptLetter(contentKey, letterId.value, JSON.stringify(doc())),
        wrappedKey: wrappedForMe,
      },
    })
    if (!created) {
      created = true
      await router.replace({ query: { letter: letterId.value } })
    }
    saveState.value = 'saved'
    return true
  } catch {
    saveState.value = 'failed'
    return false
  }
}

watch([body, from, () => ({ ...stationery })], () => {
  if (loading.value || sealed.value) return
  saveState.value = 'idle'
  confirming.value = false
  clearTimeout(timer)
  timer = setTimeout(save, 1500)
})
onBeforeUnmount(() => clearTimeout(timer))

async function prepareSeal() {
  failure.value = null
  if (!(await save())) return
  await loadPlan()
  confirming.value = Boolean(plan.value)
}

async function seal() {
  if (!plan.value || !contentKey) return
  sealing.value = true
  try {
    await $fetch('/api/letters/seal', {
      method: 'POST',
      body: {
        id: letterId.value,
        recipientWrappedKey: await wrapContentKey(plan.value.recipientPublicKey, contentKey, {
          letterId: letterId.value,
          readerId: plan.value.recipientId,
        }),
      },
    })
    await navigateTo('/desk')
  } catch (error) {
    failure.value = message(error, 'Could not seal the letter. Try again.')
    confirming.value = false
  } finally {
    sealing.value = false
  }
}

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))

useSeo({ title: 'Write a letter', description: 'Write and seal a letter.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-12">
    <div class="flex items-baseline justify-between gap-4">
      <h1 class="text-3xl text-highlighted">
        {{ plan ? `A letter to ${plan.recipientName}` : 'A letter' }}
      </h1>
      <UButton to="/desk" variant="link" color="neutral" class="p-0">Your desk</UButton>
    </div>

    <p v-if="loading" class="text-muted" role="status">Opening…</p>
    <template v-else>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="failure"
      />

      <template v-if="sealed">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-mail"
          title="This letter is sealed"
          description="It can be read here but not changed. Until it is collected you can recall it from your desk."
        />
        <LetterPaper :doc="doc()" />
      </template>

      <template v-else-if="letterId">
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Paper" name="paper">
            <USelect
              v-model="stationery.paper"
              :items="options(PAPERS, PAPER_LABEL)"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Hand" name="font">
            <USelect v-model="stationery.font" :items="options(FONTS, FONT_LABEL)" class="w-full" />
          </UFormField>
          <UFormField label="Ink" name="ink">
            <USelect v-model="stationery.ink" :items="options(INKS, INK_LABEL)" class="w-full" />
          </UFormField>
        </div>

        <div
          class="flex flex-col gap-6 rounded-md border border-default px-6 py-8 sm:px-10 sm:py-12"
          :class="stationeryClass(stationery)"
        >
          <UFormField label="Your letter" name="body" :ui="{ label: 'sr-only' }">
            <UTextarea
              v-model="body"
              variant="none"
              autoresize
              :rows="14"
              :maxlength="LETTER_BODY_MAX"
              class="w-full"
              :ui="{ base: 'p-0 text-inherit' }"
              placeholder="Dear…"
            />
          </UFormField>
          <UFormField label="Signed" name="from" class="self-end">
            <UInput v-model="from" variant="none" maxlength="60" :ui="{ base: 'p-0 text-right' }" />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-muted" role="status" aria-live="polite">
            <template v-if="saveState === 'saving'">Saving…</template>
            <template v-else-if="saveState === 'saved'">Saved, encrypted on this device.</template>
            <template v-else-if="saveState === 'failed'"
              >Not saved. Check your connection.</template
            >
          </p>
          <UButton :disabled="!body.trim() || !plan" @click="prepareSeal">Seal the letter</UButton>
        </div>

        <UCard v-if="confirming && plan">
          <div class="flex flex-col gap-4">
            <p class="text-highlighted">
              It will be collected {{ pickupTime(plan.pickupAt, plan.zone) }} and arrives
              {{ longDay(plan.arrives) }}.
            </p>
            <p class="text-sm text-muted">
              Until it is collected you can recall it and change it. After that it is on its way and
              cannot be changed. You will not be told when it is delivered or read.
            </p>
            <div class="flex gap-3">
              <UButton :loading="sealing" @click="seal">Seal and post</UButton>
              <UButton variant="ghost" color="neutral" @click="confirming = false">
                Keep writing
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </template>
  </div>
</template>
