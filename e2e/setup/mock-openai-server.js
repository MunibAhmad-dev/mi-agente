/**
 * mock-openai-server.js — Mock LLM OpenAI-compatible (standalone, sin deps).
 * -----------------------------------------------------------------------
 * Sirve GET /v1/models y POST /v1/chat/completions (streaming y no) para
 * poder correr el stack (mi-opencode + bridge + LibreChat) sin API keys.
 *
 * Respuesta por defecto: "E2E mock reply: pong". Marcadores opcionales en el
 * último mensaje del usuario:
 *   E2E_REPLY:<texto>        → responde exactamente <texto>
 *   E2E_SLOW_REPLY:<ms>      → simula un proveedor lento (timeout del bridge)
 *   E2E_ERROR_REPLY:<msg>    → responde con un error del proveedor
 *
 * Uso: node setup/mock-openai-server.js [puerto]   (por defecto 9099)
 */

const http = require('http');

const PORT = Number(process.argv[2] || process.env.MOCK_LLM_PORT || 9099);
const DEFAULT_REPLY = process.env.MOCK_LLM_REPLY || 'E2E mock reply: pong';
const CHUNK_DELAY_MS = Number(process.env.MOCK_LLM_CHUNK_DELAY_MS) || 10;

function lastUserText(messages) {
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user');
  return last && typeof last.content === 'string' ? last.content : '';
}

function decideReply(messages) {
  const text = lastUserText(messages);
  const slow = text.match(/E2E_SLOW_REPLY:(\d+)/);
  if (slow) return { text: DEFAULT_REPLY, slowMs: Number(slow[1]) };
  const error = text.match(/E2E_ERROR_REPLY:(.+)$/);
  if (error) return { error: error[1].trim() };
  const reply = text.match(/E2E_REPLY:(.+)$/);
  return { text: reply ? reply[1].trim() : DEFAULT_REPLY };
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-agent', object: 'model', owned_by: 'mock' }] }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const body = await readBody(req);
    const { text, slowMs, error } = decideReply(body.messages);
    const id = 'chatcmpl-mock-' + Math.random().toString(36).slice(2);
    if (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: error, type: 'mock_error' } }));
      return;
    }
    if (slowMs) await new Promise((r) => setTimeout(r, slowMs));
    const model = body.model || 'mock-agent';
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const words = text.split(' ');
      let i = 0;
      const send = () => {
        if (i >= words.length) {
          res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: words[i] + (i < words.length - 1 ? ' ' : '') }, finish_reason: null }] })}\n\n`);
        i += 1;
        setTimeout(send, CHUNK_DELAY_MS);
      };
      send();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: text.split(' ').length, total_tokens: 20 },
      }),
    );
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-llm] escuchando en http://127.0.0.1:${PORT}`);
});
