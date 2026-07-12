import { CheckCircle2, AlertCircle, FileText, ExternalLink } from 'lucide-react'
import type { MockIssue } from '../types'
import { AvatarStack } from './AvatarStack'
import { openUrl, timeAgo } from '../utils'

interface IssueRowProps {
  issue: MockIssue
}

export function IssueRow({ issue }: IssueRowProps) {
  return (
    <div
      className="group/issue flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-0 hover:bg-accent/30"
      onClick={() => openUrl(issue.url)}
    >
      <div className="shrink-0">
        {issue.status === 'closed' ? (
          <CheckCircle2 className="h-4 w-4 text-purple-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-green-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-foreground transition-colors group-hover/issue:text-primary">
            {issue.title}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
            #{issue.number}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {issue.labels.map((l) => (
            <span
              key={l}
              className="rounded border border-border/50 bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
            >
              {l}
            </span>
          ))}
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50">
            <FileText className="h-2.5 w-2.5" />
            {issue.comments}
          </span>
        </div>
      </div>
      <div className="min-w-[52px] shrink-0 text-right text-[10px] text-muted-foreground">
        {timeAgo(issue.updatedAt)}
      </div>
      <div className="flex w-[70px] shrink-0 justify-center">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            issue.status === 'open'
              ? 'border-green-500/30 bg-green-500/15 text-green-400'
              : 'border-purple-500/30 bg-purple-500/15 text-purple-400'
          }`}
        >
          {issue.status}
        </span>
      </div>
      <div className="flex w-[90px] shrink-0 items-center gap-1.5">
        <img
          src={issue.authorAvatar}
          alt={issue.author}
          className="rounded-full border border-border bg-muted object-cover"
          style={{ width: 18, height: 18 }}
        />
        <span className="truncate text-[10px] text-muted-foreground">{issue.author}</span>
      </div>
      <div className="flex w-[60px] shrink-0 justify-center">
        {issue.assignees.length > 0 ? (
          <AvatarStack users={issue.assignees} max={3} />
        ) : (
          <span className="text-[10px] text-muted-foreground/30">—</span>
        )}
      </div>
      <div className="w-[110px] shrink-0">
        <span className="block truncate font-mono text-[10px] text-muted-foreground/70">
          {issue.repo}
        </span>
      </div>
      <div className="flex w-6 shrink-0 justify-center">
        <ExternalLink className="h-3 w-3 text-muted-foreground/40 transition-colors group-hover/issue:text-muted-foreground" />
      </div>
    </div>
  )
}
