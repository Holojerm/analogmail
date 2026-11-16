// The copy a guest may keep of the letter they just sent: the only one they
// will ever have, since no account was made and the letter cannot be fetched
// again. Plain text, with the photo beside it when there is one.

import { fileSafe } from '../../shared/utils/archive'
import type { LetterDoc } from '../../shared/utils/letter-doc'
import { richDocToText } from '../../shared/utils/rich-plain'
import { yearDay } from './stationery'
import { zipBlob } from '#layers/post/app/utils/zip'

export function guestCopy(
  mantelName: string,
  opensOn: string,
  doc: LetterDoc,
  photo: ArrayBuffer | null,
): { blob: Blob; name: string } {
  const lines = [
    `A letter to ${mantelName}`,
    `Sealed until ${yearDay(opensOn)}.`,
    '',
    richDocToText(doc.content),
    '',
    doc.from,
  ]
  if (doc.photo && photo) {
    lines.push('', `[Photo${doc.photo.alt ? `: ${doc.photo.alt}` : ''}. See photo.jpg]`)
  }
  const text = new TextEncoder().encode(`${lines.join('\n')}\n`)
  const name = `Letter to ${fileSafe(mantelName)}`
  if (!photo)
    return { blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), name: `${name}.txt` }
  const files = [
    { name: 'letter.txt', data: text },
    { name: 'photo.jpg', data: new Uint8Array(photo) },
  ]
  return { blob: zipBlob(files, new Date()), name: `${name}.zip` }
}
