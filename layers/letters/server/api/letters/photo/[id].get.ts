// GET /api/letters/photo/<letter> — the sealed photo of a letter the caller
// wrote or has received. With `?mantel=<id>` it is a letter on a mantel the
// caller keeps, and a letter sealed until a day gives up no photo before it.
// Fetching a photo does not mark the letter as read.

import { db } from '@nuxthub/db'
import { z } from 'zod'

import { postNow } from '#layers/post/server/utils/clock'

import { letterIdSchema } from '../../../../shared/utils/letter-doc'
import { readKeptPhoto } from '../../../utils/kept-mantel'
import { photoStore } from '../../../utils/photo-store'
import { readPhoto } from '../../../utils/photos'

const querySchema = z.object({ mantel: z.string().uuid().optional() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = letterIdSchema.safeParse(getRouterParam(event, 'id'))
  const query = querySchema.safeParse(getQuery(event))
  let sealed: ArrayBuffer | null = null
  if (id.success && query.success) {
    sealed = query.data.mantel
      ? await readKeptPhoto(db, photoStore, user.id, query.data.mantel, id.data, await postNow())
      : await readPhoto(db, photoStore, user.id, id.data)
  }
  if (!sealed) throw createError({ statusCode: 404, message: 'There is no photo here for you.' })
  setHeader(event, 'cache-control', 'private, no-store')
  return send(event, new Uint8Array(sealed), 'application/octet-stream')
})
