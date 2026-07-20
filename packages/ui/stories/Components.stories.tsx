import type { ReactNode } from 'react'
import { useState } from 'react'
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
  Checkbox,
  Switch,
  Label,
  RadioGroup,
  RadioGroupItem,
  NativeSelect,
  Skeleton,
  Alert,
  Kbd,
  Progress,
  Avatar,
  Card,
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

// Interactive showcase of the form controls so their checked/on states are visible
// in the canvas and exercised by addon-a11y. Controlled via local state, mirroring
// how the settings sections wire them to the settings store.
function FormControlsDemo() {
  const [checks, setChecks] = useState({ prune: true, lazy: false })
  const [notifications, setNotifications] = useState(true)
  const [sound, setSound] = useState(false)
  const [density, setDensity] = useState('comfortable')

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' }}>
      {/* Checkbox */}
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={checks.prune}
            onChange={(e) => setChecks((c) => ({ ...c, prune: e.target.checked }))}
          />
          <span className="text-xs text-foreground">Auto-prune on fetch</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={checks.lazy}
            onChange={(e) => setChecks((c) => ({ ...c, lazy: e.target.checked }))}
          />
          <span className="text-xs text-foreground">Lazy-load graph</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox indeterminate aria-label="Some selected" />
          <span className="text-xs text-foreground">Indeterminate</span>
        </label>
        <label className="flex cursor-not-allowed items-center gap-2 opacity-70">
          <Checkbox disabled aria-label="Disabled checkbox" />
          <span className="text-xs text-foreground">Disabled</span>
        </label>
      </div>

      {/* Switch — both an ON and an enabled OFF instance so the graphical-contrast
          gate grades the thumb over BOTH tracks (badge on, muted off). */}
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            aria-label="Enable notifications"
          />
          <span className="text-xs text-foreground">Notifications</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={sound}
            onChange={(e) => setSound(e.target.checked)}
            aria-label="Enable sound"
          />
          <span className="text-xs text-foreground">Sound (off)</span>
        </label>
        <label className="flex cursor-not-allowed items-center gap-2">
          <Switch disabled aria-label="Disabled switch" />
          <span className="text-xs text-foreground">Disabled</span>
        </label>
      </div>

      {/* Radio group + Label */}
      <div className="flex flex-col gap-2">
        <Label id="density-label">Density</Label>
        <RadioGroup
          value={density}
          onValueChange={setDensity}
          aria-labelledby="density-label"
          className="gap-1.5"
        >
          {['compact', 'comfortable', 'spacious'].map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-2">
              <RadioGroupItem value={d} aria-label={d} />
              <span className="text-xs capitalize text-foreground">{d}</span>
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}

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

      <Section title="Form controls — Checkbox / Switch / Radio / Label">
        <FormControlsDemo />
      </Section>

      <Section title="NativeSelect">
        <div style={{ width: 200 }}>
          <NativeSelect aria-label="Branch" defaultValue="main">
            <option value="main">main</option>
            <option value="develop">develop</option>
            <option value="feature">feature/ui</option>
          </NativeSelect>
        </div>
        <div style={{ width: 160 }}>
          <NativeSelect aria-label="Disabled select" disabled defaultValue="main">
            <option value="main">Disabled</option>
          </NativeSelect>
        </div>
      </Section>

      <Section title="Card — surface container">
        <Card className="w-64 p-4">
          <p className="mb-1 text-sm font-semibold text-foreground">Repository</p>
          <p className="text-xs text-muted-foreground">
            A themed surface panel — border, fill and text ride the card tokens.
          </p>
        </Card>
        <Card className="w-64 bg-card/30 p-4 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-foreground">Translucent</p>
          <p className="text-xs text-muted-foreground">bg-card/30 over the surface.</p>
        </Card>
      </Section>

      <Section title="Alert — message boxes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 320 }}>
          <Alert variant="destructive">Failed to push: remote rejected the update.</Alert>
          <Alert variant="success">Branch created and checked out.</Alert>
          <Alert variant="warning">This worktree has uncommitted changes.</Alert>
          <Alert variant="info">Fetch runs automatically every minute.</Alert>
        </div>
      </Section>

      <Section title="Avatar — image + initials fallback">
        {/* White initials sit on the caller's fallback background — the story uses the
            darker end of the branch palette where white clears contrast. */}
        <Avatar alt="Ada Lovelace" fallback="AL" size={32} style={{ backgroundColor: '#7c3aed' }} />
        <Avatar alt="Grace Hopper" fallback="GH" size={32} style={{ backgroundColor: '#2563eb' }} />
        <Avatar alt="Alan Turing" fallback="AT" size={32} style={{ backgroundColor: '#15803d' }} />
        <Avatar
          alt="Square avatar"
          fallback="SQ"
          size={32}
          square
          style={{ backgroundColor: '#be185d' }}
        />
      </Section>

      <Section title="Kbd — shortcut keys">
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⇧</Kbd>
          <Kbd>⌘</Kbd>
          <Kbd>P</Kbd>
        </span>
        <Kbd>Esc</Kbd>
      </Section>

      <Section title="Progress">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240 }}>
          <Progress value={25} aria-label="Download progress 25%" />
          <Progress value={60} aria-label="Download progress 60%" />
          <Progress
            value={100}
            aria-label="Complete"
            indicatorClassName="bg-success"
          />
        </div>
      </Section>

      <Section title="Skeleton — loading placeholders">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
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
