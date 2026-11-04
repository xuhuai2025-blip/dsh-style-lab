import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSkinActions, createSkinTool, SKIN_IDS, SKIN_NAMESPACE, MIST_MODES } from '../skin-preferences-core.js';

function fixture({ value = { skinId: 'native', mistMode: 'hud' }, writable = true, present = true } = {}) {
  let view = { ns: SKIN_NAMESPACE, value: { ...value }, revision: 4 };
  const calls = [];
  const controller = {
    describe() { return { writable, namespaces: present ? [view] : [] }; },
    async mutate(ns, ops, revision) {
      calls.push({ ns, ops, revision });
      if (revision !== view.revision) throw new Error('native settings/conflict');
      const value = { ...view.value };
      for (const op of ops) value[op.path[0]] = op.value;
      view = { ...view, value, revision: view.revision + 1 };
      return view;
    },
  };
  return { controller, actions: createSkinActions(controller), calls };
}

test('get is bounded, has the seven-id catalog, and never changes native appearance', () => {
  const { actions, calls } = fixture();
  const got = actions.get();
  assert.equal(got.skinId, 'native');
  assert.equal(got.mistMode, 'hud');
  assert.equal(got.ns, 'local-stylelab');
  assert.equal(got.revision, 4);
  assert.equal(got.writable, true);
  assert.deepEqual(got.catalog.map(row => row.id), [...SKIN_IDS]);
  assert.equal(Object.hasOwn(got, 'changed'), false);
  assert.equal(calls.length, 0);
});

test('native is an initialization sentinel, not an alias that writes system', async () => {
  const { actions, calls } = fixture({ value: { skinId: 'dark', mistMode: 'circuit' } });
  const got = await actions.set({ skinId: 'native' });
  assert.equal(got.skinId, 'native');
  assert.equal(got.mistMode, 'circuit');
  assert.deepEqual(calls[0], { ns: 'local-stylelab', ops: [{ op: 'set', path: ['skinId'], value: 'native' }], revision: 4 });
});

test('both fields mutate atomically and preserve unrelated settings', async () => {
  const { actions, calls } = fixture({ value: { skinId: 'native', mistMode: 'hud', unrelated: 'keep' } });
  const got = await actions.set({ skinId: 'stylelab-ivory-notebook', mistMode: 'circuit' });
  assert.equal(got.changed, true);
  assert.equal(got.revision, 5);
  assert.deepEqual(calls, [{ ns: 'local-stylelab', revision: 4, ops: [
    { op: 'set', path: ['skinId'], value: 'stylelab-ivory-notebook' },
    { op: 'set', path: ['mistMode'], value: 'circuit' },
  ] }]);
  assert.equal(Object.hasOwn(got, 'unrelated'), false);
});

test('partial mutations use the latest described revision and suppress unchanged fields', async () => {
  const { actions, calls } = fixture();
  await actions.set({ skinId: 'stylelab-mist-glow' });
  await actions.set({ skinId: 'stylelab-mist-glow', mistMode: 'circuit' });
  assert.deepEqual(calls[1], { ns: 'local-stylelab', revision: 5, ops: [{ op: 'set', path: ['mistMode'], value: 'circuit' }] });
  const noop = await actions.set({ skinId: 'stylelab-mist-glow', mistMode: 'circuit' });
  assert.equal(noop.changed, false);
  assert.equal(calls.length, 2);
});

test('validates ids, partial shape and revisions before touching the controller', async () => {
  let reads = 0;
  const actions = createSkinActions({ describe() { reads++; throw new Error('must not read'); } });
  for (const patch of [null, [], {}, { expectedRevision: 1 }, { skinId: 'unknown' }, { mistMode: 'unknown' },
    { skinId: undefined }, { mistMode: null }, { skinId: 'native', preference: 'dark' },
    ...[-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1, '4', null].map(expectedRevision => ({ skinId: 'light', expectedRevision }))]) {
    await assert.rejects(actions.set(patch), TypeError);
  }
  assert.equal(reads, 0);
});

test('all catalog ids and both mist modes are accepted', async () => {
  const { actions } = fixture();
  for (const skinId of SKIN_IDS) assert.equal((await actions.set({ skinId })).skinId, skinId);
  for (const mistMode of MIST_MODES) assert.equal((await actions.set({ mistMode })).mistMode, mistMode);
});

test('explicit optimistic fences reject stale no-ops and leave native conflict errors intact', async () => {
  const { actions, calls, controller } = fixture();
  await assert.rejects(actions.set({ skinId: 'native', expectedRevision: 3 }), /revision conflict/);
  assert.equal(calls.length, 0);
  const refusal = new Error('native settings/conflict');
  controller.mutate = async () => { throw refusal; };
  await assert.rejects(actions.set({ skinId: 'light', expectedRevision: 4 }), error => error === refusal);
});

test('read-only and unavailable namespaces fail without mutations', async () => {
  const readonly = fixture({ writable: false });
  assert.equal(readonly.actions.get().writable, false);
  await assert.rejects(readonly.actions.set({ skinId: 'light' }), /read-only/);
  assert.equal(readonly.calls.length, 0);
  const absent = fixture({ present: false });
  assert.throws(() => absent.actions.get(), /unavailable/);
  await assert.rejects(absent.actions.set({ mistMode: 'circuit' }), /unavailable/);
});

test('deferred tool dispatch shares the same native operation and strict get/set contract', async () => {
  const { actions, calls } = fixture();
  const tool = createSkinTool(actions);
  assert.equal(tool.name, 'stylelab_skin');
  assert.equal(tool.deferLoading, true);
  assert.equal(tool.isConcurrencySafe({ action: 'get' }), true);
  assert.equal(tool.isConcurrencySafe({ action: 'set' }), false);
  assert.equal((await tool.execute({ action: 'get' })).skinId, 'native');
  assert.equal((await tool.execute({ action: 'set', skinId: 'stylelab-oat-parchment', expectedRevision: 4 })).changed, true);
  assert.equal(calls.length, 1);
  for (const args of [null, [], {}, { action: 'bad' }, { action: 'get', skinId: 'dark' },
    { action: 'set' }, { action: 'set', preference: 'dark' }]) await assert.rejects(tool.execute(args));
  const output = actions.get();
  assert.deepEqual(tool.output.render({}, output), [{ type: 'text', text: JSON.stringify(output) }]);
});

test('Host schema and package root use only the declared native schema peer', () => {
  const host = readFileSync(new URL('../skin-preferences-host.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(host, /import z from '@deepseek-ai\/schemastery'/);
  assert.match(host, /skinId: z\.union\(\[\.\.\.SKIN_IDS\]\)\.default\('native'\)\.volatile\(\)/);
  assert.match(host, /mistMode: z\.union\(\[\.\.\.MIST_MODES\]\)\.default\('hud'\)\.volatile\(\)/);
  assert.match(host, /settings\.configure\(\{ auto: false \}, ctx\.fiber\)/);
  assert.match(host, /ctx\.effect\(\(\) => ctx\.tools\.register\(createSkinTool\(actions\)\)\)/);
  assert.equal(manifest.exports['.'], './skin-preferences-host.js');
  assert.equal(manifest.peerDependencies['@deepseek-ai/schemastery'], '~3.18.5');
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  assert.equal(Object.keys(manifest.devDependencies ?? {}).length, 0);
});
