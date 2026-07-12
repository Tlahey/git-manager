import { useState, useEffect } from 'react'
import { Button, Input, Separator, Textarea } from '@git-manager/ui'
import { Key, FolderOpen, Copy, Check, Plus, AlertCircle, RefreshCw } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { open } from '@tauri-apps/plugin-dialog'
import { apiGenerateSshKey } from '../../../api/ssh.api'
import { useSshPublicKey } from '../../../hooks/useSshPublicKey'

export function SshSection() {
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
      title: 'Sélectionner la clé privée SSH',
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
      title: 'Sélectionner la clé publique SSH (.pub)',
      filters: [{ name: 'Clé Publique', extensions: ['pub'] }],
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
        <h4 className="text-xs font-semibold text-foreground">Configuration des chemins</h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Clé privée SSH</label>
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
              Parcourir
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Clé publique SSH</label>
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
              Parcourir
            </Button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={ssh.useSystemAgent}
            onChange={(e) => updateSsh({ useSystemAgent: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">
            Utiliser l&apos;agent SSH système (recommandé)
          </span>
        </label>
      </div>

      <Separator />

      {/* Public Key Display */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">Contenu de la clé publique</h4>
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
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copier
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
            <span>Impossible de charger la clé publique. Vérifiez le chemin.</span>
          </div>
        ) : (
          <div className="flex h-16 items-center justify-center rounded border border-dashed border-border bg-muted/5 text-xs text-muted-foreground">
            Aucune clé publique SSH chargée
          </div>
        )}
      </div>

      <Separator />

      {/* Generator Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-foreground">Générer une nouvelle clé SSH</h4>
            <p className="text-[10px] text-muted-foreground">
              Générez un nouveau couple de clés privée / publique directement dans votre dossier
              SSH.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setShowGenerator(!showGenerator)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showGenerator ? 'Masquer' : 'Ouvrir le générateur'}
          </Button>
        </div>

        {showGenerator && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/5 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Type de clé</label>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value as 'ed25519' | 'rsa')}
                  className="h-8 w-full rounded border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ed25519">ED25519 (Recommandé)</option>
                  <option value="rsa">RSA</option>
                </select>
              </div>

              {genType === 'rsa' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Taille en bits</label>
                  <select
                    value={genBits}
                    onChange={(e) => setGenBits(parseInt(e.target.value, 10))}
                    className="h-8 w-full rounded border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={2048}>2048 bits</option>
                    <option value={3072}>3072 bits (Sécurisé)</option>
                    <option value={4096}>4096 bits</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                Commentaire (ex: e-mail)
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
                Mot de passe (optionnel)
              </label>
              <Input
                type="password"
                placeholder="Laisser vide pour pas de mot de passe"
                value={genPassphrase}
                onChange={(e) => setGenPassphrase(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                Chemin de destination
              </label>
              <Input
                value={genPath}
                onChange={(e) => setGenPath(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>

            {genError && (
              <div className="flex items-center gap-2 rounded border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Erreur : {genError}</span>
              </div>
            )}

            {generatedPubKey ? (
              <div className="space-y-3 rounded-md border border-green-500/20 bg-green-500/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-green-500">
                  <Check className="h-4 w-4" />
                  Clé générée avec succès !
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Ajoutez cette clé publique SSH à vos fournisseurs d&apos;intégration (GitHub,
                  GitLab, etc.).
                </p>
                <div className="relative">
                  <Textarea
                    readOnly
                    value={generatedPubKey}
                    rows={3}
                    className="w-full resize-none border border-border bg-muted/20 font-mono text-[10px] leading-normal"
                  />
                  <Button
                    size="sm"
                    className="absolute bottom-2 right-2 h-7 gap-1 px-2 text-[10px]"
                    onClick={() => handleCopyPubKey(generatedPubKey)}
                  >
                    {copiedKey ? 'Copié !' : 'Copier'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleGenerateKey}
                disabled={generating}
                className="h-8 w-full gap-2 text-xs"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Key className="h-3.5 w-3.5" />
                    Générer le couple de clés
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
