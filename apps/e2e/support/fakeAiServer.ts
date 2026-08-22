import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeAiServerHandle {
  url: string
  /** The most recent request body POSTed to `/v1/chat/completions`, parsed from JSON — lets a
   * scenario assert on the actual prompt sent (system prompt, repo context, detected scope),
   * not just that the UI streamed something back. */
  readonly lastRequestBody: unknown
  stop: () => Promise<void>
}

/**
 * Fixed port for the suite-wide fake AI server started once in `wdio.conf.ts`'s `onPrepare` (see
 * `SUITE_WIDE_FAKE_AI_URL` below) so the default AI settings seeded by every scenario's `Before`
 * hook (`hooks.steps.ts`) point at something that actually answers `GET /v1/models` — otherwise
 * every scenario would need its own "AI features are turned off" step just to silence the
 * "AI provider is unreachable" banner the app's own real factory default (`ai.enabled: true`,
 * pointed at a local Ollama) would otherwise raise in a sandbox with no Ollama running. Workers
 * run in separate OS processes from the `onPrepare` hook that starts this, so they can't share a
 * live handle — only a well-known port number, hence the fixed value rather than an OS-assigned
 * one.
 */
export const SUITE_WIDE_FAKE_AI_PORT = 8934
export const SUITE_WIDE_FAKE_AI_URL = `http://127.0.0.1:${SUITE_WIDE_FAKE_AI_PORT}`

export interface FakeAiServerOptions {
  /** Binds to this exact port instead of an OS-assigned one. Only the suite-wide server
   * (`wdio.conf.ts`'s `onPrepare`) needs this — every per-scenario fake server still gets a fresh
   * ephemeral port so scenarios never contend over one. */
  port?: number
  /** Tokens streamed back as separate SSE chunks, in order. */
  tokens?: string[]
  /** Message used for the single group returned by the non-streaming (grouping) completion path.
   * Defaults to a Conventional-Commits-shaped string. */
  groupingMessage?: string
  /** Structured response returned for the daily-summary completion path (matched by its
   * `json_schema.name === 'daily_summary'`). Defaults to a deterministic briefing so scenarios can
   * assert on exact headline/bullets. */
  dailySummary?: { headline: string; highlights: string[] }
  /** Plain-text message returned for the commit-recompose completion path. Unlike every other
   * completion feature, `commitRecomposeFeature` (`packages/ai/src/features/commitRecompose.ts`)
   * sets no `schema` — its answer is the raw replacement commit message, not a JSON envelope — so
   * this is matched by the *absence* of a `response_format.json_schema.name` on a `stream: false`
   * request, rather than by a schema name like the branches above. */
  recomposedMessage?: string
  /** Accepts any request — streaming or one-shot completion alike — and records its body, but never
   * sends a real answer: instead writes a periodic SSE comment line (`: keep-alive`) so the
   * connection keeps producing bytes without ever completing. Real backends do something similar,
   * and it matters here because the Rust side's cancellation check only runs *between* stream chunks
   * (`ai_openai_compatible.rs`'s `while let Some(chunk) = stream.next().await`) — a connection
   * that truly never wrote anything would leave that await stuck forever with the cancel flag
   * never observed, so clicking Stop wouldn't do anything, no matter how the frontend behaves.
   * Applies before the `stream: false` dispatch below on purpose: the two-phase features (commit
   * message, commit plan, daily summary) never make a streaming call at all, so a stall limited to
   * `stream !== false` could never make those flows visibly "stuck". */
  stall?: boolean
}

/** A minimal OpenAI-compatible server (`/v1/chat/completions` streaming SSE + `/v1/models`) for
 * driving the real `ai_generate_stream`/`check_ai_status` Rust commands end to end — the
 * app's own Settings just needs `url` pointed here, exactly like a user pointing Ollama's preset
 * at a different OpenAI-compatible host. No mocking of the IPC layer involved (see
 * command-mocking.feature's own note on why that wouldn't reach a real UI click anyway). */
