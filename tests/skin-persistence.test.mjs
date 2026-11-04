import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const themes = JSON.parse(source.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
// Constants and domain helpers only; never load the Client factory, DOM or React.
const pureSource = source.slice(source.indexOf('const THEMES ='), source.indexOf('    const DICTS ='));
const mistStyles = JSON.parse(source.match(/const MIST_STYLES = (\[[^\n]+\]);/)[1].replaceAll("'", '"'));
const { createPersistence, createGuard } = new Function('MIST_STYLES', `${pureSource};return {createPersistence:createSkinPersistence,createGuard:createThemeRefreshGuard};`)(mistStyles);
const ownIds = themes.map(theme => theme.id);
const savedIds = ['native', 'system', 'light', 'dark', ...ownIds];
const settle = () => new Promise(resolve => setImmediate(resolve));
function box(value) { return { value: Object.freeze({ ...value }), revision: 1 }; }

/** Accepted ConfigForm snapshots and atomic native mutations, entirely in memory. */
function mockForm(store, { status = 'ready', writable = true, manual = false } = {}) {
  let currentStatus = status;
  let currentWritable = writable;
  let snapshot;
  let active = 0;
  let maxActive = 0;
  let unsubscribes = 0;
  const listeners = new Set();
  const calls = [];
  function publish() {
    snapshot = Object.freeze({ status: currentStatus, writable: currentWritable,
      value: currentStatus === 'ready' ? store.value : undefined, revision: store.revision });
    for (const listener of [...listeners]) listener();
  }
  publish();
  return {
    calls, store,
    get active() { return active; },
    get maxActive() { return maxActive; },
    get listeners() { return listeners.size; },
    get unsubscribes() { return unsubscribes; },
    getSnapshot() { return snapshot; },
    subscribe(listener) { listeners.add(listener); return () => { unsubscribes++; listeners.delete(listener); }; },
    load(nextWritable = currentWritable) { currentStatus = 'ready'; currentWritable = nextWritable; publish(); },
    setWritable(value) { currentWritable = value; publish(); },
    refOnly() { store.revision++; publish(); },
    external(patch) { store.value = Object.freeze({ ...store.value, ...patch }); store.revision++; publish(); },
    mutate(ops) {
      assert.equal(currentStatus, 'ready', 'No mutation before an accepted scope');
      assert.equal(currentWritable, true, 'No mutation of a read-only scope');
      assert.ok(calls.length < 20, 'Unexpected automatic persistence loop');
      for (const op of ops) {
        assert.equal(op.op, 'set');
        assert.equal(op.path.length, 1);
        assert.ok(['skinId', 'mistMode'].includes(op.path[0]), 'Only plugin preference fields may be persisted');
        assert.deepEqual(Object.keys(op).sort(), ['op', 'path', 'value']);
      }
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      active++;
      maxActive = Math.max(maxActive, active);
      let done = false;
      const call = {
        ops: structuredClone(ops), revision: store.revision,
        accept() {
          assert.equal(done, false); done = true; active--;
          const patch = Object.fromEntries(ops.map(op => [op.path[0], op.value]));
          store.value = Object.freeze({ ...store.value, ...patch });
          store.revision++;
          publish(); // Native acceptance can precede resolution of mutate().
          resolve(true);
        },
        refuse() { assert.equal(done, false); done = true; active--; resolve(false); },
        fail(error = new Error('Native settings/conflict')) { assert.equal(done, false); done = true; active--; reject(error); },
      };
      calls.push(call);
      if (!manual) queueMicrotask(() => call.accept());
      return promise;
    },
  };
}

function harness({ value = { skinId: 'native', mistMode: 'hud' }, store = box(value),
  status = 'ready', nativeStatus = 'ready', writable = true, manual = false,
  initialTheme = 'dark', nativePreference = 'dark', guarded = false } = {}) {
  const form = mockForm(store, { status, writable, manual });
  const native = mockForm(box({ preference: nativePreference, textFontFamily: 'Native Text', codeFontFamily: 'Native Code', terminalFontFamily: 'Native Terminal', textFontSize: 17 }), { status: nativeStatus });
  let themeSnapshot = Object.freeze({ preference: initialTheme, themes, fontFamilies: Object.freeze({ text: 'saved text', code: 'saved code', terminal: 'saved terminal' }), fontSizes: Object.freeze({ text: 17, code: 13, terminal: 14 }) });
  let mode = 'hud';
  const events = [];
  const notifications = [];
  const themeListeners = new Set();
  let onSelection = () => {};
  let preferences;
  const theme = {
    getTheme() { return themeSnapshot; },
    setTheme(id) {
      events.push(['theme', id]);
      if (themeSnapshot.preference === id) return;
      themeSnapshot = Object.freeze({ ...themeSnapshot, preference: id });
      for (const listener of [...themeListeners]) listener(themeSnapshot);
    },
  };
  function note(id) { events.push(['note', id]); onSelection(id); }
  function applyMist(value) { mode = value; events.push(['mist', value]); }
  const guard = guarded ? createGuard(theme, native, listener => {
    themeListeners.add(listener); return () => themeListeners.delete(listener);
  }, queueMicrotask, id => preferences?.remember({ skinId: id })) : null;
  if (guard) onSelection = guard.onSelection;
  preferences = createPersistence(form, native, theme, note, applyMist, status => notifications.push(status));
  return {
    form, native, store, events, notifications, preferences, guard,
    externalTheme(id) { theme.setTheme(id); },
    adoptNative(id) { themeSnapshot = Object.freeze({ ...themeSnapshot, preference: id }); },
    get current() { return themeSnapshot; },
    get mode() { return mode; },
    ui(patch) {
      if (Object.hasOwn(patch, 'mistMode')) applyMist(patch.mistMode);
      if (Object.hasOwn(patch, 'skinId')) { note(patch.skinId); theme.setTheme(patch.skinId); }
      preferences.remember(patch);
    },
  };
}
function asPatch(call) { return Object.fromEntries(call.ops.map(op => [op.path[0], op.value])); }
function themeEvents(h) { return h.events.filter(([kind]) => kind === 'theme').map(([, value]) => value); }

for (const skinId of savedIds.filter(id => id !== 'native')) {
  test(`fresh controllers restore persisted ${skinId} and circuit across app restart without startup writes`, async () => {
    const store = box({ skinId, mistMode: 'circuit', untouched: 'keep' });
    const first = harness({ store, initialTheme: skinId === 'dark' ? 'light' : 'dark' });
    await settle();
    assert.equal(first.current.preference, skinId);
    assert.equal(first.mode, 'circuit');
    assert.deepEqual(first.events.slice(0, 3), [['mist', 'circuit'], ['note', skinId], ['theme', skinId]]);
    assert.equal(first.form.calls.length, 0);
    first.preferences.dispose();
    const second = harness({ store, initialTheme: 'light' });
    await settle();
    assert.equal(second.current.preference, skinId);
    assert.equal(second.mode, 'circuit');
    assert.equal(second.form.calls.length, 0);
    assert.equal(second.native.calls.length, 0);
    assert.equal(store.value.untouched, 'keep');
    second.preferences.dispose();
  });
}

test('initial native sentinel inherits the current native/runtime choice instead of forcing System', async () => {
  for (const initialTheme of ['system', 'light', 'dark', ownIds[2]]) {
    const h = harness({ initialTheme, nativePreference: 'dark' });
    await settle();
    assert.equal(h.current.preference, initialTheme);
    assert.deepEqual(themeEvents(h), []);
    assert.equal(h.form.calls.length, 0);
    h.preferences.dispose();
  }
});

test('joint accepted readiness gates hydration and applies Mist before the skin', async () => {
  const h = harness({ value: { skinId: ownIds[1], mistMode: 'circuit' }, status: 'loading', nativeStatus: 'loading' });
  assert.deepEqual(h.events, []);
  h.form.load();
  await settle();
  assert.deepEqual(h.events, []);
  h.native.load();
  await settle();
  assert.deepEqual(h.events.slice(0, 3), [['mist', 'circuit'], ['note', ownIds[1]], ['theme', ownIds[1]]]);
  assert.equal(h.form.calls.length, 0);
});

test('early UI choices override stale loading hydration, preserve the latest per-field intent, and save atomically', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'hud' }, status: 'loading', nativeStatus: 'loading', manual: true });
  h.ui({ skinId: ownIds[1] });
  h.ui({ skinId: ownIds[2], mistMode: 'circuit' });
  assert.equal(h.current.preference, ownIds[2]);
  assert.equal(h.form.calls.length, 0);
  const start = h.events.length;
  h.adoptNative('dark'); // Native first adoption may overwrite the early visual choice before both forms become ready.
  h.form.load();
  h.native.load();
  await settle();
  assert.equal(h.current.preference, ownIds[2]);
  assert.equal(h.mode, 'circuit');
  assert.ok(!h.events.slice(start).some(([kind, value]) => kind === 'theme' && value === ownIds[0]));
  assert.equal(h.form.calls.length, 1);
  assert.deepEqual(asPatch(h.form.calls[0]), { skinId: ownIds[2], mistMode: 'circuit' });
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[2]);
  assert.equal(h.store.value.mistMode, 'circuit');
});

