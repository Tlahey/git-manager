# GitHub OAuth Integration

This document describes the GitHub OAuth configuration required for git-manager's GitHub integration.

## Overview

git-manager uses the [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) (also known as Device Authorization Grant) to authenticate users. This flow is ideal for desktop applications because it doesn't require a redirect URI or embedded browser.

## How It Works

1. The app requests a **device code** from GitHub
2. The user is shown a **user code** and directed to [https://github.com/login/device](https://github.com/login/device)
3. The user enters the code and authorizes the application on GitHub's website
4. The app polls GitHub until authorization is complete, then receives an **access token**
5. The access token is used to fetch the user's profile and repositories

All GitHub API requests are proxied through the Tauri Rust backend (via `reqwest`) to bypass the WebView's Content Security Policy (CSP) restrictions.

## GitHub OAuth App Configuration

The OAuth App is configured with the Client ID defined in [`github.rs`](src-tauri/src/commands/github.rs).

### Creating a GitHub OAuth App

If you need to create or reconfigure the GitHub OAuth App:

1. Go to **GitHub → Settings → Developer settings → [OAuth Apps](https://github.com/settings/developers)**
2. Click **"New OAuth App"**
3. Fill in the required fields:

| Field                          | Value                                                                  |
| ------------------------------ | ---------------------------------------------------------------------- |
| **Application name**           | `git-manager` (or your preferred name)                                 |
| **Homepage URL**               | Your project homepage (e.g. `https://github.com/your-org/git-manager`) |
| **Authorization callback URL** | `http://localhost` (not used in Device Flow, but required)             |

4. Click **"Register application"**
5. Copy the **Client ID** and update it in `src-tauri/src/commands/github.rs`:
   ```rust
   const GITHUB_CLIENT_ID: &str = "your_client_id_here";
   ```

> **Important**: Do NOT generate or use a Client Secret. The Device Flow for public clients (desktop apps) only uses the Client ID.

### Enabling Device Flow

The Device Flow must be explicitly enabled on the OAuth App:

1. Go to your OAuth App settings page on GitHub
2. Scroll to **"Device Flow"** section
3. Check **"Enable Device Flow"**
4. Save changes

Without this setting, the device code request will fail with a `400` error.

## Required Token Scopes

The following OAuth scopes are requested during authentication:

| Scope        | Purpose                                                       |
| ------------ | ------------------------------------------------------------- |
| `repo`       | Full access to private and public repositories (read/write)   |
| `read:user`  | Read access to the user's profile information                 |
| `user:email` | Read access to the user's email addresses (including private) |

### Scope Details

- **`repo`**: Grants access to repository data including code, commits, branches, pull requests, issues, and more. This is required for git-manager to display and interact with repositories.
- **`read:user`**: Allows reading the user's GitHub profile (username, display name, avatar). Used to show the connected account in settings.
- **`user:email`**: Allows reading the user's email addresses, even if they are set to private. Used to associate commits with the correct email.

## Architecture

### Backend Commands (Rust)

All GitHub API interactions are handled by Tauri commands in [`src-tauri/src/commands/github.rs`](src-tauri/src/commands/github.rs):

| Command              | Description                                         |
| -------------------- | --------------------------------------------------- |
| `github_device_code` | Initiates the Device Flow, returns a user code      |
| `github_poll_token`  | Polls GitHub for an access token during Device Flow |
| `github_get_user`    | Fetches user profile and primary email              |
| `github_list_repos`  | Lists the authenticated user's repositories         |

### Frontend (TypeScript)

The frontend wrappers in [`src/lib/tauri.ts`](src/lib/tauri.ts) call these commands via Tauri's `invoke` mechanism:

```typescript
import { githubDeviceCode, githubPollToken, githubGetUser, githubListRepos } from './lib/tauri'

// Start Device Flow
const { device_code, user_code, verification_uri } = await githubDeviceCode(
  'repo read:user user:email'
)

// Poll for token (call repeatedly with interval)
const { access_token, error } = await githubPollToken(device_code)

// Fetch user profile
const user = await githubGetUser(access_token)

// List repositories
const repos = await githubListRepos(access_token)
```

## Token Storage

Access tokens are stored locally in the app settings via the Tauri `tauri-plugin-store`. Tokens are persisted across app restarts but are never sent to any server other than `api.github.com`.

## Troubleshooting

| Issue                                 | Cause                                              | Fix                                                           |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| "Failed to request device code"       | Client ID is invalid or Device Flow is not enabled | Verify Client ID and enable Device Flow in OAuth App settings |
| User code not appearing               | Network error or GitHub API is down                | Check internet connection, try again                          |
| Token polling returns `expired_token` | User did not authorize within 15 minutes           | Restart the login flow                                        |
| Repos not loading after login         | Token doesn't have `repo` scope                    | Re-authenticate to request the correct scopes                 |
