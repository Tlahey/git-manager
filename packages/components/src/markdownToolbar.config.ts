import {
  Asterisk,
  AtSign,
  Bold,
  ChevronsUpDown,
  Code,
  EyeOff,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Image,
  Info,
  Italic,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Minus,
  OctagonAlert,
  Quote,
  Sigma,
  Slash,
  Smile,
  SquareCode,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TriangleAlert,
  Underline,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MarkdownCommandId } from './markdownCommands'

/**
 * What the markdown toolbar shows, and in which order — kept beside the component rather than
 * inlined in it, per the repo's rule for lookup tables keyed by a fixed set of values.
 *
 * The split between the bar and the two menus is a frequency judgement, not a technical one: the
 * bar holds what gets used while writing a description, the `…` panel holds the rest of GitHub's
 * syntax so that "it isn't there" is never the answer. Alerts get their own trigger because they
 * are five variants of one action, and a five-item bar group would drown the rest.
 */
export interface MarkdownToolbarItem {
  command: MarkdownCommandId
  icon: LucideIcon
  /** Rendered after the label in the tooltip. macOS glyphs — this app ships nowhere else. */
  shortcut?: string
}

/** Every user-facing string the toolbar needs. Passed in rather than translated here: this package
 * is domain- and i18n-agnostic, so the app resolves the keys and hands the result over. */
export interface MarkdownToolbarLabels {
  commands: Record<MarkdownCommandId, string>
  headings: string
  alerts: string
  more: string
  sections: Record<MarkdownOverflowSectionKey, string>
}

export type MarkdownOverflowSectionKey = 'text' | 'blocks' | 'inserts'

/** The bar itself, one array per separated group. */
export const MARKDOWN_TOOLBAR_GROUPS: MarkdownToolbarItem[][] = [
  [
    { command: 'bold', icon: Bold, shortcut: '⌘B' },
    { command: 'italic', icon: Italic, shortcut: '⌘I' },
    { command: 'strikethrough', icon: Strikethrough, shortcut: '⌘⇧X' },
  ],
  [
    { command: 'quote', icon: Quote, shortcut: '⌘⇧.' },
    { command: 'code', icon: Code, shortcut: '⌘E' },
    { command: 'codeBlock', icon: SquareCode, shortcut: '⌘⇧E' },
  ],
  [
    { command: 'link', icon: Link, shortcut: '⌘K' },
    { command: 'image', icon: Image },
    { command: 'mention', icon: AtSign },
  ],
  [
    { command: 'bulletList', icon: List, shortcut: '⌘⇧8' },
    { command: 'numberedList', icon: ListOrdered, shortcut: '⌘⇧7' },
    { command: 'taskList', icon: ListChecks, shortcut: '⌘⇧L' },
  ],
]

export const MARKDOWN_HEADING_ITEMS: MarkdownToolbarItem[] = [
  { command: 'heading1', icon: Heading1 },
  { command: 'heading2', icon: Heading2 },
  { command: 'heading3', icon: Heading3 },
  { command: 'heading4', icon: Heading4 },
  { command: 'heading5', icon: Heading5 },
  { command: 'heading6', icon: Heading6 },
]

export const MARKDOWN_ALERT_ITEMS: MarkdownToolbarItem[] = [
  { command: 'alertNote', icon: Info },
  { command: 'alertTip', icon: Lightbulb },
  { command: 'alertImportant', icon: MessageSquareWarning },
  { command: 'alertWarning', icon: TriangleAlert },
  { command: 'alertCaution', icon: OctagonAlert },
]

/** The `…` panel: three short columns rather than one long list, so it fits in the narrow side
 * panels these editors live in instead of running off the bottom of the screen. */
export const MARKDOWN_OVERFLOW_SECTIONS: {
  key: MarkdownOverflowSectionKey
  items: MarkdownToolbarItem[]
}[] = [
  {
    key: 'text',
    items: [
      { command: 'underline', icon: Underline },
      { command: 'subscript', icon: Subscript },
      { command: 'superscript', icon: Superscript },
      { command: 'escape', icon: Slash },
    ],
  },
  {
    key: 'blocks',
    items: [
      { command: 'table', icon: Table },
      { command: 'horizontalRule', icon: Minus },
      { command: 'details', icon: ChevronsUpDown },
      { command: 'footnote', icon: Asterisk },
    ],
  },
  {
    key: 'inserts',
    items: [
      { command: 'issueReference', icon: Hash },
      { command: 'emoji', icon: Smile },
      { command: 'mermaid', icon: Workflow },
      { command: 'math', icon: Sigma },
      { command: 'hiddenComment', icon: EyeOff },
    ],
  },
]
