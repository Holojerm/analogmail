<script setup lang="ts">
// The landing page: what Dear Mantel is, how a letter travels, and what the
// product leaves out on purpose.
//
// Public and indexable — the `publicPage` meta below is what puts it in
// sitemap.xml, and it carries the SoftwareApplication node that tells an answer
// engine what this product is.

definePageMeta({
  publicPage: {
    changefreq: 'weekly',
    priority: '1.0',
    title: 'Overview',
    summary:
      'Letters for family and friends that arrive on a postal rhythm: how a letter travels, what is encrypted, and what the product leaves out.',
  },
})

const config = useRuntimeConfig()
const { loggedIn } = useUserSession()
const site = useSiteContext()

const steps = [
  {
    title: 'Invite someone you know',
    description:
      'By email. Once they accept, the two of you can write to each other. There is no feed, and nobody to discover.',
  },
  {
    title: 'Write, then seal',
    description:
      'The post collects at five in the afternoon where you live. Until then you can take a letter back and change it.',
  },
  {
    title: 'It arrives days later',
    description:
      'Two days across town, nine across the world, never on a Sunday. It comes in the morning, on the days they chose, and waits on their mantel.',
  },
]

const promises = [
  {
    title: 'No read receipts',
    description:
      'You are told the day a letter is due to arrive, and nothing after that. Nobody knows when you opened theirs.',
  },
  {
    title: 'One quiet notice',
    description:
      'On a day something arrives you get one email. It does not say who it is from or how many there are.',
  },
  {
    title: 'Letters we cannot read',
    description:
      'Each letter is encrypted in your browser. We store who writes to whom and when, never what.',
  },
  {
    title: 'Yours to keep',
    description: 'A letter belongs to the person who received it, even after its writer has left.',
  },
]

const house = [
  {
    title: 'Your mantel',
    description:
      'Where letters arrive. Unopened ones stand on the shelf until you take them down, and nothing tells the writer when you did.',
  },
  {
    title: "A child's mantel",
    description:
      'Letters written now and sealed for years. The people you choose keep its key until the day it opens.',
  },
  {
    title: 'The family room',
    description:
      'A place for the family’s photos and where everyone is, with a gazette on the first of each month. It is shared and not encrypted, and it says so.',
  },
]

// The letter shown on this page is a real one, drawn by the same component
// that draws every letter (DESIGN.md › Imagery).
const specimen = {
  v: 2 as const,
  stationery: { paper: 'plain' as const, font: 'serif' as const, ink: 'black' as const },
  from: 'Ann',
  content: {
    type: 'doc' as const,
    content: [
      'Dear Bob,',
      'The plums are ripe and the wasps have found them. Come in August, and bring the dog.',
      'Mother asks after you every Sunday and I have run out of things to tell her, so write and give me some.',
      'We painted the back room at last. It is a colour the tin calls linen and I call beige.',
    ].map((text) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] })),
  },
}

// One source for the product's one-sentence claim — also used by /llms.txt and
// the SoftwareApplication node, so all three agree.
const description = config.public.appDescription

useSeo({
  // 'exact' because the brand should lead on the landing page — everywhere else
  // useSeo appends `· AppName` for you.
  titleMode: 'exact',
  title: `${config.public.appName} — letters for family and friends, slowly`,
  description,
  schema: [softwareApplicationSchema(site, { description, offers: [] })],
})
</script>

<template>
  <div class="flex flex-col gap-24 py-12 sm:py-16">
    <section class="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
      <h1 class="text-4xl text-highlighted sm:text-5xl">
        Letters for family and friends, <em>slowly</em>
      </h1>
      <p class="font-serif text-lg text-toned">
        {{ config.public.appName }} is for writing to the people you already know, at the pace of
        the post. A letter takes days to arrive, so nobody has to answer quickly.
      </p>
      <UButton :to="loggedIn ? '/mantel' : '/auth/sign-up'" size="lg">
        {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
      </UButton>
    </section>

    <section aria-label="A letter" class="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <p class="font-mono text-xs tracking-wide text-muted uppercase">
        Postmarked Monday · arrived Thursday
      </p>
      <LetterPaper :doc="specimen" />
    </section>

    <section class="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <h2 class="text-3xl text-highlighted">How a letter travels</h2>
        <p class="mt-3 font-serif text-lg text-toned">
          The wait is the point. It is what makes a slow reply polite.
        </p>
      </div>
      <ol class="flex flex-col divide-y divide-default border-y border-default">
        <li v-for="(step, index) in steps" :key="step.title" class="flex gap-6 py-6">
          <span class="w-6 shrink-0 font-display text-3xl text-primary" aria-hidden="true">
            {{ index + 1 }}
          </span>
          <div class="flex flex-col gap-2">
            <h3 class="text-xl text-highlighted">{{ step.title }}</h3>
            <p class="text-default">{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <h2 class="text-3xl text-highlighted">What it leaves out</h2>
        <p class="mt-3 font-serif text-lg text-toned">
          No streaks, no nudges to write, nothing to keep up with.
        </p>
      </div>
      <dl class="grid gap-x-12 gap-y-8 sm:grid-cols-2">
        <div v-for="promise in promises" :key="promise.title" class="flex flex-col gap-2">
          <dt class="font-display text-xl text-highlighted">{{ promise.title }}</dt>
          <dd class="text-default">{{ promise.description }}</dd>
        </div>
      </dl>
    </section>

    <section class="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <h2 class="text-3xl text-highlighted">A house, not a feed</h2>
        <p class="mt-3 font-serif text-lg text-toned">
          Everything has a place, and each place says who can read what is in it.
        </p>
      </div>
      <dl class="flex flex-col divide-y divide-default border-y border-default">
        <div
          v-for="place in house"
          :key="place.title"
          class="grid gap-2 py-6 sm:grid-cols-3 sm:gap-6"
        >
          <dt class="font-display text-xl text-highlighted">{{ place.title }}</dt>
          <dd class="text-default sm:col-span-2">{{ place.description }}</dd>
        </div>
      </dl>
    </section>

    <section class="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
      <h2 class="text-3xl text-highlighted">Write to someone</h2>
      <p class="font-serif text-lg text-toned">
        Writing to friends is free. The code is public, so what we say about privacy can be checked.
      </p>
      <UButton :to="loggedIn ? '/mantel' : '/auth/sign-up'" size="lg">
        {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
      </UButton>
    </section>
  </div>
</template>
