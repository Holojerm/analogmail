// The welcome page asks for a city. Another layer may need one more answer
// before a person can begin (the letters layer: a name), and asking it on the
// same page saves a new person a screen. The post knows nothing of what is
// asked: a layer registers a field, and the page shows it and saves it.
import type { Component } from 'vue'

/** What a registered field exposes to the welcome page. */
export interface WelcomeFieldHandle {
  /** Whether the answer is complete enough to continue. */
  ready: boolean
  /** Saves the answer. False when it could not; the field then says why. */
  save: () => Promise<boolean>
}

const fields = new Map<string, Component>()

export function registerWelcomeField(id: string, component: Component): void {
  fields.set(id, component)
}

export const welcomeFields = () =>
  [...fields.entries()].map(([id, component]) => ({ id, component }))
