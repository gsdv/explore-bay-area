/**
 * filler.bin: one box per house (real in SF, procedural elsewhere). Shared by the pipeline (encode) and the app (decode).
 * In memory a block is 7 floats: x, y, z, width, depth, height, bearing (world units, radians about +Y).
 * On disk: uint32 count, then x/z as float32 pairs (row houses touch, so position keeps full precision), then
 * y, width, depth, height as uint16 steps of 5 cm and the bearing as a uint16 turn. 18 bytes a block instead of 28.
 */
export const BLOCK_STRIDE = 7
const STEP = 1 / 2000 // world units (5 cm)
const Y_OFFSET = 1 // blocks near the shore sit a little below zero

export function encodeBlocks(blocks: ArrayLike<number>): Uint8Array {
  const n = blocks.length / BLOCK_STRIDE
  const out = new ArrayBuffer(4 + n * 8 + n * 10)
  new Uint32Array(out, 0, 1)[0] = n
  const xz = new Float32Array(out, 4, n * 2)
  const q = new Uint16Array(out, 4 + n * 8, n * 5)
  const u16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)))
  for (let i = 0; i < n; i++) {
    const o = i * BLOCK_STRIDE
    xz[i * 2] = blocks[o]
    xz[i * 2 + 1] = blocks[o + 2]
    q[i * 5] = u16((blocks[o + 1] + Y_OFFSET) / STEP)
    q[i * 5 + 1] = u16(blocks[o + 3] / STEP)
    q[i * 5 + 2] = u16(blocks[o + 4] / STEP)
    q[i * 5 + 3] = u16(blocks[o + 5] / STEP)
    const turn = blocks[o + 6] / (Math.PI * 2)
    q[i * 5 + 4] = Math.round((turn - Math.floor(turn)) * 65536) & 65535
  }
  return new Uint8Array(out)
}

export function decodeBlocks(buf: ArrayBuffer): Float32Array {
  const n = new Uint32Array(buf, 0, 1)[0]
  const xz = new Float32Array(buf, 4, n * 2)
  const q = new Uint16Array(buf, 4 + n * 8, n * 5)
  const out = new Float32Array(n * BLOCK_STRIDE)
  for (let i = 0; i < n; i++) {
    const o = i * BLOCK_STRIDE
    out[o] = xz[i * 2]
    out[o + 1] = q[i * 5] * STEP - Y_OFFSET
    out[o + 2] = xz[i * 2 + 1]
    out[o + 3] = q[i * 5 + 1] * STEP
    out[o + 4] = q[i * 5 + 2] * STEP
    out[o + 5] = q[i * 5 + 3] * STEP
    out[o + 6] = (q[i * 5 + 4] / 65536) * Math.PI * 2
  }
  return out
}
