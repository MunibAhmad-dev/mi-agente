// routing_e2e.mjs — FASE 1: verifica el routing por tier con un agente REAL.
// 1) login, 2) PUT routing mode=auto (tiers qwen3:0.6b/1.7b/1.7b),
// 3) chat corto → tier small → qwen3:0.6b, 4) chat complejo → tier large → qwen3:1.7b,
// 5) lee las métricas persistidas y las compara con lo esperado.
// Ejecutar DENTRO del contenedor LibreChat:  node /tmp/routing_e2e.mjs
const BASE = 'http://localhost:3080';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
const AGENT = process.env.RT_AGENT || 'agent_W8Ew-fcVAe-dbI9jWrS3n';

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ email: 'f12@test.local', password: 'admin12345' }),
  });
  const json = await res.json();
  if (!json.token) throw new Error('login falló: ' + JSON.stringify(json));
  return json.token;
}

const headers = (token) => ({
  authorization: 'Bearer ' + token,
  'user-agent': UA,
  'content-type': 'application/json',
});

async function putRouting(token, tiers) {
  const res = await fetch(BASE + '/api/agents/routing/' + AGENT, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ mode: 'auto', tiers, resetMetrics: true }),
  });
  const json = await res.json();
  console.log('PUT routing →', JSON.stringify(json.routing).slice(0, 200));
  return json;
}

async function getRouting(token) {
  const res = await fetch(BASE + '/api/agents/routing/' + AGENT, { headers: headers(token) });
  return res.json();
}

async function sendChat(token, text, convoId) {
  const post = await fetch(BASE + '/api/agents/chat/', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      endpoint: 'agents',
      model: 'qwen3:1.7b',
      agent_id: AGENT,
      text,
      conversationId: convoId,
    }),
  });
  const postJson = await post.json();
  const streamId = postJson.streamId || postJson.stream_id;
  if (!streamId) {
    console.log('POST body:', JSON.stringify(postJson).slice(0, 300));
    throw new Error('no streamId en la respuesta del POST');
  }
  // Consumir el SSE hasta el final (finalEvent / cierre).
  const sse = await fetch(BASE + '/api/agents/chat/stream/' + streamId, { headers: headers(token) });
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let finished = false;
  let finalText = '';
  const start = Date.now();
  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.final || ev.finalEvent || ev.type === 'final') finished = true;
          if (ev.responseMessage?.text) finalText = ev.responseMessage.text;
          if (ev.text) finalText = ev.text;
        } catch {
          /* chunk parcial */
        }
      }
      if (Date.now() - start > 240000) {
        console.log('TIMEOUT consumiendo SSE (240s)');
        finished = true;
      }
    }
  }
  return { streamId, finalText: finalText.slice(0, 200) };
}

async function main() {
  const token = await login();
  console.log('login OK');

  await putRouting(token, { small: 'qwen3:0.6b', medium: 'qwen3:1.7b', large: 'qwen3:1.7b' });

  // Chat CORTO → esperado tier=small, model=qwen3:0.6b
  const short = await sendChat(token, 'hola', 'conv_short_' + Date.now());
  console.log('chat corto → streamId', short.streamId, '| respuesta:', short.finalText || '(vacía)');
  const m1 = await getRouting(token);
  console.log('métricas tras chat corto →', JSON.stringify(m1.routing.metrics));

  // Chat COMPLEJO → esperado tier=large, model=qwen3:1.7b
  const long = await sendChat(
    token,
    'refactoriza este codigo: analiza la funcion y propón una auditoria de arquitectura',
    'conv_long_' + Date.now(),
  );
  console.log('chat complejo → streamId', long.streamId, '| respuesta:', long.finalText || '(vacía)');
  const m2 = await getRouting(token);
  console.log('métricas tras chat complejo →', JSON.stringify(m2.routing.metrics));

  // Verificación
  const okShort = m1.routing.metrics.lastTier === 'small' && m1.routing.metrics.lastRoutedModel === 'qwen3:0.6b';
  const okLong = m2.routing.metrics.lastTier === 'large' && m2.routing.metrics.lastRoutedModel === 'qwen3:1.7b';
  const total = m2.routing.metrics.total;
  console.log('\nRESULTADO:');
  console.log('  corto  →', okShort ? 'PASS ✅' : `FALLO ❌ (${JSON.stringify(m1.routing.metrics)})`);
  console.log('  largo  →', okLong ? 'PASS ✅' : `FALLO ❌ (${JSON.stringify(m2.routing.metrics)})`);
  console.log('  total resoluciones =', total, total >= 2 ? '✅' : '❌');
  if (!(okShort && okLong && total >= 2)) process.exit(1);
  console.log('\n✅ ROUTING POR TIER VERIFICADO CON EJECUCIÓN REAL');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
