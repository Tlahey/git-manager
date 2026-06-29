import useSWR from 'swr'
import { apiReadSshPublicKey } from '../api/ssh.api'

export function useSshPublicKey(path: string | null) {
  return useSWR<string, Error>(
    path ? ['ssh-public-key', path] : null,
    () => apiReadSshPublicKey(path as string),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  )
}
