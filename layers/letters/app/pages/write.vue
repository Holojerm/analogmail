<script setup lang="ts">
// The writing desk. A letter is encrypted in this browser before every save;
// the server stores ciphertext. Sealing hands it to the post. With `?as=<id>`
// a keeper writes as a child's mantel, to someone who writes to it.
import type { Openings } from '../../shared/utils/openings'
import {
  DEFAULT_STATIONERY,
  FONTS,
  INKS,
  LETTER_BODY_MAX,
  PAPERS,
  parseLetterDoc,
  type LetterDoc,
  type Stationery,
} from '../../shared/utils/letter-doc'
import type { LetterPhoto } from '../../shared/utils/letter-photo'
import {
  emptyRichDoc,
  isBlankRichDoc,
  richTextLength,
  type RichDoc,
} from '../../shared/utils/rich-text'
import { decryptLetter, encryptLetter, newContentKey, wrapContentKey } from '../utils/letter-crypto'

import type { LetterAuthor } from '../composables/useLetterAuthor'

definePageMeta({ middleware: ['auth', 'keys'] })

interface SealPlan {
  /** The person, the kept mantel, or the family the letter is to. */
  recipientName: string
  /** Everyone who will read it: one, or each other member of a family. */
  readers: { id: string; name: string; publicKey: string; arrives: string }[]
  toFamily: boolean
  /** A kept mantel: its keepers say how the letter may open. */
  toMantel: boolean
  /** For a kept mantel: on arrival, the days its keepers set, or both. */
  openings: Openings | null
  /** The child's name when this is news of them. */
  news: string | null
  zone: string
  pickupAt: string
  arrives: string
}

const route = useRoute()
const router = useRouter()
const authorFor = useLetterAuthor()
// A child's mantel this keeper writes as, or null for their own letter.
const asMantel = typeof route.query.as === 'string' ? route.query.as : null
const mantelName = ref<string | null>(null)

const loading = ref(true)
const failure = ref<string | null>(null)
const letterId = ref('')
const correspondenceId = ref('')
const sealed = ref(false)
const content = ref<RichDoc>(emptyRichDoc())
const from = ref('')
const stationery = reactive<Stationery>({ ...DEFAULT_STATIONERY })
const saveState = ref<'idle' | 'saving' | 'saved' | 'failed'>('idle')
const plan = ref<SealPlan | null>(null)
const confirming = ref(false)
const sealing = ref(false)
const opensOn = ref('')
// News of a child: whether the child's own mantel gets a copy of this letter.
const withChild = ref(true)
const inReplyTo = ref<string | null>(null)
const answered = ref<{ doc: LetterDoc; photoUrl: string | null } | null>(null)
const photo = ref<LetterPhoto | undefined>()
const photoUrl = ref<string | null>(null)

let contentKey: Uint8Array<ArrayBuffer> | null = null
let author: LetterAuthor | null = null
let wrappedForMe = ''
let created = false
let timer: ReturnType<typeof setTimeout> | undefined
let snapshot = ''

const message = (error: unknown, fallback: string) =>
  (error as { data?: { message?: string } }).data?.message ?? fallback

const doc = (): LetterDoc => ({
  v: 2,
  content: content.value,
  stationery: { ...stationery },
  from: from.value,
  ...(photo.value ? { photo: photo.value } : {}),
})

async function loadPlan() {
  try {
    plan.value = await $fetch<SealPlan>('/api/letters/seal-plan', {
      method: 'POST',
      body: {
        correspondenceId: correspondenceId.value,
        withChild: withChild.value,
        mantelId: asMantel ?? undefined,
      },
    })
    // Keep the writer's choice if the keepers still allow it, else the first that is.
    if (plan.value.openings && !choices.value.some((choice) => choice.value === opensOn.value)) {
      opensOn.value = choices.value[0]?.value ?? ''
    }
  } catch (error) {
    plan.value = null
    failure.value = message(error, 'This letter cannot be sent right now.')
  }
}

