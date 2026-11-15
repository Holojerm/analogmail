// Local dev DB seeder — run with `bun seed`.
//
// NuxtHub serves the dev DB from .data/db/sqlite.db (hub.dir defaults to .data).
// Wrangler's own local D1 lives at .wrangler/state/v3/d1/ — DO NOT seed there;
// the dev server will not read it. Reach NuxtHub's file directly via bun:sqlite.
//
// Idempotent: re-running won't duplicate rows (users are keyed by email). Sign
// in as any of them via the dev endpoint (POST /api/auth/dev — dev-only, see
// server/api/auth/dev.post.ts).

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { eq } from 'drizzle-orm'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

import * as schema from '../server/db/schema'

const DB_PATH = resolve(import.meta.dir, '../.data/db/sqlite.db')

if (!existsSync(DB_PATH)) {
  console.error(`No local DB at ${DB_PATH}.`)
  console.error('Start the dev server once (bun dev) so NuxtHub creates the file, then re-run.')
  process.exit(1)
}

const db = drizzle(new Database(DB_PATH), { schema })

const seedUsers = [
  { email: 'demo@example.com', name: 'Demo User', role: 'user' },
  { email: 'admin@example.com', name: 'Admin User', role: 'admin' },
]

for (const seedUser of seedUsers) {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, seedUser.email) })
  if (existing) {
    console.info(`= ${seedUser.email} already exists, skipping`)
    continue
  }
  await db.insert(schema.users).values(seedUser)
  console.info(`+ ${seedUser.email}`)
}

console.info('Done.')
