const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function readPrompt(file = path.join(__dirname, '..', 'prompts', 'actual.txt')) {
  let prompt;
  try { prompt = await fs.readFile(file, 'utf8'); }
  catch { throw Object.assign(new Error('No se pudo leer prompts/actual.txt. Revisá que el archivo exista.'), { status: 503 }); }
  if (!prompt.trim()) throw Object.assign(new Error('El archivo prompts/actual.txt está vacío. Escribí allí el prompt completo.'), { status: 422 });
  if (prompt.length > 20000) throw Object.assign(new Error('El archivo de prompt admite hasta 20.000 caracteres.'), { status: 422 });
  return { prompt, revision: createHash('sha256').update(prompt).digest('hex') };
}

module.exports = { readPrompt };
