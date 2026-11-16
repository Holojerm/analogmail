/**
 * Lower-case with accents folded: how `cities.search_name` is stored and how
 * a typed query is matched against it. One definition for the import script
 * and the search, so they cannot drift.
 */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
