import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, inject, createFontActions } from '../simple-fonts-host.js';
import {
  ENGLISH_FONT_IDS, CHINESE_FONT_IDS, PRESET_IDS, FONT_FIELDS, normalizeFontFamily,
  readFontFields, validateFontLanguages, composeFontLanguages, matchFontLanguages,
  buildFontPatch, createFontPresetCatalog, matchFontPreset,
} from '../simple-fonts-core.js';

const records = JSON.parse(readFileSync(new URL('../simple-font-languages.json', import.meta.url), 'utf8'));
const catalog = validateFontLanguages(records);
const empty = { textFontFamily: '', codeFontFamily: '', terminalFontFamily: '' };
const maple = 'Maple Mono NF CN Latin, Maple Mono NF CN, Microsoft YaHei UI';
const currentMaple = { textFontFamily: maple, codeFontFamily: maple, terminalFontFamily: maple };
const removed = ['rounded', 'rubik', 'ubuntu', 'youyuan', 'consolas', 'dejavu', 'noto', 'stxihei', 'native', 'custom'];

// Only an in-memory native-controller mock; no font install or real settings writes.
function controller({ ns = 'include:ui-theme', value = {}, writable = true, revision = 8, namespaces } = {}) {
  let view = { ns, value: structuredClone(value), user: structuredClone(value), revision };
  let reads = 0;
  const calls = [];
  return {
    calls,
    get reads() { return reads; },
    get view() { return view; },
    describe() { reads += 1; return { writable, hasDocument: true, namespaces: namespaces ?? [view] }; },
    async update(ns, patch, expectedRevision) {
      calls.push({ ns, patch: structuredClone(patch), revision: expectedRevision });
      assert.equal(ns, view.ns);
      assert.equal(expectedRevision, view.revision);
      view = { ...view, value: { ...view.value, ...patch }, user: { ...view.user, ...patch }, revision: view.revision + 1 };
      return view;
    },
  };
}

function register(settingsController) {
  let definition;
  let disposed = false;
  const dispose = () => { disposed = true; };
  const cleanup = apply({ settingsController,
    tools: { register(value) { definition = value; return dispose; } },
    effect(callback) { return callback(); },
  });
  return { definition, cleanup, dispose, get disposed() { return disposed; } };
}

test('self-contained runtime references only the new minimal core and catalog', () => {
  const host = readFileSync(new URL('../simple-fonts-host.js', import.meta.url), 'utf8');
  const core = readFileSync(new URL('../simple-fonts-core.js', import.meta.url), 'utf8');
  assert.deepEqual([...host.matchAll(/from '([^']+)'/g)].map(match => match[1]), ['node:fs', './simple-fonts-core.js']);
  assert.match(host, /new URL\('\.\/simple-font-languages\.json', import\.meta\.url\)/);
  assert.doesNotMatch(core, /\bimport\b/);
  assert.doesNotMatch(host, /font-presets\.json|maple-fonts|font-languages-core|from '\.\/fonts-core\.js'/);
});

test('authoritative catalog and all ID enums contain only system default and optional local Maple', () => {
  assert.deepEqual(records, {
    english: [
      { id: 'default', text: 'Segoe UI', code: 'Consolas', terminal: 'Consolas' },
      { id: 'maple', text: 'Maple Mono NF CN Latin', code: 'Maple Mono NF CN Latin', terminal: 'Maple Mono NF CN Latin' },
    ],
    chinese: [
      { id: 'default', family: 'Microsoft YaHei UI' },
      { id: 'maple', family: 'Maple Mono NF CN' },
    ],
  });
  for (const ids of [ENGLISH_FONT_IDS, CHINESE_FONT_IDS, PRESET_IDS]) assert.deepEqual(ids, ['default', 'maple']);
  assert.deepEqual(createFontPresetCatalog(catalog), [{ id: 'default', ...empty }, { id: 'maple', ...currentMaple }]);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.english), true);
  assert.equal(Object.isFrozen(catalog.chinese[0]), true);
});

