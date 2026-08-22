// Length-prefixed framing over BareKit.IPC, shared by the worklet and the React Native side.
// Uses only Uint8Array/DataView so the exact same file runs under Bare and under Hermes.
//
// Frame: [4B LE headerLen][header JSON utf8][payload bytes]
// The header carries {id, type, ...}; `payloadLen` is implied by the frame boundary.
//
// Why framing at all: the desktop detector was an HTTP server on 127.0.0.1:3085. On device the
// worklet is in-process, so HTTP is replaced by IPC -- but IPC is a byte stream, not a message
// stream, so messages must be delimited.

export const RPC = {
  HEALTH: 'health',
  LOAD: 'load',
  DETECT: 'detect',
  UNLOAD: 'unload'
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/**
 * @param {object} header
 * @param {Uint8Array|null} [payload]
 * @returns {Uint8Array}
 */
export function encodeFrame (header, payload = null) {
  const h = enc.encode(JSON.stringify(header))
  const plen = payload ? payload.byteLength : 0
  const out = new Uint8Array(4 + h.byteLength + plen)
  new DataView(out.buffer).setUint32(0, h.byteLength, true)
  out.set(h, 4)
  if (plen) out.set(payload, 4 + h.byteLength)
  return out
}

/**
 * Incremental reader: feed it chunks, get whole frames back.
 * IPC delivers arbitrary chunk boundaries, so a 116 KB JPEG will arrive split.
 */
/**
 * @param {(header: any, payload: Uint8Array|null) => void} onFrame
 * @returns {(chunk: Uint8Array) => void}
 */
export function createFrameReader (onFrame) {
  let buf = new Uint8Array(0)
  return function push (chunk) {
    const next = new Uint8Array(buf.byteLength + chunk.byteLength)
    next.set(buf, 0)
    next.set(chunk, buf.byteLength)
    buf = next

    for (;;) {
      if (buf.byteLength < 4) return
      const headerLen = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true)
      if (buf.byteLength < 4 + headerLen) return
      const header = JSON.parse(dec.decode(buf.subarray(4, 4 + headerLen)))
      const total = 4 + headerLen + (header.payloadLen || 0)
      if (buf.byteLength < total) return
      const payload = header.payloadLen ? buf.subarray(4 + headerLen, total) : null
      // copy out before advancing, the caller may hold it
      onFrame(header, payload ? new Uint8Array(payload) : null)
      buf = buf.subarray(total)
    }
  }
}