test('scope/reference/revision and unrelated settings refreshes never reapply unchanged preference values', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'circuit' } });
  await settle();
  const status = h.preferences.getSnapshot();
  h.events.length = 0;
  h.form.refOnly();
  h.native.refOnly();
  h.form.external({ unrelated: 'changed elsewhere' });
  h.native.external({ unrelatedModel: 'new-model' });
  await settle();
  assert.deepEqual(h.events, []);
  assert.equal(h.preferences.getSnapshot(), status);
  assert.equal(h.form.calls.length, 0);
});

test('live tool form updates hydrate only changed fields, and native reset uses the accepted native preference', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'hud' }, nativePreference: 'dark' });
  await settle();
  h.events.length = 0;
  h.form.external({ skinId: ownIds[1], mistMode: 'circuit' });
  await settle();
  assert.deepEqual(h.events, [['mist', 'circuit'], ['note', ownIds[1]], ['theme', ownIds[1]]]);
  h.events.length = 0;
  h.form.external({ skinId: 'native' });
  await settle();
  assert.deepEqual(h.events, [['note', 'dark'], ['theme', 'dark']]);
  assert.equal(h.form.calls.length, 0);
  h.events.length = 0;
  h.native.external({ preference: 'light' });
  await settle();
  assert.deepEqual(h.events, []); // Native owns its own accepted preference changes.
  assert.equal(h.native.calls.length, 0);
});

