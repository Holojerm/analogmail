// D1 allows 100 bound parameters in a statement. A list that grows with the
// number of people (ids to look up, rows to insert) is sent in pieces.

/** Ids in one list of a where clause. */
export const IN_LIST = 80

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}
