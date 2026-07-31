import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing-library's automatic between-test cleanup only kicks in when vitest runs with
// `globals: true` (it looks for a global `afterEach`), which this config doesn't use — without
// this explicit hook, every `render()` accumulates into the same jsdom document across tests.
afterEach(() => cleanup())
