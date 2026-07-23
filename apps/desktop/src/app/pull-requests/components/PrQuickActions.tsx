import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Eye, GitMerge, XCircle, ExternalLink, Link as LinkIcon, FolderGit2 } from 'lucide-react'
import {
  Button,
  NativeSelect,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  toast,
} from '@git-manager/ui'
import { SplitButton, type SplitButtonAction } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import { useSettingsStore } from '../../../stores/settings.store'
import { mergePullRequest, updatePullRequest, type MergeMethod } from '../../../api/github.api'
import type { MockPR } from '../types'
import { openUrl } from '../utils'
import { defaultPrActionKey, canMergePr, type PrActionKey } from '../prActions'
import { useOpenPr } from '../OpenPrContext'

interface PrQuickActionsProps {
  pr: MockPR
}

/** `owner/repo` for a PR, from its `fullName` or parsed from `repoUrl`. Null when neither resolves. */
function ownerRepoOf(pr: MockPR): { owner: string; repo: string } | null {
  const full = pr.fullName || pr.repoUrl.split('github.com/')[1] || ''
  const [owner, repo] = full.split('/')
  return owner && repo ? { owner, repo } : null
}

/**
 * The per-row split button of GitHub actions: a primary that adapts to the PR's state (Review a
 * review you owe, Merge your own green PR, Open a closed one, else View), with the rest — merge/
 * close (behind a confirm dialog), open on GitHub, view repo, copy link — in its dropdown. Pin and
 * snooze are handled separately as hover icons on the row's left edge.
 */
export function PrQuickActions({ pr }: PrQuickActionsProps) {
  const { t } = useTranslation('launchpad')
  const { mutate } = useSWRConfig()
  const openPr = useOpenPr()

  // Revalidate the Launchpad's GitHub data after a write so the row reflects the new state.
  const refreshPrData = () => mutate((key) => Array.isArray(key) && key[0] === 'github-data')
  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) ?? null
  const token = activeAccount?.token ?? null
  const currentUser = activeAccount?.user?.login ?? null

  const [confirm, setConfirm] = useState<'merge' | 'close' | null>(null)
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash')
  const [busy, setBusy] = useState(false)

  const isOpenState = pr.status !== 'merged' && pr.status !== 'closed'
  const canMerge = !!token && canMergePr(pr, currentUser)
  const canClose = !!token && isOpenState && !!currentUser && pr.author === currentUser

  const openPanel = () => (openPr ? openPr(pr) : openUrl(pr.url))

  async function runMerge() {
    const or = ownerRepoOf(pr)
    if (!or || !token) return
    setBusy(true)
    try {
      await mergePullRequest(or.owner, or.repo, pr.number, { mergeMethod }, token)
      toast.success(t('merge.success'))
      refreshPrData()
    } catch (e) {
      toast.error(t('merge.error', { error: String(e) }))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function runClose() {
    const or = ownerRepoOf(pr)
    if (!or || !token) return
    setBusy(true)
    try {
      await updatePullRequest(or.owner, or.repo, pr.number, { state: 'closed' }, token)
      toast.success(t('close.success'))
      refreshPrData()
    } catch (e) {
      toast.error(t('close.error', { error: String(e) }))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const descriptors: Record<PrActionKey, SplitButtonAction | null> = {
    review: { key: 'review', label: t('row.review'), icon: <Eye className="h-3.5 w-3.5" />, onSelect: openPanel },
    view: { key: 'view', label: t('row.view'), icon: <Eye className="h-3.5 w-3.5" />, onSelect: openPanel },
    merge: canMerge
      ? { key: 'merge', label: t('row.merge'), icon: <GitMerge className="h-3.5 w-3.5" />, onSelect: () => setConfirm('merge') }
      : null,
    close: canClose
      ? { key: 'close', label: t('row.closePr'), icon: <XCircle className="h-3.5 w-3.5" />, onSelect: () => setConfirm('close') }
      : null,
    openGitHub: { key: 'openGitHub', label: t('row.openOnGitHub'), icon: <ExternalLink className="h-3.5 w-3.5" />, onSelect: () => openUrl(pr.url) },
    viewRepo: { key: 'viewRepo', label: t('row.viewRepo'), icon: <FolderGit2 className="h-3.5 w-3.5" />, onSelect: () => openUrl(pr.repoUrl) },
    copyLink: { key: 'copyLink', label: t('row.copyLink'), icon: <LinkIcon className="h-3.5 w-3.5" />, onSelect: () => navigator.clipboard.writeText(pr.url) },
  }

  const primaryKey = defaultPrActionKey(pr, currentUser)
  const primary = descriptors[primaryKey] ?? descriptors.view!

  const restKeys: PrActionKey[] = [
    pr.needsMyReview ? 'review' : 'view',
    'merge',
    'close',
    'openGitHub',
    'viewRepo',
    'copyLink',
  ].filter((k) => k !== primary.key) as PrActionKey[]

  const restActions = restKeys
    .map((k) => descriptors[k])
    .filter((a): a is SplitButtonAction => a !== null)

  return (
    <>
      <SplitButton
        size="sm"
        variant={primary.key === 'merge' ? 'success' : 'outline'}
        label={primary.label}
        icon={primary.icon}
        onClick={primary.onSelect}
        actions={restActions}
        busy={busy}
        testIdPrefix={`pr-actions-${pr.id}`}
      />

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm === 'merge' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('merge.title')}</DialogTitle>
                <DialogDescription>{t('merge.description', { title: pr.title })}</DialogDescription>
              </DialogHeader>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('merge.method')}
                <NativeSelect
                  value={mergeMethod}
                  onChange={(e) => setMergeMethod(e.target.value as MergeMethod)}
                >
                  <option value="merge">{t('merge.methodMerge')}</option>
                  <option value="squash">{t('merge.methodSquash')}</option>
                  <option value="rebase">{t('merge.methodRebase')}</option>
                </NativeSelect>
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                  {t('merge.cancel')}
                </Button>
                <Button variant="success" onClick={runMerge} disabled={busy}>
                  {t('merge.confirm')}
                </Button>
              </DialogFooter>
            </>
          ) : confirm === 'close' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('close.title')}</DialogTitle>
                <DialogDescription>{t('close.description', { title: pr.title })}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                  {t('close.cancel')}
                </Button>
                <Button variant="destructive" onClick={runClose} disabled={busy}>
                  {t('close.confirm')}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