test('remember is intent-only, partial saves are native atomic ops, unrelated data and native font settings survive', async () => {
  const h = harness({ value: { skinId: 'native', mistMode: 'hud', unrelated: { keep: true } }, manual: true });
  await settle();
  h.events.length = 0;
  const nativeValue = h.native.store.value;
  const themeFonts = h.current.fontFamilies;
  const themeSizes = h.current.fontSizes;
  h.preferences.remember({ mistMode: 'circuit' });
  await settle();
  assert.deepEqual(h.events, []);
  assert.equal(h.form.calls.length, 1);
  assert.deepEqual(h.form.calls[0].ops, [{ op: 'set', path: ['mistMode'], value: 'circuit' }]);
  h.form.calls[0].accept();
  await settle();
  assert.deepEqual(h.store.value.unrelated, { keep: true });
  assert.equal(h.native.store.value, nativeValue);
  assert.equal(h.current.fontFamilies, themeFonts);
  assert.equal(h.current.fontSizes, themeSizes);
  assert.equal(h.native.calls.length, 0);
});

test('accepted no-op intents skip all writes and status objects stay stable and frozen', async () => {
  const h = harness();
  await settle();
  const initial = h.preferences.getSnapshot();
  assert.equal(Object.isFrozen(initial), true);
  assert.deepEqual(Object.keys(initial).sort(), ['error', 'pending', 'saving']);
  assert.deepEqual(initial, { saving: false, error: '', pending: false });
  h.preferences.remember({ skinId: 'native', mistMode: 'hud' });
  await settle();
  assert.equal(h.form.calls.length, 0);
  assert.equal(h.preferences.getSnapshot(), initial);
});

test('invalid patches throw before intent, visual state, status or native writes change', async () => {
  const h = harness();
  await settle();
  const initial = h.preferences.getSnapshot();
  h.events.length = 0;
  for (const patch of [null, [], {}, { preference: 'dark' }, { skinId: undefined }, { mistMode: null },
    { skinId: 'unknown' }, { mistMode: 'unknown' }, { skinId: 'system', expectedRevision: 1 }, { skinId: 'system', arbitrary: 'CSS' }]) {
    assert.throws(() => h.preferences.remember(patch), /Invalid skin preference selection/);
  }
  assert.deepEqual(h.events, []);
  assert.equal(h.form.calls.length, 0);
  assert.equal(h.preferences.getSnapshot(), initial);
});

