// Fake OpenAI-compatible LLM server, for the dev harness only. Echoes the start of the last user message so
// tests can see what context reached the model; DELAY_MS keeps requests in flight long enough to observe "busy".
import http from 'node:http'

const port = Number(process.env.PORT ?? 8787)
const delay = Number(process.env.DELAY_MS ?? 1500)

const server = http.createServer((req, res) => {
  const json = (body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'GET' && req.url?.endsWith('/models')) return json({ data: [{ id: 'fake' }] })
  if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      let user = ''
      let system = ''
      try {
        const msgs = JSON.parse(raw).messages ?? []
        system = String(msgs.find((m) => m.role === 'system')?.content ?? '')
        user = String([...msgs].reverse().find((m) => m.role === 'user')?.content ?? '')
      } catch {
        /* an unreadable body just echoes nothing */
      }
      console.log('SYSTEM: ' + system.slice(0, 200).replace(/\s+/g, ' '))
      const content = JSON.stringify({ text: 'MAGIC: ' + user.slice(0, 300) })
      setTimeout(() => json({ choices: [{ message: { content }, finish_reason: 'stop' }] }), delay)
    })
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(port, '127.0.0.1', () => console.log(`fake-llm on http://127.0.0.1:${port}/v1`))
