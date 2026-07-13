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

export interface FakeAiServerOptions {
  /** Tokens streamed back as separate SSE chunks, in order. */
  tokens?: string[]
  /** Accepts the request and records its body, but never sends a real token or `[DONE]` — instead
   * writes a periodic SSE comment line (`: keep-alive`) so the connection keeps producing bytes
   * without ever completing. Real backends do something similar, and it matters here because the
   * Rust side's cancellation check only runs *between* stream chunks
   * (`ai_openai_compatible.rs`'s `while let Some(chunk) = stream.next().await`) — a connection
   * that truly never wrote anything would leave that await stuck forever with the cancel flag
   * never observed, so clicking Stop wouldn't do anything, no matter how the frontend behaves. */
  stall?: boolean
}

/** A minimal OpenAI-compatible server (`/v1/chat/completions` streaming SSE + `/v1/models`) for
 * driving the real `generate_commit_message`/`check_ai_status` Rust commands end to end — the
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
      res.end(JSON.stringify({ data: [{ id: 'fake-model' }] }))
      return
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8')
      })
      req.on('end', () => {
        try {
          state.lastRequestBody = JSON.parse(body)
        } catch {
          state.lastRequestBody = body
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        if (options.stall) {
          const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n')
          }, 200)
          res.on('close', () => clearInterval(keepAlive))
          return
        }

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

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
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
