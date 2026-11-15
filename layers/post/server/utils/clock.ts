// The post office clock. Server code that decides *when* asks `postNow()`
// rather than `new Date()`, so local development can move time forward.
//
// `import.meta.dev` is a literal `false` in a production build, so there the
// offset is always zero and nothing below it is reachable: production time
// cannot be moved, by a stored value or otherwise.

import { kv } from '@nuxthub/kv'

const OFFSET_KEY = 'dev:clock-offset-ms'

export async function clockOffsetMs(): Promise<number> {
  if (!import.meta.dev) return 0
  return Number(await kv.get(OFFSET_KEY)) || 0
}

export async function postNow(): Promise<Date> {
  return new Date(Date.now() + (await clockOffsetMs()))
}

export async function setClockOffsetMs(offsetMs: number): Promise<void> {
  if (!import.meta.dev) throw new Error('The clock only moves in local development')
  await kv.set(OFFSET_KEY, Math.round(offsetMs))
}
