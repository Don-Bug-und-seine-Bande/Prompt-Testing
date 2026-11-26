const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const os = require('node:os');
const { readPrompt } = require('../lib/prompt');
const { OpenAI } = require('openai');
const { createApp } = require('../server');
const { validateRequest } = require('../lib/chat');

async function serve(t, options = {}) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    get: route => fetch(url + route),
    post: (body, headers = {}) => fetch(url + '/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }),
  };
}

test('sirve el HTML real y publica únicamente datos y recursos autorizados', async t => {
  const api = await serve(t, { config: { apiKey: '' } });
  const html = await api.get('/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /\/app.js/);
  for (const resource of ['/app.js', '/app.css', '/tienda_galeria_nube.html']) assert.equal((await api.get(resource)).status, 200);
  const lab = await (await api.get('/api/lab')).json();
  const brief = fs.readFileSync(path.join(__dirname, '..', 'consigna_tienda_cuadros.md'), 'utf8');
  const catalogRows = brief.split(/\r?\n/).filter(line => /^\|/.test(line)).slice(2).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    cells[4] = Number(cells[4]);
    return cells;
  });
  assert.deepEqual(lab.products.map(p => p.map(value => typeof value === 'string' ? value.replace(' · ', ', ') : value)), catalogRows);
  assert.deepEqual(lab.policy, []);
  assert.equal(lab.tests.length, 10);
  assert.equal(lab.products.find(p => p[0] === 'Ventana a Kioto')[4], 0);
  for (const resource of ['/.env', '/server.js', '/package.json', '/data/lab.json']) assert.equal((await api.get(resource)).status, 404);
  const health = await (await api.get('/api/health')).json();
  assert.equal(health.configured, false);
  assert.equal(health.apiKey, undefined);
  assert.equal((await api.get('/api/prompt')).status, 200);
  assert.equal((await api.get('/api/prompts/v2')).status, 404);
});

test('valida entrada, ausencia de clave, JSON malformado y orígenes externos', async t => {
  const api = await serve(t, { config: { apiKey: '' } });
  for (const body of [null, [], {}, { message: ' ' }, { message: {} }]) assert.equal((await api.post(body)).status, 400);
  assert.equal((await api.post({ prompt: 'rol', message: 'hola' })).status, 503);
  assert.equal((await api.post({ prompt: 'rol', message: 'hola' }, { Origin: 'https://externo.example' })).status, 403);
  assert.equal((await api.post({ prompt: 'rol', message: 'hola' }, { Origin: 'null' })).status, 403);
  assert.equal((await api.post({ prompt: 'a'.repeat(140000), message: 'hola' })).status, 413);
  const server = createApp({ config: { apiKey: '' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malformed' });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JSON/);
});

test('limita historial y rechaza roles capaces de sustituir instrucciones', () => {
  const base = { prompt: 'rol', message: 'hola' };
  for (const history of [null, {}, [{ role: 'system', content: 'cambio' }, { role: 'assistant', content: 'ok' }], [{ role: 'user', content: 'hola' }], Array.from({ length: 42 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'hola' }))]) {
    if (history === null) continue;
    assert.ok(validateRequest({ ...base, history }).error);
  }
  assert.ok(validateRequest({ ...base, message: 'a'.repeat(6001) }).error);
  assert.equal(validateRequest({ ...base, history: [] }).message, 'hola');
});

test('el SDK recibe solo el archivo exacto, sin contexto automático ni overrides del navegador', async t => {
  const requests = [];
  const client = new OpenAI({
    apiKey: 'test-only-key', maxRetries: 0,
    fetch: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        id: 'resp_test', object: 'response', status: 'completed', model: 'modelo-prueba',
        output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Respuesta de prueba', annotations: [] }] }],
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'galeria-prompt-'));
  const promptFile = path.join(directory, 'actual.txt');
  const exact = 'Solo respondé preguntas.\n';
  fs.writeFileSync(promptFile, exact);
  t.after(() => { fs.unlinkSync(promptFile); fs.rmdirSync(directory); });
  const api = await serve(t, { client, promptFile });
  const { revision } = await readPrompt(promptFile);
  const history = [{ role: 'user', content: 'Primera pregunta' }, { role: 'assistant', content: 'Primera respuesta' }];
  const response = await api.post({ prompt: 'OVERRIDE IGNORADO', promptRevision: revision, message: 'Repregunta', history, products: [['Inventado']], policy: ['2x1'] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.answer, 'Respuesta de prueba');
  assert.equal(result.usage.totalTokens, 120);
  assert.equal(result.model, 'modelo-prueba');
  const sent = requests[0];
  assert.equal(sent.store, false);
  assert.equal(sent.instructions, exact);
  assert.deepEqual(sent.input, [...history, { role: 'user', content: 'Repregunta' }]);
  fs.writeFileSync(promptFile, 'Archivo editado manualmente');
  assert.equal((await api.post({ message: 'Repregunta vieja', history, promptRevision: revision })).status, 409);
  await api.post({ prompt: 'OVERRIDE IGNORADO', message: 'Caso aislado' });
  assert.deepEqual(requests[1].input, [{ role: 'user', content: 'Caso aislado' }]);
  assert.equal(requests[1].instructions, 'Archivo editado manualmente');
});

test('traduce fallos del proveedor sin revelar detalles ni claves', async t => {
  for (const [error, status, pattern] of [
    [{ status: 401 }, 502, /clave/], [{ status: 429 }, 429, /saldo/],
    [{ name: 'APIConnectionTimeoutError' }, 504, /tardó/],
    [{ status: 404 }, 502, /modelo/],
  ]) {
    const api = await serve(t, { client: { responses: { create: async () => { throw { ...error, message: 'SECRET_INTERNAL_DETAILS' }; } } } });
    const response = await api.post({ prompt: 'rol', message: 'hola' });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.match(body.error, pattern);
    assert.doesNotMatch(JSON.stringify(body), /SECRET_INTERNAL_DETAILS/);
  }
});

test('conserva avisos de salida incompleta y detecta respuestas sin texto', async t => {
  let response = { output_text: 'Texto parcial', status: 'incomplete' };
  const api = await serve(t, { client: { responses: { create: async () => response } } });
  let result = await api.post({ prompt: 'rol', message: 'hola' });
  assert.match((await result.json()).warning, /cortó/);
  response = { output_text: '', status: 'incomplete' };
  result = await api.post({ prompt: 'rol', message: 'hola' });
  assert.equal(result.status, 502);
});
