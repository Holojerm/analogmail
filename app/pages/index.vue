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
    icon: 'i-lucide-eye-off',
    title: 'No read receipts',
    description:
      'You are told the day a letter is due to arrive, and nothing after that. Nobody knows when you opened theirs.',
  },
  {
    icon: 'i-lucide-bell',
    title: 'One quiet notice',
    description:
      'On a day something arrives you get one email. It does not say who it is from or how many there are.',
  },
  {
    icon: 'i-lucide-lock',
    title: 'Letters we cannot read',
    description:
      'Each letter is encrypted in your browser. We store who writes to whom and when, never what.',
  },
  {
    icon: 'i-lucide-archive',
    title: 'Yours to keep',
    description: 'A letter belongs to the person who received it, even after its writer has left.',
  },
]

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
  <div class="flex flex-col gap-24 py-16">
    <section class="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      <h1 class="text-4xl text-highlighted sm:text-5xl">Letters for family and friends, slowly</h1>
      <p class="max-w-2xl text-lg text-muted">
        {{ config.public.appName }} is for writing to the people you already know, at the pace of
        the post. A letter takes days to arrive, so nobody has to answer quickly.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-4">
        <UButton :to="loggedIn ? '/dashboard' : '/auth/sign-up'" size="lg">
          {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
        </UButton>
        <UButton v-if="!loggedIn" to="/auth/sign-in" size="lg" variant="outline" color="neutral">
          Sign in
        </UButton>
      </div>
    </section>

    <section class="flex flex-col gap-10">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl text-highlighted">How a letter travels</h2>
        <p class="mt-3 text-muted">The wait is the point. It is what makes a slow reply polite.</p>
      </div>
      <ol class="grid gap-6 md:grid-cols-3">
        <li v-for="(step, index) in steps" :key="step.title">
          <UCard class="h-full">
            <div class="flex flex-col gap-3">
              <span class="font-display text-3xl text-primary" aria-hidden="true">
                {{ index + 1 }}
              </span>
              <h3 class="text-lg text-highlighted">{{ step.title }}</h3>
              <p class="text-sm text-muted">{{ step.description }}</p>
            </div>
          </UCard>
        </li>
      </ol>
    </section>

    <section class="flex flex-col gap-10">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-3xl text-highlighted">What it leaves out</h2>
        <p class="mt-3 text-muted">No streaks, no nudges to write, nothing to keep up with.</p>
      </div>
      <div class="grid gap-6 md:grid-cols-2">
        <UCard v-for="promise in promises" :key="promise.title">
          <div class="flex flex-col gap-3">
            <UIcon :name="promise.icon" class="size-6 text-primary" />
            <h3 class="text-lg text-highlighted">{{ promise.title }}</h3>
            <p class="text-sm text-muted">{{ promise.description }}</p>
          </div>
        </UCard>
      </div>
    </section>

    <section class="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
      <h2 class="text-3xl text-highlighted">Write to someone</h2>
      <p class="text-muted">
        Writing to friends is free. The code is public, so what we say about privacy can be checked.
      </p>
      <UButton :to="loggedIn ? '/dashboard' : '/auth/sign-up'" size="lg">
        {{ loggedIn ? 'Open your mantel' : 'Start writing' }}
      </UButton>
    </section>
  </div>
</template>