const combinations = [
  ['default', 'default', empty],
  ['default', 'maple', {
    textFontFamily: 'Segoe UI, Maple Mono NF CN, Microsoft YaHei UI',
    codeFontFamily: 'Consolas, Maple Mono NF CN, Microsoft YaHei UI',
    terminalFontFamily: 'Consolas, Maple Mono NF CN, Microsoft YaHei UI',
  }],
  ['maple', 'default', {
    textFontFamily: 'Maple Mono NF CN Latin, Microsoft YaHei UI',
    codeFontFamily: 'Maple Mono NF CN Latin, Microsoft YaHei UI',
    terminalFontFamily: 'Maple Mono NF CN Latin, Microsoft YaHei UI',
  }],
  ['maple', 'maple', currentMaple],
];
for (const [english, chinese, expected] of combinations) {
  test(`two-choice language combination ${english}/${chinese} composes, matches and merges only families`, async () => {
    const patch = composeFontLanguages(catalog, english, chinese);
    assert.deepEqual(patch, expected);
    assert.deepEqual(matchFontLanguages(patch, catalog), { english, chinese, exact: true });
    const preferences = { preference: 'custom-theme', textFontSize: 18, codeFontSize: 14, terminalFontSize: 12, other: { keep: true } };
    const native = controller({ value: preferences, revision: 21 });
    const actions = createFontActions(native);
    const result = await actions.setLanguages(english, chinese);
    const unchanged = english === 'default' && chinese === 'default';
    assert.deepEqual(readFontFields(result), expected);
    assert.deepEqual(result.languages, { english, chinese, exact: true });
    assert.equal(result.preset, english === chinese ? english : 'custom');
    assert.equal(result.changed, !unchanged);
    assert.equal(result.revision, unchanged ? 21 : 22);
    for (const [key, value] of Object.entries(preferences)) {
      assert.deepEqual(native.view.value[key], value);
      assert.deepEqual(native.view.user[key], value);
    }
    if (!unchanged) assert.deepEqual(native.calls, [{ ns: 'include:ui-theme', patch: expected, revision: 21 }]);
    assert.equal((await actions.setLanguages(english, chinese)).changed, false);
    assert.equal(native.calls.length, unchanged ? 0 : 1);
  });
}

test('existing stored full Maple stack stays selected and produces no writes', async () => {
  const native = controller({ value: { ...currentMaple, preference: 'oat' }, revision: 44 });
  const actions = createFontActions(native);
  const saved = actions.get();
  assert.equal(saved.preset, 'maple');
  assert.deepEqual(saved.languages, { english: 'maple', chinese: 'maple', exact: true });
  assert.equal((await actions.set('maple')).changed, false);
  assert.equal((await actions.setLanguages('maple', 'maple')).changed, false);
  assert.equal(actions.get().revision, 44);
  assert.equal(native.calls.length, 0);
});

test('both preset actions share composition and default clears only font overrides', async () => {
  const native = controller({ value: { ...currentMaple, preference: 'mist', textFontSize: 17, codeFontSize: 13, terminalFontSize: 14 } });
  const actions = createFontActions(native);
  for (const preset of PRESET_IDS) {
    const value = await actions.set(preset);
    assert.equal(value.preset, preset);
    assert.deepEqual(readFontFields(value), buildFontPatch(catalog, preset));
    assert.deepEqual(value.languages, { english: preset, chinese: preset, exact: true });
  }
  assert.deepEqual(native.calls[0].patch, empty);
  assert.deepEqual(native.calls[1].patch, currentMaple);
  assert.equal(native.view.value.preference, 'mist');
  assert.equal(native.view.value.textFontSize, 17);
  assert.equal(native.view.value.codeFontSize, 13);
  assert.equal(native.view.value.terminalFontSize, 14);
});

test('removed IDs and arbitrary CSS are refused before reading or writing settings', async () => {
  const native = controller();
  const actions = createFontActions(native);
  for (const id of [...removed, '', 'Maple Mono NF CN', undefined, null]) {
    await assert.rejects(actions.set(id), /Invalid font preset/);
    await assert.rejects(actions.setLanguages(id, 'default'), /Invalid font languages/);
    await assert.rejects(actions.setLanguages('default', id), /Invalid font languages/);
  }
  assert.equal(native.reads, 0);
  assert.equal(native.calls.length, 0);
});

