// One sentence said once, on the page a person lands on after something
// begins for them (accepting an invitation, joining a family). Whoever sends
// them there sets it; <WelcomeNote> on the page says it and forgets it.
export const useWelcomeNote = () => useState<string | null>('welcome-note', () => null)
