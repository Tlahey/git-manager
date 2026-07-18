import { beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/react-vite'
// The preview's decorators (theme + surface) so composed stories render exactly like
// the Storybook canvas — this is what makes composeStory() apply our globals.
import * as previewAnnotations from './preview'

// Used ONLY by vitest.apca.config.ts (the theme × surface APCA matrix), where
// composeStory() genuinely needs the project annotations. Do NOT add it back to the
// `storybook` project in vitest.config.ts: since Storybook 10.3 the storybookTest
// plugin applies the full annotation set (preview + addons) itself, and a manual
// setProjectAnnotations call REPLACES that set — it silently dropped addon-a11y's
// afterEach, so the a11y checks never actually ran there.
const project = setProjectAnnotations([previewAnnotations])

// beforeAll may be undefined depending on the Storybook version; guard it.
if (project.beforeAll) beforeAll(project.beforeAll)
