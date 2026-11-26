function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Enviá un objeto JSON.' };
  if (typeof body.message !== 'string' || !body.message.trim()) return { error: 'Escribí una consulta del cliente.' };
  if (body.message.length > 6000) return { error: 'La consulta admite hasta 6.000 caracteres.' };
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 40 || history.length % 2 !== 0) return { error: 'El historial debe contener hasta 20 intercambios completos. Iniciá un chat nuevo.' };
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (!entry || entry.role !== (i % 2 === 0 ? 'user' : 'assistant') || typeof entry.content !== 'string' || !entry.content.trim() || entry.content.length > 20000) {
      return { error: 'El historial debe alternar mensajes de cliente y asistente con texto válido.' };
    }
  }
  if (history.reduce((n, e) => n + e.content.length, 0) > 80000) return { error: 'El historial es demasiado largo. Iniciá un chat nuevo.' };
  return { message: body.message.trim(), history: history.map(({ role, content }) => ({ role, content })) };
}

function publicError(error) {
  if (error.status === 401) return { status: 502, message: 'OpenAI rechazó la clave. Revisá OPENAI_API_KEY en .env y reiniciá el servidor.' };
  if (error.status === 403 || error.status === 404) return { status: 502, message: 'La cuenta no tiene acceso al modelo configurado. Revisá OPENAI_MODEL en .env.' };
  if (error.status === 429) return { status: 429, message: 'OpenAI indicó un límite de uso o saldo insuficiente. Revisá el saldo y los límites de la cuenta; después volvé a intentar.' };
  if (/Timeout/.test(error.name) || error.code === 'ETIMEDOUT') return { status: 504, message: 'OpenAI tardó demasiado en responder. Volvé a intentar.' };
  if (/Connection/.test(error.name)) return { status: 502, message: 'No se pudo conectar con OpenAI. Revisá la conexión a Internet del servidor.' };
  if (error.status === 400) return { status: 502, message: 'OpenAI rechazó la configuración de la consulta. Revisá el modelo y el límite de salida en .env.' };
  return { status: 502, message: 'No se pudo obtener una respuesta de OpenAI. Volvé a intentar en unos segundos.' };
}

module.exports = { validateRequest, publicError };