onMounted(async () => {
  try {
    author = await authorFor(asMantel)
    mantelName.value = author.mantelName
    const existing = typeof route.query.letter === 'string' ? route.query.letter : null
    if (existing) {
      const opened = await $fetch<{
        id: string
        correspondenceId: string
        ciphertext: string
        wrappedKey: string
        sealed: boolean
        inReplyTo: string | null
      }>('/api/letters/drafts/open', {
        method: 'POST',
        body: { id: existing, mantelId: asMantel ?? undefined },
      })
      const key = await author.open(opened.wrappedKey, opened.id)
      const text = key ? await decryptLetter(key, opened.id, opened.ciphertext) : null
      const parsed = text ? parseLetterDoc(text) : null
      if (!key || !parsed) throw new Error('unreadable')
      contentKey = key
      wrappedForMe = opened.wrappedKey
      created = true
      letterId.value = opened.id
      correspondenceId.value = opened.correspondenceId
      sealed.value = opened.sealed
      inReplyTo.value = opened.inReplyTo
      content.value = parsed.content
      from.value = parsed.from
      Object.assign(stationery, parsed.stationery)
      photo.value = parsed.photo
      if (photo.value) {
        photoUrl.value = await loadLetterPhoto(key, opened.id, photo.value, asMantel ?? undefined)
      }
    } else {
      const to = typeof route.query.to === 'string' ? route.query.to : null
      if (!to) return await navigateTo('/people')
      correspondenceId.value = to
      inReplyTo.value = typeof route.query.reply === 'string' ? route.query.reply : null
      letterId.value = crypto.randomUUID()
      contentKey = newContentKey()
      wrappedForMe = await author.wrap(contentKey, letterId.value)
      from.value =
        author.mantelName ?? (await $fetch<{ name: string | null }>('/api/letters/name')).name ?? ''
    }
    // The letter being answered lies above the sheet. It may no longer be
    // readable here; the reply does not depend on it.
    if (inReplyTo.value) {
      answered.value = await author.readReceived(inReplyTo.value).catch(() => null)
    }
    await loadPlan()
  } catch {
    failure.value = 'This letter could not be opened on this device.'
  } finally {
    snapshot = JSON.stringify(doc())
    await nextTick()
    loading.value = false
  }
})

async function save(): Promise<boolean> {
  if (sealed.value || !contentKey || tooLong.value) return false
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
        inReplyTo: inReplyTo.value,
        mantelId: asMantel ?? undefined,
        authorKey: author?.authorKey,
      },
    })
    if (!created) {
      created = true
      await router.replace({ query: { letter: letterId.value } })
    }
    snapshot = JSON.stringify(doc())
    saveState.value = 'saved'
    return true
  } catch {
    saveState.value = 'failed'
    return false
  }
}

watch([content, from, () => ({ ...stationery }), photo], () => {
  if (loading.value || sealed.value) return
  // The editor reports its document again when it mounts. Only a real change
  // is worth a save, and an untouched new sheet must not become a draft.
  if (JSON.stringify(doc()) === snapshot) return
  saveState.value = 'idle'
  confirming.value = false
  clearTimeout(timer)
  timer = setTimeout(save, 1500)
})
onBeforeUnmount(() => clearTimeout(timer))

const blank = computed(() => isBlankRichDoc(content.value))
const tooLong = computed(() => richTextLength(content.value) > LETTER_BODY_MAX)

// A photo is stored against the draft's row, so the draft is saved first.
const ensureDraft = async () => created || (await save())
const currentKey = () => contentKey

async function prepareSeal() {
  failure.value = null
  if (!(await save())) return
  await loadPlan()
  confirming.value = Boolean(plan.value)
}

const sendOff = useSendOff()

async function seal() {
  const key = contentKey
  if (!plan.value || !key) return
  sealing.value = true
  try {
    await $fetch('/api/letters/seal', {
      method: 'POST',
      body: {
        id: letterId.value,
        wrappedKeys: Object.fromEntries(
          await Promise.all(
            plan.value.readers.map(async (reader) => [
              reader.id,
              await wrapContentKey(reader.publicKey, key, {
                letterId: letterId.value,
                readerId: reader.id,
              }),
            ]),
          ),
        ),
        readerKeys: Object.fromEntries(
          plan.value.readers.map((reader) => [reader.id, reader.publicKey]),
        ),
        opensOn: plan.value.toMantel && opensOn.value ? opensOn.value : null,
        withChild: withChild.value,
        mantelId: asMantel ?? undefined,
      },
    })
    await sendOff.play()
    await navigateTo(asMantel ? `/mantels/${asMantel}` : '/desk')
  } catch (error) {
    failure.value = message(error, 'Could not seal the letter. Try again.')
    confirming.value = false
  } finally {
    sealing.value = false
  }
}

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }))

// How a letter to a kept mantel may open, as its keepers allow. '' is on arrival.
const choices = computed(() => {
  const openings = plan.value?.openings
  if (!openings) return []
  return [
    ...(openings.onArrival ? [{ value: '', label: 'When it arrives' }] : []),
    ...openings.days.map((day) => ({
      value: day.on,
      label: day.label ? `${day.label}, ${yearDay(day.on)}` : yearDay(day.on),
    })),
  ]
})

const heading = computed(() => {
  if (plan.value?.news) return `News of ${plan.value.news}`
  if (!plan.value) return 'A letter'
  return mantelName.value
    ? `A letter from ${mantelName.value} to ${plan.value.recipientName}`
    : `A letter to ${plan.value.recipientName}`
})

