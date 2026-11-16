// Uploads to a family room, one file at a time: a family batch is tens of
// photos, and a phone on a weak connection times out if they all go at once.

export interface RoomUploadItem {
  key: string
  name: string
  status: 'waiting' | 'uploading' | 'done' | 'failed'
  error?: string
}

export function useRoomUpload(familyId: string, onUploaded: () => unknown) {
  const items = ref<RoomUploadItem[]>([])
  const busy = computed(() =>
    items.value.some((item) => item.status === 'waiting' || item.status === 'uploading'),
  )

  async function upload(files: File[], albumId: string | null) {
    const batch = files.map((file) => ({
      file,
      item: reactive<RoomUploadItem>({
        key: crypto.randomUUID(),
        name: file.name,
        status: 'waiting',
      }),
    }))
    items.value = [
      ...items.value.filter((item) => item.status !== 'done'),
      ...batch.map((entry) => entry.item),
    ]

    for (const { file, item } of batch) {
      item.status = 'uploading'
      try {
        const prepared = await prepareRoomPhoto(file).catch(() => {
          throw new Error('This browser cannot read that file as a picture.')
        })
        const form = new FormData()
        form.append('file', prepared.full, 'photo.jpg')
        form.append('thumb', prepared.thumb, 'thumb.jpg')
        form.append('width', String(prepared.width))
        form.append('height', String(prepared.height))
        if (albumId) form.append('albumId', albumId)
        await $fetch(`/api/room/${familyId}/photos`, { method: 'POST', body: form })
        item.status = 'done'
      } catch (error) {
        item.status = 'failed'
        item.error = apiErrorMessage(
          error,
          error instanceof Error && !('data' in error)
            ? error.message
            : 'The upload failed. Try again.',
        )
      }
    }
    await onUploaded()
  }

  function clearFinished() {
    items.value = items.value.filter(
      (item) => item.status === 'waiting' || item.status === 'uploading',
    )
  }

  return { items, busy, upload, clearFinished }
}
