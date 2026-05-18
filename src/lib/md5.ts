/**
 * Minimal pure JavaScript MD5 implementation.
 * Self-contained, no external dependencies.
 * Based on RFC 1321.
 */

/** Compute MD5 hash of a Uint8Array, returns hex string (pure JS). */
export function md5(data: Uint8Array): string {
  const len = data.length
  const bitLen = len * 8

  // MD5 padding: append 0x80, then zeros until length ≡ 56 (mod 64)
  // Then append 64-bit length (little-endian)
  const curLen = len + 1 // after appending 0x80
  const padZeros = (56 - (curLen % 64) + 64) % 64
  const totalLen = curLen + padZeros + 8 // must be multiple of 64

  const buffer = new ArrayBuffer(totalLen)
  const view = new Uint8Array(buffer)
  view.set(data)
  view[len] = 0x80
  // Zeros are already there

  // Append length as little-endian 64-bit
  const words = new Uint32Array(buffer, totalLen - 8, 2)
  words[0] = bitLen
  words[1] = Math.floor(bitLen / 0x100000000)

  // Initialize state
  let A = 0x67452301, B = 0xefcdab89, C = 0x98badcfe, D = 0x10325476

  // Sine table
  const T = new Uint32Array(64)
  for (let i = 0; i < 64; i++) {
    T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0
  }

  // Rotation counts
  const S = new Uint8Array([
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
  ])

  // Permutation
  const K = new Uint16Array([
     0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
     1,  6, 11,  0,  5, 10, 15,  4,  9, 14,  3,  8, 13,  2,  7, 12,
     5,  8, 11, 14,  1,  4,  7, 10, 13,  0,  3,  6,  9, 12, 15,  2,
     0,  7, 14,  5, 12,  3, 10,  1,  8, 15,  6, 13,  4, 11,  2,  9
  ])

  const numChunks = totalLen >>> 6
  const X = new Uint32Array(16)

  for (let i = 0; i < numChunks; i++) {
    const offset = i * 64
    for (let j = 0; j < 16; j++) {
      const base = offset + j * 4
      X[j] = (view[base] |
              (view[base + 1] << 8) |
              (view[base + 2] << 16) |
              (view[base + 3] << 24)) >>> 0
    }

    const AA = A, BB = B, CC = C, DD = D

    // Round 1
    let F: number
    F = (B & C) | (~B & D); A = ((A + F + X[K[0]]  + T[0])  << S[0]  | (A >>> (32 - S[0]))) + B >>> 0
    F = (D & A) | (~D & C); B = ((B + F + X[K[1]]  + T[1])  << S[1]  | (B >>> (32 - S[1]))) + C >>> 0
    F = (C & B) | (~C & A); C = ((C + F + X[K[2]]  + T[2])  << S[2]  | (C >>> (32 - S[2]))) + D >>> 0
    F = (A & C) | (~A & B); D = ((D + F + X[K[3]]  + T[3])  << S[3]  | (D >>> (32 - S[3]))) + A >>> 0
    F = (B & D) | (~B & C); A = ((A + F + X[K[4]]  + T[4])  << S[4]  | (A >>> (32 - S[4]))) + B >>> 0
    F = (C & A) | (~C & D); B = ((B + F + X[K[5]]  + T[5])  << S[5]  | (B >>> (32 - S[5]))) + C >>> 0
    F = (D & B) | (~D & A); C = ((C + F + X[K[6]]  + T[6])  << S[6]  | (C >>> (32 - S[6]))) + D >>> 0
    F = (A & C) | (~A & B); D = ((D + F + X[K[7]]  + T[7])  << S[7]  | (D >>> (32 - S[7]))) + A >>> 0
    F = (B & D) | (~B & C); A = ((A + F + X[K[8]]  + T[8])  << S[8]  | (A >>> (32 - S[8]))) + B >>> 0
    F = (C & A) | (~C & D); B = ((B + F + X[K[9]]  + T[9])  << S[9]  | (B >>> (32 - S[9]))) + C >>> 0
    F = (D & B) | (~D & A); C = ((C + F + X[K[10]] + T[10]) << S[10] | (C >>> (32 - S[10]))) + D >>> 0
    F = (A & C) | (~A & B); D = ((D + F + X[K[11]] + T[11]) << S[11] | (D >>> (32 - S[11]))) + A >>> 0
    F = (B & D) | (~B & C); A = ((A + F + X[K[12]] + T[12]) << S[12] | (A >>> (32 - S[12]))) + B >>> 0
    F = (C & A) | (~C & D); B = ((B + F + X[K[13]] + T[13]) << S[13] | (B >>> (32 - S[13]))) + C >>> 0
    F = (D & B) | (~D & A); C = ((C + F + X[K[14]] + T[14]) << S[14] | (C >>> (32 - S[14]))) + D >>> 0
    F = (A & C) | (~A & B); D = ((D + F + X[K[15]] + T[15]) << S[15] | (D >>> (32 - S[15]))) + A >>> 0

    // Round 2
    F = (D ^ B ^ C); A = ((A + F + X[K[1]]  + T[16]) << S[16] | (A >>> (32 - S[16]))) + B >>> 0
    F = (A ^ D ^ B); B = ((B + F + X[K[6]]  + T[17]) << S[17] | (B >>> (32 - S[17]))) + C >>> 0
    F = (B ^ A ^ D); C = ((C + F + X[K[11]] + T[18]) << S[18] | (C >>> (32 - S[18]))) + D >>> 0
    F = (C ^ B ^ A); D = ((D + F + X[K[0]]  + T[19]) << S[19] | (D >>> (32 - S[19]))) + A >>> 0
    F = (D ^ C ^ B); A = ((A + F + X[K[5]]  + T[20]) << S[20] | (A >>> (32 - S[20]))) + B >>> 0
    F = (A ^ D ^ C); B = ((B + F + X[K[10]] + T[21]) << S[21] | (B >>> (32 - S[21]))) + C >>> 0
    F = (B ^ A ^ D); C = ((C + F + X[K[15]] + T[22]) << S[22] | (C >>> (32 - S[22]))) + D >>> 0
    F = (C ^ B ^ A); D = ((D + F + X[K[4]]  + T[23]) << S[23] | (D >>> (32 - S[23]))) + A >>> 0
    F = (D ^ C ^ B); A = ((A + F + X[K[9]]  + T[24]) << S[24] | (A >>> (32 - S[24]))) + B >>> 0
    F = (A ^ D ^ C); B = ((B + F + X[K[14]] + T[25]) << S[25] | (B >>> (32 - S[25]))) + C >>> 0
    F = (B ^ A ^ D); C = ((C + F + X[K[3]]  + T[26]) << S[26] | (C >>> (32 - S[26]))) + D >>> 0
    F = (C ^ B ^ A); D = ((D + F + X[K[8]]  + T[27]) << S[27] | (D >>> (32 - S[27]))) + A >>> 0
    F = (D ^ C ^ B); A = ((A + F + X[K[13]] + T[28]) << S[28] | (A >>> (32 - S[28]))) + B >>> 0
    F = (A ^ D ^ C); B = ((B + F + X[K[2]]  + T[29]) << S[29] | (B >>> (32 - S[29]))) + C >>> 0
    F = (B ^ A ^ D); C = ((C + F + X[K[7]]  + T[30]) << S[30] | (C >>> (32 - S[30]))) + D >>> 0
    F = (C ^ B ^ A); D = ((D + F + X[K[12]] + T[31]) << S[31] | (D >>> (32 - S[31]))) + A >>> 0

    // Round 3
    F = (B ^ C ^ D); A = ((A + F + X[K[5]]  + T[32]) << S[32] | (A >>> (32 - S[32]))) + B >>> 0
    F = (A ^ B ^ C); B = ((B + F + X[K[8]]  + T[33]) << S[33] | (B >>> (32 - S[33]))) + C >>> 0
    F = (D ^ A ^ B); C = ((C + F + X[K[11]] + T[34]) << S[34] | (C >>> (32 - S[34]))) + D >>> 0
    F = (C ^ D ^ A); D = ((D + F + X[K[14]] + T[35]) << S[35] | (D >>> (32 - S[35]))) + A >>> 0
    F = (B ^ C ^ D); A = ((A + F + X[K[1]]  + T[36]) << S[36] | (A >>> (32 - S[36]))) + B >>> 0
    F = (A ^ B ^ C); B = ((B + F + X[K[4]]  + T[37]) << S[37] | (B >>> (32 - S[37]))) + C >>> 0
    F = (D ^ A ^ B); C = ((C + F + X[K[7]]  + T[38]) << S[38] | (C >>> (32 - S[38]))) + D >>> 0
    F = (C ^ D ^ A); D = ((D + F + X[K[10]] + T[39]) << S[39] | (D >>> (32 - S[39]))) + A >>> 0
    F = (B ^ C ^ D); A = ((A + F + X[K[13]] + T[40]) << S[40] | (A >>> (32 - S[40]))) + B >>> 0
    F = (A ^ B ^ C); B = ((B + F + X[K[0]]  + T[41]) << S[41] | (B >>> (32 - S[41]))) + C >>> 0
    F = (D ^ A ^ B); C = ((C + F + X[K[3]]  + T[42]) << S[42] | (C >>> (32 - S[42]))) + D >>> 0
    F = (C ^ D ^ A); D = ((D + F + X[K[6]]  + T[43]) << S[43] | (D >>> (32 - S[43]))) + A >>> 0
    F = (B ^ C ^ D); A = ((A + F + X[K[9]]  + T[44]) << S[44] | (A >>> (32 - S[44]))) + B >>> 0
    F = (A ^ B ^ C); B = ((B + F + X[K[12]] + T[45]) << S[45] | (B >>> (32 - S[45]))) + C >>> 0
    F = (D ^ A ^ B); C = ((C + F + X[K[15]] + T[46]) << S[46] | (C >>> (32 - S[46]))) + D >>> 0
    F = (C ^ D ^ A); D = ((D + F + X[K[2]]  + T[47]) << S[47] | (D >>> (32 - S[47]))) + A >>> 0

    // Round 4
    F = (C ^ (B | ~D)); A = ((A + F + X[K[0]]  + T[48]) << S[48] | (A >>> (32 - S[48]))) + B >>> 0
    F = (B ^ (C | ~A)); B = ((B + F + X[K[7]]  + T[49]) << S[49] | (B >>> (32 - S[49]))) + C >>> 0
    F = (A ^ (B | ~C)); C = ((C + F + X[K[14]] + T[50]) << S[50] | (C >>> (32 - S[50]))) + D >>> 0
    F = (D ^ (A | ~B)); D = ((D + F + X[K[5]]  + T[51]) << S[51] | (D >>> (32 - S[51]))) + A >>> 0
    F = (C ^ (D | ~A)); A = ((A + F + X[K[12]] + T[52]) << S[52] | (A >>> (32 - S[52]))) + B >>> 0
    F = (B ^ (C | ~D)); B = ((B + F + X[K[3]]  + T[53]) << S[53] | (B >>> (32 - S[53]))) + C >>> 0
    F = (A ^ (B | ~C)); C = ((C + F + X[K[10]] + T[54]) << S[54] | (C >>> (32 - S[54]))) + D >>> 0
    F = (D ^ (A | ~B)); D = ((D + F + X[K[1]]  + T[55]) << S[55] | (D >>> (32 - S[55]))) + A >>> 0
    F = (C ^ (D | ~A)); A = ((A + F + X[K[8]]  + T[56]) << S[56] | (A >>> (32 - S[56]))) + B >>> 0
    F = (B ^ (C | ~D)); B = ((B + F + X[K[15]] + T[57]) << S[57] | (B >>> (32 - S[57]))) + C >>> 0
    F = (A ^ (B | ~C)); C = ((C + F + X[K[6]]  + T[58]) << S[58] | (C >>> (32 - S[58]))) + D >>> 0
    F = (D ^ (A | ~B)); D = ((D + F + X[K[13]] + T[59]) << S[59] | (D >>> (32 - S[59]))) + A >>> 0
    F = (C ^ (D | ~A)); A = ((A + F + X[K[4]]  + T[60]) << S[60] | (A >>> (32 - S[60]))) + B >>> 0
    F = (B ^ (C | ~D)); B = ((B + F + X[K[11]] + T[61]) << S[61] | (B >>> (32 - S[61]))) + C >>> 0
    F = (A ^ (B | ~C)); C = ((C + F + X[K[2]]  + T[62]) << S[62] | (C >>> (32 - S[62]))) + D >>> 0
    F = (D ^ (A | ~B)); D = ((D + F + X[K[9]]  + T[63]) << S[63] | (D >>> (32 - S[63]))) + A >>> 0

    // Accumulate
    A = (A + AA) >>> 0
    B = (B + BB) >>> 0
    C = (C + CC) >>> 0
    D = (D + DD) >>> 0
  }

  // Produce final hash (little-endian)
  let hex = ''
  const wordsOut = [A, B, C, D] as const
  for (const w of wordsOut) {
    hex += (w & 0xff).toString(16).padStart(2, '0')
    hex += ((w >>> 8) & 0xff).toString(16).padStart(2, '0')
    hex += ((w >>> 16) & 0xff).toString(16).padStart(2, '0')
    hex += ((w >>> 24) & 0xff).toString(16).padStart(2, '0')
  }
  return hex
}

/** Compute MD5 hash of a string, returns hex string. */
export function md5String(str: string): string {
  const encoder = new TextEncoder()
  return md5(encoder.encode(str))
}

export default md5
