<script setup lang="ts">
// /dev/post: who takes delivery when, and the notices the release has
// queued. Added as a route by layers/post/nuxt.config.ts in development only.
import { useDevPostOffice } from './office'

const { office, busy, refresh, seed } = useDevPostOffice()

onMounted(refresh)
useSeoMeta({ title: 'Post office', robots: 'noindex' })
</script>

<template>
  <UContainer class="space-y-10 py-10">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Post office</h1>
        <p class="text-sm text-muted">
          Local development only. Move time with the bar at the bottom of the page.
        </p>
      </div>
      <UButton color="neutral" variant="soft" :disabled="busy" @click="seed">
        Reset the three seed people
      </UButton>
    </header>

    <!-- The bar may load the data before this page hydrates. -->
    <ClientOnly>
      <section aria-labelledby="people-heading" class="space-y-3">
        <h2 id="people-heading" class="text-lg font-medium">People</h2>
        <p v-if="!office?.people.length" class="text-sm text-muted">
          Nobody has a postal profile yet. Seed the three people to start.
        </p>
        <table v-else class="w-full text-left text-sm">
          <thead class="text-muted">
            <tr>
              <th class="py-2 font-normal">Person</th>
              <th class="py-2 font-normal">Their time</th>
              <th class="py-2 font-normal">Next delivery</th>
              <th class="py-2 font-normal">Last release</th>
              <th class="py-2 font-normal">In transit</th>
              <th class="py-2 font-normal">Delivered</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in office.people"
              :key="person.userId"
              class="border-t border-default"
            >
              <td class="py-2">{{ person.name }}, {{ person.city }}</td>
              <td class="py-2">{{ person.localTime }}</td>
              <td class="py-2">{{ person.nextDelivery ?? 'Not scheduled' }}</td>
              <td class="py-2">{{ person.lastReleaseDate ?? 'Never' }}</td>
              <td class="py-2">{{ person.inTransit }}</td>
              <td class="py-2">{{ person.delivered }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="outbox-heading" class="space-y-3">
        <h2 id="outbox-heading" class="text-lg font-medium">Notice outbox</h2>
        <p v-if="!office?.outbox.length" class="text-sm text-muted">
          No notices yet. One is queued per person on a day their mail arrives.
        </p>
        <table v-else class="w-full text-left text-sm">
          <thead class="text-muted">
            <tr>
              <th class="py-2 font-normal">To</th>
              <th class="py-2 font-normal">Mail day</th>
              <th class="py-2 font-normal">Channel</th>
              <th class="py-2 font-normal">State</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="notice in office.outbox" :key="notice.id" class="border-t border-default">
              <td class="py-2">{{ notice.to ?? 'Unknown' }}</td>
              <td class="py-2">{{ notice.mailDate }}</td>
              <td class="py-2">{{ notice.channel }}</td>
              <td class="py-2">{{ notice.state }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </ClientOnly>
  </UContainer>
</template>
