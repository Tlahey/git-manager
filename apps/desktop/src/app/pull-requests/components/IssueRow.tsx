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
      className="group/issue flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/30 last:border-0"
      onClick={() => openUrl(issue.url)}
    >
      <div className="shrink-0">
        {issue.status === 'closed' ? (
          <CheckCircle2 className="h-4 w-4 text-purple-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-green-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground group-hover/issue:text-primary transition-colors truncate">
            {issue.title}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
            #{issue.number}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {issue.labels.map((l) => (
            <span
              key={l}
              className="text-[9px] bg-muted/60 text-muted-foreground border border-border/50 rounded px-1 py-px"
            >
              {l}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
            <FileText className="h-2.5 w-2.5" />
            {issue.comments}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-[10px] text-muted-foreground min-w-[52px] text-right">
        {timeAgo(issue.updatedAt)}
      </div>
      <div className="shrink-0 w-[70px] flex justify-center">
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            issue.status === 'open'
              ? 'bg-green-500/15 text-green-400 border-green-500/30'
              : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
          }`}
        >
          {issue.status}
        </span>
      </div>
      <div className="shrink-0 flex items-center gap-1.5 w-[90px]">
        <img
          src={issue.authorAvatar}
          alt={issue.author}
          className="rounded-full bg-muted border border-border object-cover"
          style={{ width: 18, height: 18 }}
        />
        <span className="text-[10px] text-muted-foreground truncate">{issue.author}</span>
      </div>
      <div className="shrink-0 w-[60px] flex justify-center">
        {issue.assignees.length > 0 ? (
          <AvatarStack users={issue.assignees} max={3} />
        ) : (
          <span className="text-muted-foreground/30 text-[10px]">—</span>
        )}
      </div>
      <div className="shrink-0 w-[110px]">
        <span className="text-[10px] font-mono text-muted-foreground/70 truncate block">
          {issue.repo}
        </span>
      </div>
      <div className="shrink-0 w-6 flex justify-center">
        <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover/issue:text-muted-foreground transition-colors" />
      </div>
    </div>
  )
}