test('rapid changes serialize at fresh accepted revisions and coalesce unsent values to the latest skin/mode', async () => {
  const h = harness({ manual: true });
  await settle();
  h.ui({ skinId: ownIds[0] });
  await settle();
  assert.equal(h.form.calls.length, 1);
  h.ui({ skinId: ownIds[1] });
  h.ui({ skinId: ownIds[2], mistMode: 'circuit' });
  await settle();
  assert.equal(h.form.calls.length, 1);
  const boundary = h.events.length;
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.form.calls.length, 2);
  assert.deepEqual(asPatch(h.form.calls[1]), { skinId: ownIds[2], mistMode: 'circuit' });
  assert.equal(h.form.calls[1].revision, h.form.calls[0].revision + 1);
  assert.ok(!h.events.slice(boundary).some(([kind, value]) => kind === 'theme' && value === ownIds[0]));
  h.form.calls[1].accept();
  await settle();
  assert.equal(h.form.maxActive, 1);
  assert.equal(h.store.value.skinId, ownIds[2]);
  assert.equal(h.store.value.mistMode, 'circuit');
  assert.deepEqual(h.preferences.getSnapshot(), { saving: false, error: '', pending: false });
});

test('old acknowledgments clear only matching field generations, not newer dirty mode intent', async () => {
  const h = harness({ manual: true });
  await settle();
  h.ui({ skinId: ownIds[1], mistMode: 'circuit' });
  await settle();
  h.ui({ mistMode: 'hud' });
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.form.calls.length, 2);
  assert.deepEqual(h.form.calls[1].ops, [{ op: 'set', path: ['mistMode'], value: 'hud' }]);
  assert.equal(h.mode, 'hud');
  assert.equal(h.preferences.getSnapshot().pending, true);
  h.form.calls[1].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[1]);
  assert.equal(h.store.value.mistMode, 'hud');
  assert.equal(h.preferences.getSnapshot().pending, false);
});

for (const failure of ['false', 'throw']) {
  test(`native ${failure} failure retains dirty data, surfaces error and requires explicit retry without loops`, async () => {
    const h = harness({ manual: true });
    await settle();
    h.ui({ skinId: ownIds[2] });
    await settle();
    if (failure === 'false') h.form.calls[0].refuse();
    else h.form.calls[0].fail(new Error('settings/conflict'));
    await settle();
    assert.ok(h.preferences.getSnapshot().error);
    assert.equal(h.preferences.getSnapshot().pending, true);
    assert.equal(h.preferences.getSnapshot().saving, false);
    h.form.refOnly();
    await settle();
    assert.equal(h.form.calls.length, 1);
    h.preferences.retry();
    await settle();
    assert.equal(h.form.calls.length, 2);
    assert.deepEqual(asPatch(h.form.calls[1]), { skinId: ownIds[2] });
    h.form.calls[1].accept();
    await settle();
    assert.deepEqual(h.preferences.getSnapshot(), { saving: false, error: '', pending: false });
  });
}

test('a failed old request does not block a newer choice already queued behind it', async () => {
  const h = harness({ manual: true });
  await settle();
  h.ui({ skinId: ownIds[0] });
  await settle();
  h.ui({ skinId: ownIds[1] });
  h.form.calls[0].fail(new Error('old request failed'));
  await settle();
  assert.equal(h.form.calls.length, 2);
  assert.deepEqual(asPatch(h.form.calls[1]), { skinId: ownIds[1] });
  h.form.calls[1].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[1]);
  assert.equal(h.preferences.getSnapshot().error, '');
});

test('a new choice after failure unblocks saving without retaining stale failed fields', async () => {
  const h = harness({ manual: true });
  await settle();
  h.ui({ skinId: ownIds[0] });
  await settle();
  h.form.calls[0].refuse();
  await settle();
  h.ui({ skinId: ownIds[2] });
  await settle();
  assert.equal(h.form.calls.length, 2);
  assert.deepEqual(asPatch(h.form.calls[1]), { skinId: ownIds[2] });
  h.form.calls[1].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[2]);
  assert.equal(h.preferences.getSnapshot().error, '');
});

test('read-only settings can hydrate but dirty UI intent reports an error without calling mutate', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'circuit' }, writable: false, manual: true });
  await settle();
  assert.equal(h.current.preference, ownIds[0]);
  h.ui({ skinId: ownIds[1] });
  await settle();
  assert.equal(h.current.preference, ownIds[1]);
  assert.ok(h.preferences.getSnapshot().error);
  assert.equal(h.preferences.getSnapshot().pending, true);
  assert.equal(h.form.calls.length, 0);
  h.form.setWritable(true);
  h.preferences.retry();
  await settle();
  assert.equal(h.form.calls.length, 1);
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.preferences.getSnapshot().error, '');
});