test('catalogs and output schemas expose exactly two choice IDs, with custom allowed only as match status', async () => {
  const native = controller();
  const tool = register(native).definition;
  const value = await tool.execute({ action: 'get' }, {});
  assert.deepEqual(value.catalog.map(record => record.id), ['default', 'maple']);
  assert.deepEqual(value.languageCatalog.english.map(record => record.id), ['default', 'maple']);
  assert.deepEqual(value.languageCatalog.chinese.map(record => record.id), ['default', 'maple']);
  assert.deepEqual(tool.parameters.properties.preset.enum, ['default', 'maple']);
  assert.deepEqual(tool.parameters.properties.english.enum, ['default', 'maple']);
  assert.deepEqual(tool.parameters.properties.chinese.enum, ['default', 'maple']);
  assert.deepEqual(tool.output.schema.properties.preset.enum, ['default', 'maple', 'custom']);
  assert.deepEqual(tool.output.schema.properties.catalog.items.properties.id.enum, ['default', 'maple']);
  const languageSchema = tool.output.schema.properties.languageCatalog.properties;
  assert.deepEqual(languageSchema.english.items.properties.id.enum, ['default', 'maple']);
  assert.deepEqual(languageSchema.chinese.items.properties.id.enum, ['default', 'maple']);
  for (const id of removed.filter(id => id !== 'custom')) {
    assert.doesNotMatch(JSON.stringify(tool.parameters), new RegExp(`"${id}"`));
    assert.doesNotMatch(JSON.stringify(tool.output.schema), new RegExp(`"${id}"`));
  }
  assert.equal(native.calls.length, 0);
});

test('quotes and all whitespace normalize for no-op while saved spellings are preserved', async () => {
  const quoted = Object.fromEntries(FONT_FIELDS.map(field => [field, ' "Maple  Mono NF CN Latin" ,\n\'Maple Mono NF CN\',\tMicrosoft YaHei UI ']));
  const native = controller({ value: quoted, revision: 15 });
  const result = await createFontActions(native).set('maple');
  assert.equal(result.changed, false);
  assert.equal(result.revision, 15);
  assert.deepEqual(readFontFields(result), quoted);
  assert.equal(native.calls.length, 0);
  assert.equal(normalizeFontFamily(' "Segoe\nUI" , Microsoft\tYaHei UI '), 'Segoe UI,Microsoft YaHei UI');
});

test('unknown saved families stay custom without exposing removed choices or rewriting settings', () => {
  const native = controller({ value: { textFontFamily: 'Unlisted Custom Font', codeFontFamily: 'Other', terminalFontFamily: 'Other' } });
  const result = createFontActions(native).get();
  assert.equal(result.preset, 'custom');
  assert.equal(result.languages, null);
  assert.equal(native.calls.length, 0);
  const partial = { ...currentMaple, terminalFontFamily: 'Custom terminal' };
  assert.deepEqual(matchFontLanguages(partial, catalog), { english: 'maple', chinese: 'maple', exact: false });
  assert.equal(matchFontPreset(partial, catalog), 'custom');
});

test('read-only get works but every set refuses, including otherwise equal defaults', async () => {
  const native = controller({ writable: false });
  const actions = createFontActions(native);
  assert.equal(actions.get().writable, false);
  await assert.rejects(actions.set('default'), /read-only/);
  await assert.rejects(actions.set('maple'), /read-only/);
  await assert.rejects(actions.setLanguages('default', 'default'), /read-only/);
  assert.equal(native.calls.length, 0);
});

test('missing native namespace fails explicitly while both inspected aliases work', async () => {
  const absent = controller({ namespaces: [{ ns: 'theme', value: {}, revision: 1 }] });
  const actions = createFontActions(absent);
  assert.throws(() => actions.get(), /namespace is absent/);
  await assert.rejects(actions.set('maple'), /namespace is absent/);
  await assert.rejects(actions.setLanguages('maple', 'maple'), /namespace is absent/);
  assert.equal(absent.calls.length, 0);
  for (const ns of ['include:ui-theme', 'ui-theme']) {
    const native = controller({ ns, revision: 31 });
    await createFontActions(native).set('maple');
    assert.deepEqual(native.calls, [{ ns, patch: currentMaple, revision: 31 }]);
  }
});

