import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretUtterance } from '../agent/lib/interpret.js';

// Fake LanguageModel: emits the scripted tool calls while prompt() is pending.
function fakeModel(script) {
  const created = [];
  return {
    created,
    availability: async () => (script.status || 'available'),
    create: async (options) => {
      const listeners = [];
      const session = {
        options,
        destroyed: false,
        addEventListener: (type, listener) => { if (type === 'toolcall') listeners.push(listener); },
        prompt: async (text) => {
          session.promptText = text;
          for (const call of script.calls || []) listeners.forEach((listener) => listener(call));
          if (script.hang) return new Promise(() => {});
          if (script.throws) throw new Error(script.throws);
          return script.reply || '';
        },
        destroy: () => { session.destroyed = true; }
      };
      created.push(session);
      return session;
    }
  };
}

const OPTIONS = { systemPrompt: 'system', tools: [{ type: 'function', function: { name: 'x' } }] };

test('collects tool calls, passes prompt config, and destroys the session', async () => {
  const model = fakeModel({
    calls: [
      { callId: 'a', functionName: 'add_exercise', arguments: { name: 'Squat', sets: 5 } },
      { callId: 'a', functionName: 'add_exercise', arguments: { name: 'Squat', sets: 5 } },
      { callId: 'b', functionName: 'finish', arguments: '{"x":1}' },
      { callId: 'c', functionName: 'undo', arguments: 'not json' }
    ],
    reply: 'Done.'
  });
  const result = await interpretUtterance('add squat', Object.assign({ model }, OPTIONS));
  assert.equal(result.error, null);
  assert.equal(result.reply, 'Done.');
  assert.deepEqual(result.calls, [
    { name: 'add_exercise', args: { name: 'Squat', sets: 5 } },
    { name: 'finish', args: { x: 1 } },
    { name: 'undo', args: {} }
  ]);
  assert.equal(model.created.length, 1);
  assert.equal(model.created[0].promptText, 'add squat');
  assert.deepEqual(model.created[0].options.initialPrompts, [{ role: 'system', content: 'system' }]);
  assert.equal(model.created[0].options.tools, OPTIONS.tools);
  assert.equal(model.created[0].destroyed, true);
});

test('reports a missing or unavailable model without throwing', async () => {
  assert.deepEqual(await interpretUtterance('x', Object.assign({ model: null }, OPTIONS)),
    { calls: [], reply: '', error: 'no model' });
  const result = await interpretUtterance('x', Object.assign({ model: fakeModel({ status: 'unavailable' }) }, OPTIONS));
  assert.deepEqual(result, { calls: [], reply: '', error: 'model unavailable' });
});

test('a hanging prompt times out but keeps the calls already received', async () => {
  const timers = [];
  const model = fakeModel({ calls: [{ functionName: 'finish', arguments: {} }], hang: true });
  const pending = interpretUtterance('done', Object.assign({
    model,
    timeoutMs: 5000,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { timers[id - 1].cleared = true; }
  }, OPTIONS));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 5000);
  timers[0].fn();
  const result = await pending;
  assert.match(result.error, /timeout after 5000 ms/);
  assert.deepEqual(result.calls, [{ name: 'finish', args: {} }]);
  assert.equal(timers[0].cleared, true);
  assert.equal(model.created[0].destroyed, true);
});

test('a rejected prompt surfaces its message', async () => {
  const model = fakeModel({ throws: 'network down' });
  const result = await interpretUtterance('x', Object.assign({ model }, OPTIONS));
  assert.equal(result.error, 'network down');
  assert.deepEqual(result.calls, []);
  assert.equal(model.created[0].destroyed, true);
});
