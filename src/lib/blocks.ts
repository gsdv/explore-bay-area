/**
 * blocks-<area>.bin: one box per house (real in the detail areas, procedural elsewhere). Shared by the pipeline (encode)
 * and the app (decode). In memory a block is 7 floats: x, y, z, width, depth, height, bearing (world units, radians about +Y).
 *
 * On disk everything is a whole number of 5 cm steps, stored a column at a time so brotli sees like next to like:
 *   uint32 count · bearings as uint16 turns · x, z, y as zigzag varint deltas from the previous block · width, depth,
 *   height as varints.
 * The encoder sorts blocks into 200 m cells (then west to east) first, so neighbours on disk are neighbours on the
 * ground and the deltas stay a byte or two. About 13 bytes a block raw and 10 after brotli, against 28 as floats.
 * Decoded order is therefore the encoder's, not the caller's.
 */
export const BLOCK_STRIDE = 7
const STEP = 1 / 2000 // world units (5 cm)
const CELL = 2 // world units (200 m): the sort key
const DELTA = [0, 2, 1] // x, z, y
const PLAIN = [3, 4, 5] // width, depth, height

export function encodeBlocks(blocks: ArrayLike<number>): Uint8Array {
  const n = blocks.length / BLOCK_STRIDE
  const cell = (i: number, c: number) => Math.floor(blocks[i * BLOCK_STRIDE + c] / CELL)
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => cell(a, 2) - cell(b, 2) || cell(a, 0) - cell(b, 0) || blocks[a * BLOCK_STRIDE] - blocks[b * BLOCK_STRIDE] || a - b,
  )
  const bytes: number[] = []
  const put = (u: number) => {
    while (u > 127) {
      bytes.push((u & 127) | 128)
      u >>>= 7
    }
    bytes.push(u)
  }
  for (const c of DELTA) {
    let prev = 0
    for (const i of order) {
      const v = Math.round(blocks[i * BLOCK_STRIDE + c] / STEP)
      put((((v - prev) << 1) ^ ((v - prev) >> 31)) >>> 0)
      prev = v
    }
  }
  for (const c of PLAIN) for (const i of order) put(Math.max(0, Math.round(blocks[i * BLOCK_STRIDE + c] / STEP)))
  const out = new Uint8Array(4 + n * 2 + bytes.length)
  new Uint32Array(out.buffer, 0, 1)[0] = n
  const turns = new Uint16Array(out.buffer, 4, n)
  order.forEach((i, k) => {
    const turn = blocks[i * BLOCK_STRIDE + 6] / (Math.PI * 2)
    turns[k] = Math.round((turn - Math.floor(turn)) * 65536) & 65535
  })
  out.set(bytes, 4 + n * 2)
  return out
}

export function decodeBlocks(buf: ArrayBuffer): Float32Array {
  const n = new Uint32Array(buf, 0, 1)[0]
  const turns = new Uint16Array(buf, 4, n)
  const bytes = new Uint8Array(buf, 4 + n * 2)
  const out = new Float32Array(n * BLOCK_STRIDE)
  let at = 0
  const get = () => {
    let u = 0, shift = 0, b: number
    do {
      b = bytes[at++]
      u |= (b & 127) << shift
      shift += 7
    } while (b & 128)
    return u >>> 0
  }
  for (const c of DELTA) {
    let prev = 0
    for (let i = 0; i < n; i++) {
      const u = get()
      prev += (u >>> 1) ^ -(u & 1)
      out[i * BLOCK_STRIDE + c] = prev * STEP
    }
  }
  for (const c of PLAIN) for (let i = 0; i < n; i++) out[i * BLOCK_STRIDE + c] = get() * STEP
  for (let i = 0; i < n; i++) out[i * BLOCK_STRIDE + 6] = (turns[i] / 65536) * Math.PI * 2
  return out
}