export async function startFakeAiServer(
  options: FakeAiServerOptions = {}
): Promise<FakeAiServerHandle> {
  const state: { lastRequestBody: unknown } = { lastRequestBody: undefined }
  const tokens = options.tokens ?? ['feat: ', 'add ', 'fake', ' thing']

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      // `max_model_len` is non-standard (omlx's own extension — see `ai_model_info.rs`'s
      // `served_max_model_len`), but it's the only context-window signal a non-Ollama provider can
      // give: `/api/show`/`/api/ps` 404 against this server, same as any real OpenAI-compatible one.
      res.end(JSON.stringify({ data: [{ id: 'fake-model', max_model_len: 128000 }] }))
      return
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8')
      })
      req.on('end', () => {
        let parsed:
          | {
              stream?: boolean
              messages?: { role: string; content: string }[]
              response_format?: { json_schema?: { name?: string } }
            }
          | undefined
        try {
          parsed = JSON.parse(body)
          state.lastRequestBody = parsed
        } catch {
          state.lastRequestBody = body
        }

        // A stalled server accepts any request and records its body, but never answers — regardless
        // of whether this particular call streams or not. This has to be checked before the
        // `stream === false` dispatch below: every two-phase feature (commit message, commit plan,
        // daily summary) composes from completion calls exclusively, so a stall that only worked for
        // `stream !== false` could never make that flow visibly "stuck" for a Cancel button to
        // interrupt — it would keep answering its one-shot completion calls instantly no matter how
        // long the request stayed open for a streaming caller.
        if (options.stall) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n')
          }, 200)
          res.on('close', () => clearInterval(keepAlive))
          return
        }

        // Non-streaming completion (`stream: false` with a JSON schema). Three features use this
        // path; they're told apart by their schema name so each gets a response its parser accepts.
        if (parsed?.stream === false) {
          const schemaName = parsed.response_format?.json_schema?.name

          // Daily-summary feature: return the `{ headline, highlights }` shape.
          if (schemaName === 'daily_summary') {
            const summary = options.dailySummary ?? {
              headline: 'Shipped the fake feature',
              highlights: ['did the fake work'],
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({ choices: [{ message: { content: JSON.stringify(summary) } }] })
            )
            return
          }

          // Summary-search feature: echoes back the first real candidate's repo/date from the
          // prompt (rendered as "## <repo> — <date>" blocks by `renderCandidates`) rather than a
          // fixed fake pair, so the answer cites a real archived day instead of one that could
          // never appear in the shortlist it was supposedly read from.
          if (schemaName === 'summary_search') {
            const userMessage = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
            const candidate = /^## (\S+) — (\d{4}-\d{2}-\d{2})/m.exec(userMessage)
            const matches = candidate
              ? [{ repo: candidate[1], date: candidate[2], reason: 'Mentions the fake feature.' }]
              : []
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({ answer: 'It shipped the fake feature.', matches }),
                    },
                  },
                ],
              })
            )
            return
          }

          // Commit-message feature (the compose phase of `composeCommitMessageFromSummaries`):
          // the `{ subject, body }` shape `parseCommitMessage`/`formatCommitMessage` expect.
          if (schemaName === 'commit_message') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({ subject: 'feat: add fake thing', body: '' }),
                    },
                  },
                ],
              })
            )
            return
          }

          // File-summary feature (the map phase every two-phase feature runs first): two short
          // fields. Deterministic, since the scenarios assert on the composing call's output.
          if (schemaName === 'file_summary') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({ intent: 'change the file', area: 'fake area' }),
                    },
                  },
                ],
              })
            )
            return
          }

          // Commit-search relevance verdict: one call per file of every scanned commit
          // (scanCommits.ts's judgeFileByFile), all sharing this one schema. Keyed on whether the
          // file being judged is "login.txt" — the file `feature-branches.sh`'s "feat: add login
          // screen" commit touches — rather than answering `relevant: true` unconditionally, so a
          // scenario asking a login-shaped question gets a real, selective match instead of every
          // commit in the window "matching".
          if (schemaName === 'commit_relevance') {
            const userMessage = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
            const relevant = userMessage.includes('login.txt')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        subject: 'login',
                        evidence: relevant ? 'login.txt' : '',
                        relevant,
                        finding: relevant ? 'Added the login screen.' : '',
                        files: relevant ? ['login.txt'] : [],
                      }),
                    },
                  },
                ],
              })
            )
            return
          }

          // Upgrade-risk feature: echoes the package name and the first file `buildUsage`
          // (packages/ai's upgradeRisk.ts) listed under "Files importing it:" back as the one
          // affected location, rather than a fixed fake path — so the answer only ever names a
          // file the scan actually found, which is what `verifyUpgradeRiskPaths` keeps.
          if (schemaName === 'upgrade_risk') {
            const userMessage = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
            const packageName = /^Package: (.+)$/m.exec(userMessage)?.[1] ?? 'the dependency'
            const filesBlock = /Files importing it:\n((?:- .+\n?)+)/.exec(userMessage)
            const files = filesBlock
              ? [...filesBlock[1].matchAll(/^- (.+)$/gm)].map((m) => m[1])
              : []
            const where = files.slice(0, 1)
            const result = {
              changes: [
                {
                  change: `${packageName}'s default export signature changed.`,
                  affectsUs: where.length > 0,
                  where,
                  note:
                    where.length > 0 ? 'This repository imports the default export directly.' : '',
                },
              ],
              risk: where.length > 0 ? 'medium' : 'low',
              summary: `Review ${packageName}'s default export before upgrading.`,
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
            return
          }

          // Commit-recompose feature: the only completion feature with no `schema` (see the option's
          // own doc comment) — its answer is the raw replacement message text, not a JSON envelope,
          // so it is matched by the absence of a schema name rather than by one.
          if (schemaName == null) {
            const message = options.recomposedMessage ?? 'refactor: streamline the fake commit'
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ choices: [{ message: { content: message } }] }))
            return
          }

          // File-grouping feature: echo the exact file paths listed in the user prompt back as a
          // single commit, in the schema shape `{ commits: [...] }`, so the response is valid
          // regardless of which fixture's changes were snapshotted.
          const userMessage = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
          const files = [...userMessage.matchAll(/^- (.+?) \(/gm)].map((m) => m[1])
          const commitMessage = options.groupingMessage ?? 'feat: grouped changes'
          const content = JSON.stringify({ commits: [{ commitMessage, files }] })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { content } }] }))
          return
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        for (const token of tokens) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    get lastRequestBody() {
      return state.lastRequestBody
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        // A failed/aborted scenario could leave a stalled connection still open — force-closing
        // every socket first guarantees this never hangs waiting for one to end on its own.
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
