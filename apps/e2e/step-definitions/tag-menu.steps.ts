import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

// Right-clicking a tag badge must open the tag menu, not the row's commit menu. The routing works by
// the badge carrying a `data-ref-tag` marker that `GraphRow.handleContextMenu` resolves to the tag
// ref (the detection lives on the row because WKWebView doesn't deliver events to the draggable
// badge itself). The routing logic is covered by unit tests; this guards, on the real compiled
// WebKit build, the two things unit tests can't: that the marker is actually emitted and that it
// sits inside the correct commit's row. The menu itself is a modal native macOS menu — not
// inspectable, and it blocks the JS loop — so we deliberately don't trigger it here.
Then(/^the tag "([^"]*)" badge carries the context-menu marker on its commit row$/, async (tag: string) => {
  const repoPath = await browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
  expect(repoPath).toBeTruthy()
  const oid = execFileSync('git', ['-C', repoPath as string, 'rev-parse', `${tag}^{commit}`], {
    encoding: 'utf8',
  }).trim()

  const row = $(`[data-testid="graph-row-${oid}"]`)
  await row.waitForDisplayed({ timeout: 15000 })

  // The badge is scoped inside its own commit row, and carries `data-ref-tag="<tag>"`.
  const badge = row.$(`[data-testid="ref-label-tag-${tag}"]`)
  await badge.waitForDisplayed({ timeout: 10000 })
  await expect(badge).toHaveAttribute('data-ref-tag', tag)
})
