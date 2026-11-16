// A zip archive with nothing compressed: the files are stored as they are.
// Photos are already compressed and letters are small, so this costs little,
// and it means no compression library has to be trusted with a person's
// letters. Every unzip tool reads it.

type Bytes = Uint8Array<ArrayBuffer>

export interface ZipFile {
  /** Path inside the archive, with forward slashes. */
  name: string
  data: Bytes
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Bytes): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// MS-DOS date and time, which is what a zip entry carries.
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear())
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  }
}

const UTF8_NAMES = 0x0800
const VERSION = 20

/** The archive's parts in order, ready to hand to a `Blob`. */
export function zipParts(files: ZipFile[], at: Date): Bytes[] {
  const encoder = new TextEncoder()
  const stamp = dosStamp(at)
  const parts: Bytes[] = []
  const directory: Bytes[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, VERSION, true)
    local.setUint16(6, UTF8_NAMES, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, stamp.time, true)
    local.setUint16(12, stamp.date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true)
    local.setUint32(22, size, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, file.data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, VERSION, true)
    central.setUint16(6, VERSION, true)
    central.setUint16(8, UTF8_NAMES, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, stamp.time, true)
    central.setUint16(14, stamp.date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    directory.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + size
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, directorySize, true)
  end.setUint32(16, offset, true)
  return [...parts, ...directory, new Uint8Array(end.buffer)]
}

/** The classic format's own limits: 65,535 files and 4 GB. */
export const ZIP_FILES_MAX = 65_535
export const ZIP_BYTES_MAX = 0xffffffff

export const zipBlob = (files: ZipFile[], at: Date) =>
  new Blob(zipParts(files, at), { type: 'application/zip' })
