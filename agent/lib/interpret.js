// One utterance → the model's tool calls. A fresh LanguageModel session per
// utterance: tool results cannot be returned to the model, and a reused
// session re-emits its earlier calls (measured in Studio on 2026-09-11).
// The plan itself is the context, injected through the system prompt.

export const DEFAULT_TIMEOUT_MS = 30000;

function describe(error) {
  if (!error) return 'unknown error';
  return String(error.message || error.error || error).slice(0, 80);
}

function parseArguments(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

// options: { model, systemPrompt, tools, timeoutMs, setTimer, clearTimer }
// Resolves to { calls: [{ name, args }], reply, error }.
export async function interpretUtterance(text, options) {
  const model = options.model;
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id));
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  if (!model || typeof model.create !== 'function') return { calls: [], reply: '', error: 'no model' };

  let session = null;
  const calls = [];
  const seen = new Set();
  try {
    if (typeof model.availability === 'function') {
      const status = await model.availability();
      if (status !== 'available') return { calls: [], reply: '', error: 'model ' + status };
    }
    session = await model.create({
      initialPrompts: [{ role: 'system', content: options.systemPrompt }],
      tools: options.tools
    });
    if (typeof session.addEventListener === 'function') {
      session.addEventListener('toolcall', (event) => {
        if (!event) return;
        if (event.callId !== undefined && seen.has(event.callId)) return;
        if (event.callId !== undefined) seen.add(event.callId);
        calls.push({ name: String(event.functionName || ''), args: parseArguments(event.arguments) });
      });
    }
    let timer = null;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimer(() => reject(new Error('timeout after ' + timeoutMs + ' ms')), timeoutMs);
    });
    let reply = '';
    try {
      reply = await Promise.race([session.prompt(text), timeout]);
    } finally {
      if (timer !== null) clearTimer(timer);
    }
    return { calls, reply: String(reply || ''), error: null };
  } catch (error) {
    return { calls, reply: '', error: describe(error) };
  } finally {
    if (session && typeof session.destroy === 'function') {
      try { session.destroy(); } catch (error) { /* nothing to release */ }
    }
  }
}