test('concurrent tool updates affect clean fields but cannot hydrate an old skin over dirty local intent', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'hud' }, manual: true });
  await settle();
  h.ui({ skinId: ownIds[2] });
  await settle();
  const boundary = h.events.length;
  h.form.external({ skinId: ownIds[0], mistMode: 'circuit', unrelated: 'tool data' });
  await settle();
  assert.equal(h.current.preference, ownIds[2]);
  assert.equal(h.mode, 'circuit');
  assert.ok(!h.events.slice(boundary).some(([kind, value]) => kind === 'theme' && value === ownIds[0]));
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[2]);
  assert.equal(h.store.value.mistMode, 'circuit');
  assert.equal(h.store.value.unrelated, 'tool data');
  assert.equal(h.form.maxActive, 1);
});

test('status subscriptions expose stable snapshots and stop notifying after unsubscribe or dispose', async () => {
  const h = harness({ manual: true });
  await settle();
  let calls = 0;
  const unsubscribe = h.preferences.subscribe(() => { calls++; });
  h.preferences.remember({ mistMode: 'circuit' });
  await settle();
  assert.ok(calls > 0);
  const active = h.preferences.getSnapshot();
  assert.equal(active.saving, true);
  assert.equal(active.pending, true);
  assert.equal(h.preferences.getSnapshot(), active);
  unsubscribe();
  const beforeAck = calls;
  h.form.calls[0].accept();
  await settle();
  assert.equal(calls, beforeAck);
  h.preferences.dispose();
  assert.equal(h.form.listeners, 0);
  assert.equal(h.native.listeners, 0);
  assert.equal(h.form.unsubscribes, 1);
  assert.equal(h.native.unsubscribes, 1);
});

test('dispose while loading prevents later hydration, writes and notifications', async () => {
  const h = harness({ value: { skinId: ownIds[0], mistMode: 'circuit' }, status: 'loading', nativeStatus: 'loading', manual: true });
  h.preferences.dispose();
  const notified = h.notifications.length;
  h.form.load();
  h.native.load();
  h.preferences.remember({ skinId: ownIds[2] });
  h.preferences.retry();
  await settle();
  assert.deepEqual(h.events, []);
  assert.equal(h.form.calls.length, 0);
  assert.equal(h.notifications.length, notified);
  assert.equal(h.form.listeners, 0);
  assert.equal(h.native.listeners, 0);
});

test('dispose does not cancel an already sent native operation but its late acknowledgment has no Client effects', async () => {
  const h = harness({ manual: true });
  await settle();
  h.ui({ skinId: ownIds[1] });
  await settle();
  let statuses = 0;
  h.preferences.subscribe(() => { statuses++; });
  h.preferences.dispose();
  const events = h.events.length;
  const notified = h.notifications.length;
  const statusCount = statuses;
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.store.value.skinId, ownIds[1]);
  assert.equal(h.events.length, events);
  assert.equal(h.notifications.length, notified);
  assert.equal(statuses, statusCount);
  assert.equal(h.form.calls.length, 1);
});

test('UI save followed by a fresh app controller restores every owned skin and Circuit from the same durable store', async () => {
  for (const skinId of ownIds) {
    const store = box({ skinId: 'native', mistMode: 'hud', retained: true });
    const first = harness({ store });
    await settle();
    first.ui({ skinId, mistMode: 'circuit' });
    await settle();
    assert.equal(first.form.calls.length, 1);
    first.preferences.dispose();
    const second = harness({ store, initialTheme: 'system' });
    await settle();
    assert.equal(second.current.preference, skinId);
    assert.equal(second.mode, 'circuit');
    assert.equal(second.form.calls.length, 0);
    assert.equal(store.value.retained, true);
    second.preferences.dispose();
  }
});

test('guard and persistence cooperate: startup never saves, external System/Dark intent survives the next restart', async () => {
  const store = box({ skinId: ownIds[1], mistMode: 'circuit' });
  const h = harness({ store, guarded: true });
  await settle();
  assert.equal(h.form.calls.length, 0);
  assert.equal(h.current.preference, ownIds[1]);
  h.externalTheme('system');
  await settle();
  assert.equal(store.value.skinId, 'system');
  h.externalTheme('dark');
  await settle();
  assert.equal(store.value.skinId, 'dark');
  assert.equal(h.form.calls.length, 2);
  h.preferences.dispose(); h.guard.dispose();
  const restart = harness({ store, initialTheme: 'light', guarded: true });
  await settle();
  assert.equal(restart.current.preference, 'dark');
  assert.equal(restart.mode, 'circuit');
  assert.equal(restart.form.calls.length, 0);
  restart.preferences.dispose(); restart.guard.dispose();
});

