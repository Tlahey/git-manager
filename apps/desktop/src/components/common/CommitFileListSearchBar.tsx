import { useTranslation } from '@git-manager/i18n'
import { Input } from '@git-manager/ui'
import { Search, X } from 'lucide-react'

interface CommitFileListSearchBarProps {
  value: string
  onChange: (value: string) => void
}

/** The filter/search input above a {@link CommitFileList}'s file tree or list. */
export function CommitFileListSearchBar({ value, onChange }: CommitFileListSearchBarProps) {
  const { t } = useTranslation('git')

  return (
    <div className="relative">
      <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        type="text"
        placeholder={t('commitDetails.searchFiles') || 'Filter files...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8 font-mono text-xs"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute top-2.5 right-2.5 cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
