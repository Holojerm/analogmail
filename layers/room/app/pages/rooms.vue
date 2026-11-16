<script setup lang="ts">
// The family rooms a person can open, closed families included: a closed
// family's photos stay where its members can still see and remove them.
import type { RoomFamily } from '../../shared/utils/room-types'

definePageMeta({ middleware: 'auth' })

const { data } = await useFetch<{ rooms: RoomFamily[] }>('/api/room')
const rooms = computed(() => data.value?.rooms ?? [])
// Someone in one family has one room, and "Room" in the navigation opens it.
const only = rooms.value.length === 1 ? rooms.value[0] : undefined
if (only) await navigateTo(`/room/${only.id}`, { replace: true })

useSeo({ title: 'Family rooms', description: 'The family rooms you are in.', noindex: true })
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-8 py-8 sm:py-12">
    <h1 class="text-3xl text-highlighted">Family rooms</h1>
    <RoomNotice />
    <p v-if="rooms.length === 0" class="text-muted">
      You are not in a family yet. Start one, or accept an invitation, from
      <ULink to="/people" class="underline">People</ULink>.
    </p>
    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="room in rooms" :key="room.id" class="flex items-center justify-between gap-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-highlighted">{{ room.name }}</p>
          <p v-if="room.closed" class="text-sm text-muted">Closed. Nothing new can be added.</p>
        </div>
        <UButton
          variant="outline"
          color="neutral"
          :to="`/room/${room.id}`"
          :aria-label="`Open the room of ${room.name}`"
        >
          Open
        </UButton>
      </li>
    </ul>
  </div>
</template>