test('unavailable and invalid saved preferences report errors without writes, then recover on valid accepted data', async () => {
  const unavailable = harness({ value: { skinId: ownIds[0], mistMode: 'circuit' }, status: 'unavailable' });
  await settle();
  assert.ok(unavailable.preferences.getSnapshot().error);
  assert.deepEqual(unavailable.events, []);
  unavailable.form.load();
  await settle();
  assert.equal(unavailable.current.preference, ownIds[0]);
  assert.equal(unavailable.preferences.getSnapshot().error, '');
  assert.equal(unavailable.form.calls.length, 0);
  for (const value of [{ skinId: 'bad', mistMode: 'hud' }, { skinId: 'native', mistMode: 'bad' }]) {
    const h = harness({ value });
    await settle();
    assert.ok(h.preferences.getSnapshot().error);
    assert.deepEqual(h.events, []);
    h.form.external({ skinId: ownIds[2], mistMode: 'circuit' });
    await settle();
    assert.equal(h.current.preference, ownIds[2]);
    assert.equal(h.preferences.getSnapshot().error, '');
    assert.equal(h.form.calls.length, 0);
  }
});

test('retry or a new local intent cannot hide an unavailable-settings error before readiness recovers', async () => {
  const h = harness({ status: 'unavailable', manual: true });
  await settle();
  assert.ok(h.preferences.getSnapshot().error);
  h.preferences.retry();
  await settle();
  assert.ok(h.preferences.getSnapshot().error, 'A retry that cannot read/write must still show the failure');
  h.ui({ skinId: ownIds[0] });
  await settle();
  assert.ok(h.preferences.getSnapshot().error, 'An unsaved new choice must not hide unavailable settings');
  assert.equal(h.preferences.getSnapshot().pending, true);
  assert.equal(h.form.calls.length, 0);
  h.form.load();
  await settle();
  assert.equal(h.form.calls.length, 1);
  h.form.calls[0].accept();
  await settle();
  assert.equal(h.preferences.getSnapshot().error, '');
});

test('root handlers persist only intent and render a native error paragraph/retry button only on failure', () => {
  assert.match(source, /createSkinPersistence\(ctx\.configForms\.get\('local-stylelab'\), ctx\.configForms\.get\('ui-theme'\),/);
  assert.match(source, /id => skinPreferences\?\.remember\(\{ skinId: id \}\)/);
  const choose = source.slice(source.indexOf('function choose(id)'), source.indexOf('\n          return ', source.indexOf('function choose(id)')));
  assert.ok(choose.indexOf('noteThemeSelection(id)') < choose.indexOf('ctx.theme.setTheme(id)'));
  assert.match(choose, /skinPreferences\??\.remember\(\{ skinId: id \}\)/);
  const status = source.slice(source.indexOf('function SkinSaveStatus('), source.indexOf('function useMistDecoration('));
  assert.match(status, /React\.useSyncExternalStore\(skinPreferences.subscribe, skinPreferences.getSnapshot\)/);
  assert.match(status, /return saved.error \? h\('p', \{[^}]*role: 'alert'/);
  assert.match(status, /h\('button', \{[^}]*type: 'button', onClick: skinPreferences.retry/);
  assert.match(status, /: null/);
  assert.match(source, /return \(\) => \{ preferences.dispose\(\); \}/);
  assert.doesNotMatch(source.slice(source.indexOf('skinPreferences = preferences;')), /skinPreferences = null/, 'Keep the disposed store readable until queued React unmount renders finish');
});

test('persistence uses the public raw namespace and never browser storage, unload handlers or native font writes', () => {
  assert.match(source, /ctx\.configForms\.get\('local-stylelab'\)/);
  assert.doesNotMatch(source, /include:local-stylelab|localStorage|sessionStorage|beforeunload|pagehide|addEventListener\(/);
  const start = pureSource.indexOf('function createSkinPersistence(');
  assert.ok(start >= 0);
  const persistence = pureSource.slice(start);
  assert.doesNotMatch(persistence, /React\.|document\.|window\.|\.setTheme\s*=|\.replace\(|fontFamilies\s*=|fontSizes\s*=/);
});