useSeo({
  title: 'Write a letter',
  description: 'Write and seal a letter.',
  noindex: true,
})
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6 py-8 sm:py-12">
    <LetterSendOff v-if="sendOff.playing.value" />
    <h1 class="text-3xl text-highlighted">{{ heading }}</h1>
    <p v-if="mantelName" class="text-sm text-muted">
      You are writing as {{ mantelName }}. It comes from {{ mantelName }}'s mantel, and every keeper
      of it can read it and change it until it is collected.
    </p>

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
        <p class="font-serif text-lg text-toned">
          This letter is sealed. It can be read here but not changed. Until it is collected you can
          recall it from {{ mantelName ? `${mantelName}'s mantel` : 'your desk' }}.
        </p>
        <LetterPaper :doc="doc()" :photo-url="photoUrl" />
      </template>

      <template v-else-if="letterId">
        <WelcomeNote />
        <!-- How long the post takes, said before anything is written: the one
             thing about this place a first letter's writer cannot guess. -->
        <p v-if="plan && !plan.toFamily" class="text-sm text-muted" data-testid="arrival-line">
          Sealed today, it arrives {{ longDay(plan.arrives) }}.
        </p>
        <section v-if="answered" aria-labelledby="answered-heading" class="flex flex-col gap-3">
          <h2 id="answered-heading" class="text-sm text-muted">You are replying to</h2>
          <LetterPaper :doc="answered.doc" :photo-url="answered.photoUrl" />
        </section>
        <div class="grid grid-cols-3 gap-3">
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
          class="ph-no-capture flex flex-col gap-6 rounded-md border border-default px-6 py-8 sm:px-10 sm:py-12"
          :class="stationeryClass(stationery)"
        >
          <LetterEditor v-model="content" />
          <UFormField
            label="Signed"
            name="from"
            class="self-end text-right"
            :ui="{ labelWrapper: 'justify-end' }"
          >
            <UInput
              v-model="from"
              variant="none"
              maxlength="60"
              :ui="{ base: 'letter-signature p-0 text-right' }"
            />
          </UFormField>
        </div>

        <LetterPhotoField
          v-model:photo="photo"
          v-model:url="photoUrl"
          :letter-id="letterId"
          :content-key="currentKey"
          :ensure-draft="ensureDraft"
          :mantel-id="asMantel ?? undefined"
        />

        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm text-muted" role="status" aria-live="polite">
            <template v-if="tooLong"
              >This letter is too long to send. Shorten it a little.</template
            >
            <template v-else-if="saveState === 'saving'">Saving…</template>
            <template v-else-if="saveState === 'saved'">Saved, encrypted on this device.</template>
            <template v-else-if="saveState === 'failed'"
              >Not saved. Check your connection.</template
            >
          </p>
          <UButton :disabled="blank || tooLong || !plan" @click="prepareSeal">
            Seal the letter
          </UButton>
        </div>

        <UCard v-if="confirming && plan">
          <div class="flex flex-col gap-4">
            <!-- News of a child: who it goes to is the writer's to see, and the
                 child's own copy is theirs to choose. -->
            <UCheckbox
              v-if="plan.news"
              v-model="withChild"
              :label="`Put a copy on ${plan.news}'s mantel too`"
              description="For them to find when the mantel is theirs."
              @update:model-value="loadPlan"
            />
            <template v-if="plan.toFamily || plan.news">
              <p class="text-highlighted">
                It will be collected {{ pickupTime(plan.pickupAt, plan.zone) }}. Each of them gets
                their own copy, on their own post:
              </p>
              <ul class="text-sm">
                <li v-for="reader in plan.readers" :key="reader.id">
                  <span class="text-highlighted">{{ reader.name }}</span>
                  <span class="text-muted"> · arrives {{ longDay(reader.arrives) }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="text-highlighted">
              It will be collected
              {{ pickupTime(plan.pickupAt, plan.zone) }} and arrives {{ longDay(plan.arrives) }}.
            </p>
            <!-- The keepers decide how letters to their mantel open; the
                 writer chooses only among what they allow. -->
            <UFormField
              v-if="choices.length > 1"
              label="When can it be opened?"
              name="opens-on"
              help="Its keepers chose these. A sealed letter still arrives as usual, but nobody can open it before its day, its keepers included. You keep your own copy."
            >
              <URadioGroup v-model="opensOn" :items="choices" />
            </UFormField>
            <p v-else-if="choices[0]?.value" class="text-sm text-toned">
              Its keepers chose that letters to it stay sealed until {{ choices[0].label }}. It
              still arrives as usual, but nobody can open it before then, its keepers included.
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
