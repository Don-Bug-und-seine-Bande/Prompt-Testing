const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium, expect } = require('@playwright/test');
const { createApp } = require('../server');
const { loadLab } = require('../lib/catalog');

test('archivo externo: chat, recarga automática, casos individuales y cancelación', { timeout: 120000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'galeria-browser-'));
  const promptFile = path.join(directory, 'actual.txt');
  const original = 'Respondé usando solo lo que te escriban.\n';
  fs.writeFileSync(promptFile, original);
  t.after(() => { fs.unlinkSync(promptFile); fs.rmdirSync(directory); });
  const requests = [];
  let mode = 'ok';
  const client = { responses: { create: async (body, options) => {
    requests.push(body);
    if (mode === 'error') throw { status: 429, name: 'RateLimitError' };
    if (mode === 'slow') await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 15000);
      options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted')); }, { once: true });
    });
    return { output_text: `Respuesta simulada ${requests.length}: <script>window.injected=true</script>`, model: 'modelo-prueba', status: 'completed' };
  } } };
  const server = createApp({ client, promptFile }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const localBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find(file => fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, ...(localBrowser ? { executablePath: localBrowser } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('#promptStatus')).toContainText('listo');
  assert.deepEqual(await page.locator('#catalog tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))),
    loadLab().products.map(row => row.map(String)));
  await expect(page.locator('nav button')).toHaveCount(3);
  for (const id of ['promptInput', 'studentName', 'results', 'contextPreview', 'savePrompt', 'loadPrompt', 'exportReport', 'modelAnswer']) {
    await expect(page.locator('#' + id)).toHaveCount(0);
  }
  await page.locator('[data-tab="test"]').click();
  await page.locator('#runCase').click();
  await expect(page.locator('#caseAnswer')).toContainText('Respuesta simulada 1');
  assert.equal(requests[0].instructions, original);
  assert.equal(requests[0].input.length, 1);
  assert.equal(await page.evaluate(() => window.injected), undefined);

  await page.locator('[data-tab="chat"]').click();
  await expect(page.locator('#promptStatus')).toBeVisible();
  await expect(page.locator('#runCase')).toBeHidden();
  await page.locator('#chatMessage').fill('Primera consulta');
  await page.locator('#sendChat').click();
  await expect(page.locator('#chatLog .chat-message')).toHaveCount(2);
  await page.locator('#chatMessage').fill('Repregunta');
  await page.locator('#sendChat').click();
  await expect(page.locator('#chatLog .chat-message')).toHaveCount(4);
  assert.equal(requests.at(-1).input.length, 3);

  fs.writeFileSync(promptFile, 'Prompt editado desde un archivo');
  await page.locator('#chatMessage').fill('Consulta con el archivo nuevo');
  await page.locator('#sendChat').click();
  await expect(page.locator('#chatLog .chat-message')).toHaveCount(2);
  assert.equal(requests.at(-1).instructions, 'Prompt editado desde un archivo');
  assert.equal(requests.at(-1).input.length, 1);
  await expect(page.locator('#promptStatus')).toContainText('actualizado');
  await expect(page.locator('#caseAnswer')).toContainText('Todavía no');

  await page.locator('[data-tab="test"]').click();
  await expect(page.locator('#chatMessage')).toBeHidden();
  await expect(page.locator('#runAll')).toHaveCount(0);
  await page.locator('#runCase').click();
  await expect(page.locator('#caseAnswer')).toContainText('Respuesta simulada 5');
  assert.equal(requests.length, 5);
  assert.equal(requests.at(-1).instructions, 'Prompt editado desde un archivo');
  assert.equal(requests.at(-1).input.length, 1);
  await page.locator('#caseSelect').selectOption('6');
  await expect(page.locator('#caseAnswer')).toContainText('Todavía no');
  await page.locator('#runCase').click();
  await expect(page.locator('#caseAnswer')).toContainText('Respuesta simulada 6');
  assert.equal(requests.length, 6);
  assert.equal(requests.at(-1).input.length, 1);
  await page.locator('#caseSelect').selectOption('0');
  await expect(page.locator('#caseAnswer')).toContainText('Respuesta simulada 5');
  await expect(page.locator('#teacherHint')).toHaveCount(0);
  await expect(page.locator('#expectedText')).toBeHidden();
  await page.locator('#caseExpected summary').click();
  await expect(page.locator('#expectedText')).toHaveText(loadLab().tests[0].expected);
  await page.locator('#nextCase').click();
  await expect(page.locator('#expectedText')).toBeHidden();
  await page.locator('#prevCase').click();

  mode = 'error';
  await page.locator('#runCase').click();
  await expect(page.locator('#operationError')).toContainText('saldo');
  await expect(page.locator('#caseAnswer')).toContainText('Respuesta simulada 5');
  mode = 'slow';
  await page.locator('#runCase').click();
  await expect(page.locator('#cancelRun')).toBeVisible();
  await page.locator('#cancelRun').click();
  await expect(page.locator('#operationStatus')).toContainText('cancelada');
  await expect(page.locator('#runCase')).toBeEnabled();

  mode = 'ok';
  await page.locator('#clearAnswers').click();
  await expect(page.locator('#caseAnswer')).toContainText('Todavía no');
  await expect(page.locator('#clearAnswers')).toBeDisabled();
  await page.locator('#caseSelect').selectOption('6');
  await expect(page.locator('#caseAnswer')).toContainText('Todavía no');
  fs.writeFileSync(promptFile, '   ');
  await page.locator('[data-tab="chat"]').click();
  await page.locator('#chatMessage').fill('Mensaje pendiente');
  await page.locator('#sendChat').click();
  await expect(page.locator('#operationError')).toContainText('vacío');
  await expect(page.locator('#chatMessage')).toHaveValue('Mensaje pendiente');
  fs.writeFileSync(promptFile, original);
  await page.locator('#sendChat').click();
  await expect(page.locator('#chatLog .chat-message')).toHaveCount(2);
  await page.locator('#newChat').click();
  await expect(page.locator('#chatLog .chat-message')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});
