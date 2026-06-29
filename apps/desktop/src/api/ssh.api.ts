import { generateSshKey, readSshPublicKey } from '../lib/tauri'

export async function apiGenerateSshKey(
  keyType: string,
  bits: number | null,
  comment: string,
  path: string,
  passphrase?: string
) {
  return generateSshKey(keyType, bits, comment, path, passphrase)
}

export async function apiReadSshPublicKey(path: string) {
  return readSshPublicKey(path)
}
