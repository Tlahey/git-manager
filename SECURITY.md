# Security Policy

`git-manager` is a 100% local desktop app: it talks to the local filesystem, the user's own git repositories, and — only when explicitly configured — a local Ollama instance or an OpenAI-compatible AI endpoint, plus the GitHub API for forge integration. It never phones home and has no telemetry.

That said, it does handle sensitive material: SSH keys, GitHub/GitLab/Bitbucket tokens, and AI provider API keys. By default these are stored in an AES-256-GCM encrypted local vault (`~/.git-manager/vault.enc`, owner-only permissions) rather than the OS keychain, to avoid repeated keychain prompts on unsigned builds; the OS keychain remains available as an alternate backend (see `credential_store/`). Vulnerabilities in this area — credential leakage, vault/keychain misuse, unsafe shell-out, path traversal, etc. — are taken seriously.

## Supported Versions

`git-manager` is pre-1.0 and released on a rolling basis. Only the latest published release is supported; please update before reporting an issue to confirm it still reproduces.

## Reporting a Vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/Tlahey/git-manager/security) of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue, including reproduction steps and impact.

You should expect an initial response within a few days. This is a solo-maintained project (see [CONTRIBUTING.md](CONTRIBUTING.md)), so please be patient — confirmed vulnerabilities will be fixed and disclosed as soon as reasonably possible.
