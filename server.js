const path = require('node:path');
const express = require('express');
const { OpenAI } = require('openai');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const { loadLab } = require('./lib/catalog');
const { readPrompt } = require('./lib/prompt');
const { validateRequest, publicError } = require('./lib/chat');

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createApp(options = {}) {
  const config = {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.2',
    timeout: positiveInteger(process.env.OPENAI_TIMEOUT_MS, 90000),
    maxOutputTokens: positiveInteger(process.env.OPENAI_MAX_OUTPUT_TOKENS, 2500),
    ...options.config,
  };
  const client = options.client || (config.apiKey ? new OpenAI({
    apiKey: config.apiKey, timeout: config.timeout, maxRetries: 0,
  }) : null);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    // The page and API share an origin; other websites cannot spend this key.
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'Abrí el laboratorio desde la dirección del servidor, no desde el archivo HTML.' });
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.get(['/', '/tienda_galeria_nube.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'tienda_galeria_nube.html'));
  });
  app.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'deny' }));
  app.get('/api/health', (req, res) => res.json({
    configured: Boolean(config.apiKey || options.client), model: config.model, timeoutMs: config.timeout,
  }));
  app.get('/api/lab', (req, res) => res.json(loadLab()));
  app.get('/api/prompt', async (req, res, next) => {
    try {
      const { revision } = await readPrompt(options.promptFile);
      res.json({ revision });
    } catch (error) { next(error); }
  });

  let active = 0;
  app.post('/api/ask', async (req, res) => {
    const validation = validateRequest(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    if (!client) return res.status(503).json({ error: 'Falta OPENAI_API_KEY en el archivo .env del servidor. Configurala y reiniciá npm start.' });
    if (active >= 4) return res.status(429).json({ error: 'Hay varias consultas en curso. Esperá unos segundos y volvé a intentar.' });
    const { message, history } = validation;
    const started = Date.now();
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abort);
    active++;
    try {
      const { prompt, revision } = await readPrompt(options.promptFile);
      if ((req.body.promptRevision && req.body.promptRevision !== revision) || (history.length && req.body.promptRevision !== revision)) {
        return res.status(409).json({ error: 'El archivo de prompt cambió. Iniciá una nueva consulta para usarlo sin historial anterior.' });
      }
      const response = await client.responses.create({
        model: config.model,
        instructions: prompt,
        input: [...history, { role: 'user', content: message }],
        max_output_tokens: config.maxOutputTokens,
        store: false,
      }, { signal: controller.signal });
      const answer = response.output_text?.trim();
      if (!answer) return res.status(502).json({ error: 'El modelo no devolvió texto. Probá de nuevo o aumentá OPENAI_MAX_OUTPUT_TOKENS en .env.' });
      res.json({
        answer, promptRevision: revision, model: response.model || config.model, durationMs: Date.now() - started,
        usage: response.usage ? {
          inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens,
        } : null,
        warning: response.status === 'incomplete' ? 'La respuesta se cortó al alcanzar el límite de salida.' : null,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        if ([422, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
        console.error('OpenAI:', error.name, error.status || '', error.code || '');
        const failure = publicError(error);
        res.status(failure.status).json({ error: failure.message });
      }
    } finally {
      active--;
      res.off('close', abort);
    }
  });
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'La consulta es demasiado larga.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo debe ser JSON válido.' });
    if ([422, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
    console.error('Servidor:', error.code || error.name);
    res.status(500).json({ error: 'No se pudo completar la operación en el servidor.' });
  });
  return app;
}

if (require.main === module) {
  const port = positiveInteger(process.env.PORT, 3000);
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => {
    console.log(`Laboratorio: http://localhost:${port}`);
    console.log(`Modelo: ${process.env.OPENAI_MODEL || 'gpt-5.2'}`);
  }).on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `El puerto ${port} está ocupado. Cambiá PORT en .env.` : error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
