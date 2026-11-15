// Mirror gate — run with `bun run mirror:check`, wired into `bun run ci`.
//
// Two passes, one theme: promises that nothing enforces.
//
//   1. BEHAVIOURAL mirrors — rules deliberately written twice because a
//      separate Worker cannot import the app's TypeScript. Both copies are run
//      over a shared table of inputs and must agree. None today.
//   2. REFERENCE resolution — every file, symbol, and variable a comment or doc
//      names must still exist. See scripts/lib/check-references.ts for why this
//      is narrow on purpose.
//
// Both fail the build. A stale cross-reference is not a style problem: an agent
// reads it, trusts it, and goes looking for something that is not there.
//
// Mirrors are checked by BEHAVIOUR, not by text: each function is extracted
// from its file and evaluated, and both copies are run over a shared table of
// inputs. Why a gate script and not a test: the vitest suite runs inside
// workerd, which has no filesystem. This runs in Bun, where it can.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { extractFunction as sliceFunction } from './lib/brace-match'
import { findDeadReferences } from './lib/check-references'

const ROOT = resolve(import.meta.dir, '..')

/**
 * Pull one `function name(...) { ... }` out of a source file.
 *
 * A regex cannot do this — the bodies contain braces — and importing the
 * modules is not an option either: the app's module reaches for Nuxt aliases
 * and Drizzle, and the worker's for the `agents` SDK, neither of which resolves
 * from a plain script.
 *
 * The scanning lives in scripts/lib/brace-match.ts, shared with
 * scripts/check-seo.ts. It returns null on unbalanced input rather than
 * guessing at a span; here that is fatal, because a half-extracted function
 * would either fail to compile below or, worse, compile into something that
 * silently disagrees with its mirror.
 */
function extractFunction(source: string, name: string): string {
  const extracted = sliceFunction(source, name)
  if (extracted === null) throw new Error(`could not extract function ${name}()`)
  return extracted
}

/** Evaluate an extracted predicate, with any helpers it needs supplied. */
function compilePredicate(
  body: string,
  name: string,
  helpers: Record<string, unknown> = {},
): (value: string) => boolean {
  const helperNames = Object.keys(helpers)
  // TypeScript annotations are stripped by Bun's own transpiler rather than by
  // hand — these are .ts sources and `(email: string)` is not valid JS.
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(`${body}\nreturn ${name}`)
  const factory = new Function(...helperNames, js) as (...args: unknown[]) => (v: string) => boolean
  return factory(...helperNames.map((key) => helpers[key]))
}

interface Mirror {
  what: string
  a: { file: string; fn: string; helpers?: string[] }
  b: { file: string; fn: string; helpers?: string[] }
  /** Inputs both sides must classify identically. */
  cases: string[]
}

// Empty since the MCP worker was removed — kept so a future second Worker that
// cannot import the app's TypeScript has somewhere to declare its mirrors.
const MIRRORS: Mirror[] = []

const problems: string[] = []

for (const mirror of MIRRORS) {
  const load = (side: Mirror['a']) => {
    const source = readFileSync(join(ROOT, side.file), 'utf8')
    const helpers = Object.fromEntries(
      (side.helpers ?? []).map((helper) => [
        helper,
        compilePredicate(extractFunction(source, helper), helper),
      ]),
    )
    return compilePredicate(extractFunction(source, side.fn), side.fn, helpers)
  }

  let a: (value: string) => boolean
  let b: (value: string) => boolean
  try {
    a = load(mirror.a)
    b = load(mirror.b)
  } catch (error) {
    problems.push(`${mirror.what}: ${String(error)}`)
    continue
  }

  for (const input of mirror.cases) {
    const left = a(input)
    const right = b(input)
    if (left !== right) {
      problems.push(
        `${mirror.what}: "${input}" → ${mirror.a.fn}=${left} but ${mirror.b.fn}=${right}\n` +
          `    ${mirror.a.file} and ${mirror.b.file} have drifted apart.`,
      )
    }
  }
}

// ── Pass 2: reference resolution ────────────────────────────────────────────

const dead = findDeadReferences(ROOT)

// ── Report ──────────────────────────────────────────────────────────────────

if (problems.length === 0 && dead.length === 0) {
  console.info(
    `mirror:check — ${MIRRORS.length} mirrored rule(s) agree, every named reference resolves`,
  )
  process.exit(0)
}

if (problems.length > 0) {
  console.error(`\nmirror:check failed — ${problems.length} mirror problem(s)\n`)
  for (const problem of problems) console.error(`  ${problem}\n`)
  console.error('These rules are deliberately written twice because the MCP worker cannot')
  console.error('import the app. Change one, change the other.\n')
}

if (dead.length > 0) {
  console.error(`\nmirror:check failed — ${dead.length} dead reference(s)\n`)
  for (const ref of dead) {
    console.error(`  ${ref.file}:${ref.line}  \`${ref.token}\` — ${ref.why}`)
  }
  console.error(
    '\nA comment or doc names something this repo no longer contains. Fix the name,\n' +
      'or drop the reference — a confident pointer to nothing costs the next agent\n' +
      'more than no pointer at all. Deliberate exception: add `refs-check-ignore` to\n' +
      'the line.\n',
  )
}

process.exit(1)
