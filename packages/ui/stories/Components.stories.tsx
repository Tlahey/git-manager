import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Button,
  Input,
  Textarea,
  Chip,
  Badge,
  NumberBadge,
  Tag,
  Separator,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
} from '../src'

// A live showcase of the shared @git-manager/ui components. Use the toolbar:
//  · Theme   — switch the design theme (Twilight to review the a11y work)
//  · Surface — repaint the canvas with any theme surface (background / card /
//              popover / sidebar-chrome), since a component may sit on more than
//              the default content background.
const meta = {
  title: 'Components/Overview',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        // Story-scaffolding label, not a component under test: keep it de-muted
        // (text-foreground) and 14px so it clears APCA and the a11y matrix reflects
        // real component contrast, not demo-chrome section headers.
        className="text-sm font-bold uppercase tracking-widest text-foreground"
        style={{ marginBottom: 10 }}
      >
        {title}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {children}
      </div>
    </section>
  )
}

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const Overview: Story = {
  render: () => (
    // <main> + heading so axe's page-structure rules pass — the demo inputs below
    // get aria-labels for the same reason. These are story-scaffolding fixes, not
    // component fixes: they keep the a11y panel focused on real component issues.
    <main className="p-6">
      <h1 className="sr-only">UI component showcase</h1>
      <Section title="Button — variants">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="success">Success</Button>
        <Button variant="link">Link</Button>
      </Section>

      <Section title="Button — sizes & icon">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
        <Button size="sm" className="gap-1.5">
          <SearchIcon /> With icon
        </Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Input & Textarea">
        <div style={{ width: 220 }}>
          <Input aria-label="Default input" placeholder="Default input" />
        </div>
        <div style={{ width: 220 }}>
          <Input variant="ghost" aria-label="Ghost input" placeholder="Ghost input" />
        </div>
        <div className="rounded-md bg-sidebar p-2" style={{ width: 236 }}>
          <Input
            variant="chrome"
            aria-label="Chrome input"
            placeholder="Chrome input (on dark nav)"
          />
        </div>
        <div style={{ width: 260 }}>
          <Input
            aria-label="Filter with icon slots"
            placeholder="Filter… (icon slots)"
            startIcon={<SearchIcon />}
            endIcon={
              // An action control (clear the field) — text-foreground, not muted, so it
              // clears APCA. Real-app guidance: clear/action icons shouldn't be muted.
              <button className="text-foreground" aria-label="Clear">
                ✕
              </button>
            }
          />
        </div>
        <div style={{ width: 260 }}>
          <Textarea aria-label="Commit message" placeholder="Write a commit message…" />
        </div>
      </Section>

      <Section title="Chip — toggle">
        <Chip active>Active</Chip>
        <Chip>Inactive</Chip>
        <Chip>Terminés</Chip>
      </Section>

      <Section title="Badge / NumberBadge">
        <Badge>default</Badge>
        <Badge variant="secondary">secondary</Badge>
        <Badge variant="success">success</Badge>
        <Badge variant="warning">warning</Badge>
        <Badge variant="destructive">destructive</Badge>
        <Badge variant="outline">outline</Badge>
        <span className="relative inline-flex">
          <span className="rounded bg-muted px-2 py-1 text-xs">Inbox</span>
          <NumberBadge count={7} className="absolute -right-2 -top-2" />
        </span>
      </Section>

      <Section title="Tag — file-change tones">
        <Tag tone="success">+12</Tag>
        <Tag tone="warning">~3</Tag>
        <Tag tone="danger">-5</Tag>
        <Tag tone="info">→2</Tag>
        <Tag tone="neutral">draft</Tag>
      </Section>

      <Section title="Overlays">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>A themed modal surface (uses --popover).</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Dropdown</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Rename</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Popover</Button>
          </PopoverTrigger>
          <PopoverContent>Popover content on the --popover surface.</PopoverContent>
        </Popover>

        <ContextMenu>
          <ContextMenuTrigger>
            <div className="rounded-md border border-border px-3 py-2 text-sm text-foreground">
              Right-click me
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>Actions</ContextMenuLabel>
            <ContextMenuItem>Copy</ContextMenuItem>
            <ContextMenuItem>Delete</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Section>

      <Section title="Tooltip & Select">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover / focus me</Button>
            </TooltipTrigger>
            <TooltipContent>An accessible tooltip (role=tooltip).</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div style={{ width: 200 }}>
          <Select>
            <SelectTrigger aria-label="Theme">
              <SelectValue placeholder="Pick a theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="twilight">Twilight</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="nord">Nord</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Feedback — Spinner, Toast, Separator">
        <Spinner className="h-5 w-5 text-primary" />
        <Button
          variant="outline"
          onClick={() => toast.success('Saved', { description: 'Your changes were saved.' })}
        >
          Toast success
        </Button>
        <Button variant="outline" onClick={() => toast.error('Push failed')}>
          Toast error
        </Button>
        <div className="w-40">
          {/* Demo-chrome captions for the Separator — de-muted so they don't add
              size-driven noise to the a11y matrix. */}
          <span className="text-xs text-foreground">above</span>
          <Separator className="my-2" />
          <span className="text-xs text-foreground">below</span>
        </div>
      </Section>
    </main>
  ),
}
