import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VERSION, STORAGE_KEY, loadDays, saveDays } from '../agent/lib/store.js';

const TODAY = '2026-09-11';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value))
  };
}

test('first load seeds the example plan and persists it', () => {
  const storage = memoryStorage();
  const first = loadDays(storage, TODAY);
  assert.equal(first.seeded, true);
  assert.equal(first.persisted, true);
  assert.ok(first.days[TODAY]);
  const second = loadDays(storage, '2026-09-12');
  assert.equal(second.seeded, false);
  assert.deepEqual(second.days, first.days, 'reload keeps the original dates');
});

test('saved changes survive a reload', () => {
  const storage = memoryStorage();
  const { days } = loadDays(storage, TODAY);
  days[TODAY].items[0].log.push({ reps: 6, kg: 80, at: 1 });
  assert.equal(saveDays(storage, days), true);
  assert.deepEqual(loadDays(storage, TODAY).days[TODAY].items[0].log,
    [{ reps: 6, kg: 80, at: 1 }]);
});

test('corrupt, outdated, or wrong-shaped data is reseeded', () => {
  for (const raw of ['{not json', JSON.stringify({ seedVersion: SEED_VERSION + 1, days: {} }),
    JSON.stringify({ seedVersion: SEED_VERSION, days: [] }), JSON.stringify(null)]) {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, raw);
    const result = loadDays(storage, TODAY);
    assert.equal(result.seeded, true, raw);
    assert.ok(result.days[TODAY], raw);
  }
});

test('stored malformed items are sanitized on load', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({
    seedVersion: SEED_VERSION,
    days: { [TODAY]: { focus: 'Chest', items: [{ id: 'x', name: 'x', type: 'strength', sets: -1 }] } }
  }));
  assert.deepEqual(loadDays(storage, TODAY).days[TODAY].items, []);
});

test('missing or failing storage still yields a usable unsaved session', () => {
  const missing = loadDays(null, TODAY);
  assert.equal(missing.persisted, false);
  assert.ok(missing.days[TODAY]);
  const failing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); }
  };
  const result = loadDays(failing, TODAY);
  assert.equal(result.persisted, false);
  assert.ok(result.days[TODAY]);
  assert.equal(saveDays(failing, result.days), false);
});
