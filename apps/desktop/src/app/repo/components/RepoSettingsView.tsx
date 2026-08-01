import { SettingsPage } from '../../settings/SettingsPage'

/**
 * The repo tab's Settings view: the one and only Settings page, embedded instead of taking over the
 * window. It opens on the Repository scope — this view is reached from a repository, so its own
 * configuration is what the user came for — while the Global group stays one click away in the same
 * side nav.
 */
export function RepoSettingsView() {
  return (
    <div
      id="repo-view-panel-settings"
      role="tabpanel"
      aria-labelledby="repo-view-tab-settings"
      data-testid="repo-settings-view"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <SettingsPage embedded initialScope="local" />
    </div>
  )
}
