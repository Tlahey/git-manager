import { useState, useEffect } from 'react'
import { Button, Input, Separator, Textarea, Checkbox, NativeSelect, Alert } from '@git-manager/ui'
import { Key, FolderOpen, Copy, Check, Plus, AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useSettingsStore } from '../../../stores/settings.store'
import { open } from '@tauri-apps/plugin-dialog'
import { apiGenerateSshKey } from '../../../api/ssh.api'
import { useSshPublicKey } from '../../../hooks/useSshPublicKey'

export function SshSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  const ssh = settings.ssh || {
    privateKeyPath: '~/.ssh/id_ed25519',
    publicKeyPath: '~/.ssh/id_ed25519.pub',
    useSystemAgent: true,
  }

  // SWR hook to fetch public key content
  const { data: pubKeyContent, error: pubKeyError, mutate } = useSshPublicKey(ssh.publicKeyPath)

  // Copy pubkey state
  const [copiedKey, setCopiedKey] = useState(false)

  // Generator form state
  const [showGenerator, setShowGenerator] = useState(false)
  const [genComment, setGenComment] = useState('')
  const [genType, setGenType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [genBits, setGenBits] = useState<number>(3072)
  const [genPassphrase, setGenPassphrase] = useState('')
  const [genPath, setGenPath] = useState('~/.ssh/id_ed25519')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [generatedPubKey, setGeneratedPubKey] = useState<string | null>(null)

  // Update genPath when genType changes
  useEffect(() => {
    if (genType === 'ed25519') {
      setGenPath('~/.ssh/id_ed25519')
    } else {
      setGenPath('~/.ssh/id_rsa')
    }
  }, [genType])

  function updateSsh(partial: Partial<typeof ssh>) {
    updateSettings({ ssh: { ...ssh, ...partial } })
  }

  async function handlePickPrivateKey() {
    const selected = await open({
      multiple: false,
      directory: false,
      title: t('settings.ssh.pickPrivateTitle'),
    })
    if (selected && typeof selected === 'string') {
      const pubPath = selected.endsWith('.pub') ? selected : `${selected}.pub`
      const privPath = selected.endsWith('.pub') ? selected.slice(0, -4) : selected
      updateSsh({
        privateKeyPath: privPath,
        publicKeyPath: pubPath,
      })
      setTimeout(() => mutate(), 100)
    }
  }

  async function handlePickPublicKey() {
    const selected = await open({
      multiple: false,
      directory: false,
      title: t('settings.ssh.pickPublicTitle'),
      filters: [{ name: t('settings.ssh.pubFilterName'), extensions: ['pub'] }],
    })
    if (selected && typeof selected === 'string') {
      updateSsh({ publicKeyPath: selected })
      setTimeout(() => mutate(), 100)
    }
  }

  function handleCopyPubKey(content: string) {
    navigator.clipboard.writeText(content)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  async function handleGenerateKey() {
    setGenerating(true)
    setGenError(null)
    setGeneratedPubKey(null)

    try {
      const bits = genType === 'rsa' ? genBits : null
      const pubKey = await apiGenerateSshKey(
        genType,
        bits,
        genComment.trim() || 'git-manager-key',
        genPath.trim(),
        genPassphrase || undefined
      )

      setGeneratedPubKey(pubKey)

      // Update active settings to use new key
      const finalPubKeyPath = genPath.endsWith('.pub') ? genPath : `${genPath}.pub`
      const finalPrivKeyPath = genPath.endsWith('.pub') ? genPath.slice(0, -4) : genPath

      updateSsh({
        privateKeyPath: finalPrivKeyPath,
        publicKeyPath: finalPubKeyPath,
      })

      // Reload SWR
      mutate(pubKey, false)
    } catch (err: unknown) {
      setGenError((err instanceof Error ? err.message : '') || String(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Paths */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">
          {t('settings.ssh.pathsTitle')}
        </h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.ssh.privateKeyLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              value={ssh.privateKeyPath}
              onChange={(e) => updateSsh({ privateKeyPath: e.target.value })}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={handlePickPrivateKey}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('settings.ssh.browse')}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.ssh.publicKeyLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              value={ssh.publicKeyPath}
              onChange={(e) => updateSsh({ publicKeyPath: e.target.value })}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={handlePickPublicKey}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('settings.ssh.browse')}
            </Button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <Checkbox
            checked={ssh.useSystemAgent}
            onChange={(e) => updateSsh({ useSystemAgent: e.target.checked })}
          />
          <span className="text-xs text-foreground">{t('settings.ssh.useAgent')}</span>
        </label>
      </div>

      <Separator />

      {/* Public Key Display */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">
            {t('settings.ssh.pubContentTitle')}
          </h4>
          {pubKeyContent && (
            <Button
              size="sm"
              variant="ghost"
              className="hover:text-primary-hover h-7 gap-1.5 px-2 text-[11px] text-primary"
              onClick={() => handleCopyPubKey(pubKeyContent)}
            >
              {copiedKey ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  {t('settings.ssh.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  {t('settings.ssh.copy')}
                </>
              )}
            </Button>
          )}
        </div>

        {pubKeyContent ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="line-clamp-4 select-all break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
              {pubKeyContent}
            </p>
          </div>
        ) : pubKeyError ? (
          <div className="border-warning/30 bg-warning/5 flex items-center gap-2 rounded border p-3 text-xs text-muted-foreground">
            <AlertCircle className="text-warning h-4 w-4 shrink-0" />
            <span>{t('settings.ssh.loadError')}</span>
          </div>
        ) : (
          <div className="flex h-16 items-center justify-center rounded border border-dashed border-border bg-muted/5 text-xs text-muted-foreground">
            {t('settings.ssh.noPubKey')}
          </div>
        )}
      </div>

      <Separator />

      {/* Generator Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              {t('settings.ssh.generateTitle')}
            </h4>
            <p className="text-[10px] text-muted-foreground">{t('settings.ssh.generateDesc')}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowGenerator(!showGenerator)}
            data-testid="ssh-generator-toggle"
          >
            <Plus className="h-3.5 w-3.5" />
            {showGenerator ? t('settings.ssh.hideGenerator') : t('settings.ssh.openGenerator')}
          </Button>
        </div>

        {showGenerator && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">
                  {t('settings.ssh.keyType')}
                </label>
                <NativeSelect
                  value={genType}
                  onChange={(e) => setGenType(e.target.value as 'ed25519' | 'rsa')}
                  className="h-8 w-full rounded border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ed25519">{t('settings.ssh.ed25519Recommended')}</option>
                  <option value="rsa">RSA</option>
                </NativeSelect>
              </div>

              {genType === 'rsa' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    {t('settings.ssh.keyBits')}
                  </label>
                  <NativeSelect
                    value={genBits}
                    onChange={(e) => setGenBits(parseInt(e.target.value, 10))}
                    className="h-8 w-full rounded border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={2048}>2048 bits</option>
                    <option value={3072}>{t('settings.ssh.bitsSecure')}</option>
                    <option value={4096}>4096 bits</option>
                  </NativeSelect>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {t('settings.ssh.commentLabel')}
              </label>
              <Input
                placeholder="votre.email@domain.com"
                value={genComment}
                onChange={(e) => setGenComment(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {t('settings.ssh.passphraseLabel')}
              </label>
              <Input
                type="password"
                placeholder={t('settings.ssh.passphrasePlaceholder')}
                value={genPassphrase}
                onChange={(e) => setGenPassphrase(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {t('settings.ssh.destPath')}
              </label>
              <Input
                value={genPath}
                onChange={(e) => setGenPath(e.target.value)}
                className="h-8 font-mono text-xs"
                data-testid="ssh-generate-path-input"
              />
            </div>

            {genError && (
              <Alert className="items-center" icon={<AlertCircle className="h-4 w-4" />}>
                {t('settings.ssh.errorLabel')} : {genError}
              </Alert>
            )}

            {generatedPubKey ? (
              <div className="space-y-3 rounded-md border border-green-500/20 bg-green-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
                  <Check className="h-4 w-4" />
                  {t('settings.ssh.genSuccess')}
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {t('settings.ssh.genSuccessDesc')}
                </p>
                <div className="relative">
                  <Textarea
                    readOnly
                    value={generatedPubKey}
                    rows={3}
                    className="w-full resize-none border border-border bg-muted/20 font-mono text-[10px] leading-normal"
                    data-testid="ssh-generated-pubkey"
                  />
                  <Button
                    size="sm"
                    className="absolute bottom-2 right-2 h-7 gap-1 px-2 text-[10px]"
                    onClick={() => handleCopyPubKey(generatedPubKey)}
                  >
                    {copiedKey ? t('settings.ssh.copied') : t('settings.ssh.copy')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleGenerateKey}
                disabled={generating}
                className="h-8 w-full gap-2 text-xs"
                data-testid="ssh-generate-button"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {t('settings.ssh.generating')}
                  </>
                ) : (
                  <>
                    <Key className="h-3.5 w-3.5" />
                    {t('settings.ssh.generateButton')}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
