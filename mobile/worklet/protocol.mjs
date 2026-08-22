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

// Bare's runtime exposes no WHATWG TextEncoder/TextDecoder globals -- Hermes does, which is why
// this only ever failed on device, inside the worklet, with a SIGABRT rather than a JS error.
// Doing UTF-8 by hand keeps the promise the header comment above already makes.

/** @param {string} str @returns {Uint8Array} */
function utf8Encode (str) {
  const out = new Uint8Array(str.length * 3)
  let n = 0
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    if (c < 0x80) out[n++] = c
    else if (c < 0x800) {
      out[n++] = 0xc0 | (c >> 6)
      out[n++] = 0x80 | (c & 0x3f)
    } else if (c < 0x10000) {
      out[n++] = 0xe0 | (c >> 12)
      out[n++] = 0x80 | ((c >> 6) & 0x3f)
      out[n++] = 0x80 | (c & 0x3f)
    } else {
      out[n++] = 0xf0 | (c >> 18)
      out[n++] = 0x80 | ((c >> 12) & 0x3f)
      out[n++] = 0x80 | ((c >> 6) & 0x3f)
      out[n++] = 0x80 | (c & 0x3f)
    }
  }
  return out.subarray(0, n)
}

/** @param {Uint8Array} bytes @returns {string} */
function utf8Decode (bytes) {
  let str = ''
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]
    let c
    if (b < 0x80) { c = b; i += 1 } else if ((b & 0xe0) === 0xc0) {
      c = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2
    } else if ((b & 0xf0) === 0xe0) {
      c = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3
    } else {
      c = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); i += 4
    }
    if (c > 0xffff) {
      c -= 0x10000
      str += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff))
    } else str += String.fromCharCode(c)
  }
  return str
}

/**
 * @param {object} header
 * @param {Uint8Array|null} [payload]
 * @returns {Uint8Array}
 */
export function encodeFrame (header, payload = null) {
  const h = utf8Encode(JSON.stringify(header))
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
      const header = JSON.parse(utf8Decode(buf.subarray(4, 4 + headerLen)))
      const total = 4 + headerLen + (header.payloadLen || 0)
      if (buf.byteLength < total) return
      const payload = header.payloadLen ? buf.subarray(4 + headerLen, total) : null
      // copy out before advancing, the caller may hold it
      onFrame(header, payload ? new Uint8Array(payload) : null)
      buf = buf.subarray(total)
    }
  }
}
