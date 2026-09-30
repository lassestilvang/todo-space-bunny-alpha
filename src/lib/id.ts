const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function uid(prefix = ''): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % 36]
  return prefix ? `${prefix}_${out}` : out
}
