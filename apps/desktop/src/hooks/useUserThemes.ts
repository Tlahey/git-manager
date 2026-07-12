import useSWR from 'swr'
import type { UserTheme } from '@git-manager/git-types'
import { apiGetUserThemes } from '../api/theme.api'

export function useUserThemes() {
  return useSWR<UserTheme[], Error>('user-themes', apiGetUserThemes, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })
}