test('native conflicts and rejections propagate unchanged without retry or replacement', async () => {
  for (const code of ['settings/conflict', 'settings/rejected']) {
    const native = controller({ revision: 88 });
    const failure = Object.assign(new Error('Native provider refused'), { code });
    native.update = async (...args) => { native.calls.push(args); throw failure; };
    await assert.rejects(createFontActions(native).set('maple'), error => error === failure);
    assert.deepEqual(native.calls, [['include:ui-theme', currentMaple, 88]]);
    assert.equal(native.reads, 1);
  }
});

test('each successful set uses the latest described revision', async () => {
  const native = controller();
  const actions = createFontActions(native);
  await actions.set('maple');
  await actions.setLanguages('default', 'maple');
  await actions.set('default');
  assert.deepEqual(native.calls.map(call => call.revision), [8, 9, 10]);
  assert.equal(native.reads, 3);
});

test('returned catalogs and matching objects cannot mutate shared data', () => {
  const actions = createFontActions(controller());
  const value = actions.get();
  value.catalog[0].textFontFamily = 'Corrupt';
  value.languageCatalog.english[0].text = 'Corrupt';
  value.languageCatalog.chinese.push({ id: 'extra' });
  value.languages.english = 'maple';
  assert.deepEqual(actions.get().languageCatalog, records);
  assert.deepEqual(actions.get().catalog, [{ id: 'default', ...empty }, { id: 'maple', ...currentMaple }]);
  assert.deepEqual(actions.get().languages, { english: 'default', chinese: 'default', exact: true });
});

test('flat tool parameters are strictly validated and registration returns the effect disposer', async () => {
  assert.deepEqual(inject, ['settingsController', 'tools']);
  const native = controller();
  const registration = register(native);
  const tool = registration.definition;
  assert.equal(tool.name, 'stylelab_font');
  assert.deepEqual(tool.parameters.properties.action.enum, ['get', 'set', 'set_languages']);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.doesNotMatch(JSON.stringify(tool.parameters), /oneOf/);
  for (const args of [null, [], {}, { action: 'install' }, { action: 'set' }, { action: 'set', preset: 'rubik' },
    { action: 'get', english: 'maple' }, { action: 'set_languages', english: 'maple' },
    { action: 'set_languages', chinese: 'maple' }, { action: 'set_languages', english: 'maple', chinese: 'maple', preset: 'maple' }]) {
    await assert.rejects(tool.execute(args, {}), TypeError);
  }
  assert.equal(native.reads, 0);
  const saved = await tool.execute({ action: 'set_languages', english: 'maple', chinese: 'default' }, {});
  assert.deepEqual(tool.output.render({}, saved), [{ type: 'text', text: JSON.stringify(saved) }]);
  assert.equal(registration.cleanup, registration.dispose);
  registration.cleanup();
  assert.equal(registration.disposed, true);
});

test('pure readers default missing fields and validation rejects malformed or extended catalogs', () => {
  for (const value of [null, undefined, [], {}, { textFontFamily: null }]) assert.deepEqual(readFontFields(value), empty);
  for (const value of [null, [], {}, { ...records, extra: [] }]) assert.throws(() => validateFontLanguages(value), TypeError);
  for (const alter of [
    value => value.english.pop(), value => value.chinese.push({ id: 'other', family: 'Other' }),
    value => { value.english[1].id = 'default'; }, value => { value.chinese[1].id = 'noto'; },
    value => { value.english[0].label = 'System'; }, value => { value.english[0].text = null; },
    value => { value.chinese[0].family = ''; }, value => { value.english[0].terminal = 'x'.repeat(129); },
  ]) {
    const value = structuredClone(records);
    alter(value);
    assert.throws(() => validateFontLanguages(value), TypeError);
  }
});
