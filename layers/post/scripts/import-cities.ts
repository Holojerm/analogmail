// Fills the `cities` table from GeoNames — run with `bun run cities:import`.
//
//   bun run cities:import            the local dev database (.data/db/sqlite.db)
//   bun run cities:import --remote   production D1, through wrangler
//   bun run cities:import --remote --env preview
//
// Source: GeoNames cities5000 (every place over 5,000 people, about 68,000
// rows), CC BY 4.0, credited in NOTICE.md. Not cities15000: that one misses
// villages people live in, like Tuckahoe, NY. Safe to run again: rows are
// replaced by GeoNames id, and nobody's profile points back at this table for
// its coordinates (they are copied at sign-up).
//
// Not a migration on purpose: the test suite applies every migration to a
// fresh database for each test file.

import { Database } from 'bun:sqlite'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { searchKey } from '../shared/utils/search-key'

const SOURCE = 'https://download.geonames.org/export/dump'
const EXPORT = 'cities5000'
const ROOT = resolve(import.meta.dir, '../../..')
const remote = process.argv.includes('--remote')
const envIndex = process.argv.indexOf('--env')
const envName = envIndex === -1 ? null : process.argv[envIndex + 1]

const run = (command: string[], cwd = ROOT) => {
  const result = Bun.spawnSync(command, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`${command[0]} exited with ${result.exitCode}`)
}
const download = async (name: string, to: string) => {
  const response = await fetch(`${SOURCE}/${name}`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  await Bun.write(to, response)
}

const work = mkdtempSync(join(tmpdir(), 'cities-'))
try {
  await download(`${EXPORT}.zip`, join(work, `${EXPORT}.zip`))
  await download('admin1CodesASCII.txt', join(work, 'admin1.txt'))
  run(['unzip', '-q', '-o', `${EXPORT}.zip`], work)

  // "US.IL<TAB>Illinois<TAB>…"
  const regions = new Map<string, string>()
  for (const line of readFileSync(join(work, 'admin1.txt'), 'utf8').split('\n')) {
    const [code, name] = line.split('\t')
    if (code && name) regions.set(code, name)
  }

  // GeoNames columns: 0 id, 1 name, 2 ascii name, 4 lat, 5 lng, 8 country,
  // 10 admin1, 14 population, 17 time zone.
  const rows = readFileSync(join(work, `${EXPORT}.txt`), 'utf8')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length >= 18 && cols[17])
    .map((cols) => ({
      id: Number(cols[0]),
      name: cols[1]!,
      searchName: searchKey(cols[2] || cols[1]!),
      region: regions.get(`${cols[8]}.${cols[10]}`) ?? null,
      country: cols[8]!,
      lat: Number(cols[4]),
      lng: Number(cols[5]),
      timeZone: cols[17]!,
      population: Number(cols[14]) || 0,
    }))
    .filter((row) => row.id && row.searchName && Number.isFinite(row.lat))

  const INSERT =
    'INSERT OR REPLACE INTO cities (id, name, search_name, region, country, lat, lng, time_zone, population) VALUES'

  if (remote) {
    const quote = (value: string | null) =>
      value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
    const statements: string[] = []
    for (let start = 0; start < rows.length; start += 200) {
      const values = rows
        .slice(start, start + 200)
        .map(
          (row) =>
            `(${row.id}, ${quote(row.name)}, ${quote(row.searchName)}, ${quote(row.region)}, ${quote(row.country)}, ${row.lat}, ${row.lng}, ${quote(row.timeZone)}, ${row.population})`,
        )
      statements.push(`${INSERT} ${values.join(',')};`)
    }
    const file = join(work, 'cities.sql')
    writeFileSync(file, statements.join('\n'))
    const database = envName === 'preview' ? 'dearmantel-db-preview' : 'dearmantel-db'
    run([
      'bunx',
      'wrangler',
      'd1',
      'execute',
      database,
      '--remote',
      `--file=${file}`,
      ...(envName ? ['--env', envName] : []),
    ])
  } else {
    const path = join(ROOT, '.data/db/sqlite.db')
    if (!existsSync(path)) {
      throw new Error(`No local database at ${path}. Start the dev server once, then run again.`)
    }
    const db = new Database(path)
    const insert = db.prepare(`${INSERT} (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    db.transaction(() => {
      for (const row of rows) {
        insert.run(
          row.id,
          row.name,
          row.searchName,
          row.region,
          row.country,
          row.lat,
          row.lng,
          row.timeZone,
          row.population,
        )
      }
    })()
    db.close()
  }
  console.info(
    `cities:import — ${rows.length} cities → ${remote ? 'remote D1' : 'local dev database'}`,
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
