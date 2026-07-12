import { useSettingsStore } from '../stores/settings.store'

// MD5 implementation for Gravatar
function md5(str: string): string {
  const k = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]

  const r = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]

  const bytes = new TextEncoder().encode(str)
  const wordsCount = (((bytes.length + 8) >> 6) + 1) << 4
  const words = new Int32Array(wordsCount)
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] |= bytes[i] << ((i % 4) << 3)
  }
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) << 3)
  words[wordsCount - 2] = bytes.length * 8

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476

  for (let i = 0; i < wordsCount; i += 16) {
    let a = h0
    let b = h1
    let c = h2
    let d = h3

    for (let j = 0; j < 64; j++) {
      let f, g
      if (j < 16) {
        f = (b & c) | (~b & d)
        g = j
      } else if (j < 32) {
        f = (d & b) | (~d & c)
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        f = b ^ c ^ d
        g = (3 * j + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * j) % 16
      }

      const temp = d
      d = c
      c = b
      const val = a + f + k[j] + words[i + g]
      b = b + ((val << r[j]) | (val >>> (32 - r[j])))
      a = temp
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
  }

  const result = [h0, h1, h2, h3]
  return result
    .map((val) => {
      let hex = ''
      for (let i = 0; i < 4; i++) {
        const byte = (val >> (i * 8)) & 0xff
        hex += byte.toString(16).padStart(2, '0')
      }
      return hex
    })
    .join('')
}

export function getAvatarUrl(email?: string, name?: string): string | null {
  const settings = useSettingsStore.getState().settings
  const showAvatars = settings.appearance.showAvatars

  if (!showAvatars) return null

  // 1. Check if the author matches any connected GitHub account (by email or login/name)
  const accounts = settings.github?.accounts || []
  for (const acc of accounts) {
    const matchesEmail =
      email && acc.user.email && email.trim().toLowerCase() === acc.user.email.trim().toLowerCase()
    const matchesLogin =
      name &&
      (name.trim().toLowerCase() === acc.user.login.trim().toLowerCase() ||
        name.trim().toLowerCase() === (acc.user.name || '').trim().toLowerCase())

    if (matchesEmail || matchesLogin) {
      return acc.user.avatarUrl
    }
  }

  // 2. Fall back to Gravatar
  if (email && email.trim()) {
    const hash = md5(email.trim().toLowerCase())
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`
  }

  return null
}
