(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE = 'galeria-nube-file-chat';
  let state = { revision: '', messages: [], answers: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (saved && typeof saved.revision === 'string' && Array.isArray(saved.messages) && saved.answers && typeof saved.answers === 'object') state = saved;
  } catch {}
  let lab, index = 0, connected = false, promptReady = false, operation = null, timeoutMs = 90000;

  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); }
    catch { toast('No se pudo guardar la conversación en este navegador.'); }
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $('toast').classList.remove('show'), 3200);
  }
  async function json(url, options = {}) {
    let response;
    try { response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(10000) }); }
    catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error('No se pudo conectar con el servidor. Verificá que npm start siga ejecutándose.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la consulta.');
    return data;
  }
  function controls() {
    const busy = Boolean(operation);
    for (const id of ['caseSelect', 'prevCase', 'nextCase', 'newChat']) $(id).disabled = busy || !lab;
    for (const id of ['runCase', 'sendChat']) $(id).disabled = busy || !connected || !lab;
    $('cancelRun').hidden = !busy || operation.kind === 'chat';
    $('cancelChat').hidden = !busy || operation.kind !== 'chat';
  }
  async function syncPrompt() {
    try {
      const data = await json('/api/prompt');
      const changed = state.revision && state.revision !== data.revision;
      if (state.revision !== data.revision) {
        state = { revision: data.revision, messages: [], answers: {} };
        save();
        if (lab) renderCase();
        renderChat();
      }
      promptReady = true;
      $('promptStatus').textContent = changed
        ? 'Archivo actualizado. Se inició un chat nuevo y se limpiaron las respuestas del prompt anterior.'
        : 'Archivo de prompt listo. Se vuelve a leer en cada consulta.';
      return data.revision;
    } catch (error) {
      promptReady = false;
      $('promptStatus').textContent = error.message;
      throw error;
    }
  }
  async function checkConnection() {
    try {
      const health = await json('/api/health');
      connected = health.configured;
      timeoutMs = health.timeoutMs;
      $('connectionStatus').textContent = connected
        ? `Servidor conectado · Modelo: ${health.model}`
        : 'Falta OPENAI_API_KEY en .env. Configurala y reiniciá el servidor.';
      await syncPrompt();
    } catch (error) { $('connectionStatus').textContent = error.message; }
    $('connectionStatus').parentElement.classList.toggle('ok', connected && promptReady);
    $('connectionStatus').parentElement.classList.toggle('problem', !connected || !promptReady);
    controls();
  }
  function describe(result) {
    return [result.model, result.durationMs != null ? `${(result.durationMs / 1000).toFixed(1)} s` : '',
      result.usage?.totalTokens ? `${result.usage.totalTokens} tokens` : '', result.warning].filter(Boolean).join(' · ');
  }
  function renderCase() {
    const test = lab.tests[index], answer = state.answers[index];
    $('caseSelect').value = String(index);
    $('caseNumber').textContent = `CASO ${index + 1} DE ${lab.tests.length}`;
    $('caseTitle').textContent = test.title;
    $('caseQuestion').textContent = test.q;
    $('caseAnswer').textContent = answer?.answer || 'Todavía no se probó este caso con el archivo actual.';
    $('caseAnswerMeta').textContent = answer ? describe(answer) : '';
    controls();
  }
  function renderChat() {
    $('chatLog').replaceChildren();
    for (const message of state.messages) {
      const bubble = document.createElement('div');
      bubble.className = 'chat-message ' + (message.role === 'user' ? 'user' : 'assistant');
      const title = document.createElement('strong');
      title.textContent = message.role === 'user' ? 'Cliente' : 'Asistente';
      const body = document.createElement('p');
      body.textContent = message.content;
      bubble.append(title, body);
      $('chatLog').append(bubble);
    }
    $('chatLog').scrollTop = $('chatLog').scrollHeight;
    $('chatStatus').textContent = `${state.messages.length / 2} intercambios`;
  }
  async function ask(message, history, revision, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs + 10000);
    try {
      return await json('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, promptRevision: revision }), signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new Error('La consulta tardó demasiado. Volvé a intentar.');
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  async function perform(kind, task) {
    if (operation) return;
    operation = { kind, controller: new AbortController() };
    $('operationError').hidden = true;
    controls();
    try {
      const revision = await syncPrompt();
      if (!operation.controller.signal.aborted) await task(revision, operation.controller.signal);
    } catch (error) {
      if (!operation.controller.signal.aborted) {
        $('operationError').textContent = error.message;
        $('operationError').hidden = false;
        $('operationStatus').textContent = 'La consulta no se completó.';
      }
    } finally {
      if (operation.controller.signal.aborted) $('operationStatus').textContent = 'Consulta cancelada. Se conservan las respuestas completadas.';
      operation = null;
      controls();
      renderChat();
    }
  }
  function runCase() {
    return perform('cases', async (revision, signal) => {
      const selected = index;
      $('operationStatus').textContent = `Consultando caso ${selected + 1} de ${lab.tests.length}…`;
      const result = await ask(lab.tests[selected].q, [], revision, signal);
      if (signal.aborted) return;
      state.answers[selected] = result;
      save();
      renderCase();
      $('operationStatus').textContent = 'Respuesta recibida.';
    });
  }
  function sendChat(event) {
    event.preventDefault();
    const message = $('chatMessage').value.trim();
    if (!message) { toast('Escribí una consulta.'); return; }
    return perform('chat', async (revision, signal) => {
      $('operationStatus').textContent = 'El asistente está respondiendo…';
      const result = await ask(message, state.messages.map(({ role, content }) => ({ role, content })), revision, signal);
      if (signal.aborted) return;
      state.messages.push({ role: 'user', content: message }, { role: 'assistant', content: result.answer });
      if ($('chatMessage').value.trim() === message) $('chatMessage').value = '';
      save();
      renderChat();
      $('operationStatus').textContent = 'Respuesta recibida.';
    });
  }
  function bind() {
    document.querySelectorAll('nav button').forEach(button => button.onclick = () => {
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === button));
      document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.tab));
    });
    $('caseSelect').onchange = event => { index = Number(event.target.value); renderCase(); };
    $('prevCase').onclick = () => { index = (index - 1 + lab.tests.length) % lab.tests.length; renderCase(); };
    $('nextCase').onclick = () => { index = (index + 1) % lab.tests.length; renderCase(); };
    $('runCase').onclick = runCase;
    $('cancelRun').onclick = $('cancelChat').onclick = () => operation?.controller.abort();
    $('chatForm').onsubmit = sendChat;
    $('newChat').onclick = () => { state.messages = []; save(); renderChat(); };
    $('copyQuestion').onclick = async () => {
      try { await navigator.clipboard.writeText(lab.tests[index].q); toast('Consulta copiada'); }
      catch { toast('No se pudo copiar la consulta.'); }
    };
  }
  async function init() {
    controls();
    $('retryConnection').onclick = () => lab ? checkConnection() : init();
    try {
      lab = await json('/api/lab');
      $('catalogTitle').textContent = lab.catalogTitle;
      $('catalog').replaceChildren();
      for (const product of lab.products) {
        const row = document.createElement('tr');
        for (const value of product) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        $('catalog').append(row);
      }
      $('caseSelect').replaceChildren();
      lab.tests.forEach((test, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i + 1}. ${test.title}`;
        $('caseSelect').append(option);
      });
      bind();
      renderCase();
      renderChat();
      await checkConnection();
    } catch (error) { $('connectionStatus').textContent = error.message; }
  }
  init();
})();
