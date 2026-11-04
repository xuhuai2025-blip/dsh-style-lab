import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const themes = JSON.parse(source.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
const fonts = JSON.parse(source.match(/const FONT_LANGUAGES = (\{[\s\S]*?\n    \});/)[1]);
// Pure helpers plus domain-service mocks only. No factory, DOM, React or real settings.
const helperSource = source.slice(source.indexOf('function composeFontLanguages('), source.indexOf('    const DICTS ='));
const { preserve, createGuard } = new Function('FONT_LANGUAGES', 'THEMES',
  `${helperSource}; return { preserve: customThemeForSettingsRefresh, createGuard: createThemeRefreshGuard };`)(fonts, themes);
const builtins = ['system', 'light', 'dark'];
const families = Object.freeze({ text: '', code: '', terminal: '' });
const sizes = Object.freeze({ text: 14, code: 12, terminal: 13 });
const maple = Object.freeze({ text: 'Maple Mono NF CN Latin, Maple Mono NF CN, Microsoft YaHei UI', code: 'Maple Mono NF CN Latin, Maple Mono NF CN, Microsoft YaHei UI', terminal: 'Maple Mono NF CN Latin, Maple Mono NF CN, Microsoft YaHei UI' });
function ready(preference = 'system', extra = {}) {
  return Object.freeze({ status: 'ready', value: Object.freeze({ preference, ...extra }) });
}
function snapshot(preference = themes[0].id, patch = {}) {
  return Object.freeze({ preference, themes, fontFamilies: families, fontSizes: sizes, ...patch });
}
function adoptedSnapshot(preference, patch = {}) {
  return snapshot(preference, { ...patch,
    fontFamilies: Object.freeze({ ...(patch.fontFamilies ?? families) }),
    fontSizes: Object.freeze({ ...(patch.fontSizes ?? sizes) }),
  });
}

/** Stable reference snapshots with explicit domain events and an owned deferred queue. */
function harness({ preference = themes[0].id, durable = 'system', initialTheme, initialScope, onAcceptedSelection } = {}) {
  let currentTheme = initialTheme ?? snapshot(preference);
  let currentScope = initialScope ?? ready(durable);
  const listeners = new Set();
  const deferred = [];
  const restores = [];
  let disposals = 0;
  let schedules = 0;
  function emit() {
    for (const listener of [...listeners]) listener(currentTheme);
  }
  function setPreference(id, fromGuard) {
    if (fromGuard) restores.push(id);
    if (id === currentTheme.preference) return; // Native same-selection early return.
    currentTheme = snapshot(id, { ...currentTheme, preference: id });
    emit();
  }
  const theme = { getTheme: () => currentTheme, setTheme: id => setPreference(id, true) };
  const form = { getSnapshot: () => currentScope };
  const guard = createGuard(theme, form, listener => {
    listeners.add(listener);
    return () => { disposals += 1; listeners.delete(listener); };
  }, callback => { schedules += 1; deferred.push(callback); }, onAcceptedSelection);
  return {
    guard, restores, deferred,
    get current() { return currentTheme; },
    get scope() { return currentScope; },
    get schedules() { return schedules; },
    get disposals() { return disposals; },
    get listeners() { return listeners.size; },
    publish(patch = {}, scope = currentScope) {
      currentScope = scope;
      currentTheme = snapshot(currentTheme.preference, { ...currentTheme, ...patch });
      emit();
      return currentTheme;
    },
    refresh(patch = {}, scope = ready(currentScope.value.preference)) {
      // Native adopt rebuilds both frozen records even when their VALUES are unchanged.
      return this.publish({ preference: scope.value?.preference ?? 'system', ...patch,
        fontFamilies: Object.freeze({ ...(patch.fontFamilies ?? currentTheme.fontFamilies) }),
        fontSizes: Object.freeze({ ...(patch.fontSizes ?? currentTheme.fontSizes) }),
      }, scope);
    },
    externalSet(id) { setPreference(id, false); },
    choose(id) { guard.onSelection(id); setPreference(id, false); },
    silentScope(scope) { currentScope = scope; },
    silentTheme(patch) { currentTheme = snapshot(currentTheme.preference, { ...currentTheme, ...patch }); },
    flush() {
      let count = 0;
      while (deferred.length) {
        assert.ok(++count <= 20, 'Guard must not create a restoration loop');
        deferred.shift()();
      }
      return count;
    },
  };
}

for (const own of themes) {
  for (const builtin of builtins) {
    test(`predicate preserves ${own.id} across unrelated settings refresh with durable ${builtin}`, () => {
      const before = snapshot(own.id);
      const beforeScope = ready(builtin);
      const afterScope = ready(builtin, { model: 'a-new-model' });
      const modelOnly = adoptedSnapshot(builtin);
      assert.equal(preserve(before, modelOnly, beforeScope, afterScope), own.id);
      assert.equal(preserve(before, adoptedSnapshot(builtin, { fontFamilies: maple }), beforeScope, afterScope), own.id);
      assert.equal(preserve(before, adoptedSnapshot(builtin, { fontSizes: { ...sizes, text: 18 } }), beforeScope, afterScope), own.id);
      assert.equal(preserve(before, adoptedSnapshot(builtin, { fontFamilies: maple, fontSizes: { ...sizes, code: 16 } }), beforeScope, afterScope), own.id);
      // Even unchanged value identity is a new ConfigForm snapshot wave.
      const sameValueNewSnapshot = Object.freeze({ status: 'ready', value: beforeScope.value });
      assert.equal(preserve(before, modelOnly, beforeScope, sameValueNewSnapshot), own.id);
    });
  }
}

test('predicate rejects local same-scope selection, changed appearance, absent registration and non-owned themes', () => {
  const before = snapshot();
  const a = ready('system');
  const b = ready('system');
  const after = adoptedSnapshot('system');
  assert.equal(preserve(before, after, a, a), null);
  assert.equal(preserve(before, adoptedSnapshot('dark'), a, ready('dark')), null);
  assert.equal(preserve(before, adoptedSnapshot('dark'), a, b), null);
  assert.equal(preserve(before, adoptedSnapshot(themes[1].id), a, b), null);
  assert.equal(preserve(before, adoptedSnapshot('system', { themes: themes.slice(1) }), a, b), null);
  assert.equal(preserve(snapshot('other-plugin', { themes: [...themes, { id: 'other-plugin' }] }), after, a, b), null);
  for (const builtin of builtins) assert.equal(preserve(snapshot(builtin), after, a, b), null);
});

test('predicate requires ready scope snapshots and valid built-in durable preferences on both sides', () => {
  const invalid = [undefined, null, { status: 'loading' }, { status: 'error' }, { status: 'ready' },
    { status: 'ready', value: null }, ready('unknown'), ready(themes[0].id), ready('')];
  for (const scope of invalid) {
    assert.equal(preserve(snapshot(), adoptedSnapshot('system'), scope, ready('system')), null);
    assert.equal(preserve(snapshot(), adoptedSnapshot('system'), ready('system'), scope), null);
  }
});

test('predicate requires both adoption record references to rebuild, not merely a new scope', () => {
  const before = snapshot();
  const oldScope = ready('system');
  const newScope = ready('system');
  assert.equal(preserve(before, snapshot('system'), oldScope, newScope), null);
  assert.equal(preserve(before, snapshot('system', { fontFamilies: { ...families } }), oldScope, newScope), null);
  assert.equal(preserve(before, snapshot('system', { fontSizes: { ...sizes } }), oldScope, newScope), null);
  assert.equal(preserve(before, adoptedSnapshot('system'), oldScope, newScope), themes[0].id);
});

test('stale scope change followed by explicit native selection preserves native intent when adoption was skipped', () => {
  for (const builtin of builtins) {
    const h = harness();
    const before = h.current;
    const oldScope = h.scope;
    // An in-flight native write can expose a new ConfigForm scope while adopt is skipped.
    h.silentScope(ready('system', { pendingNativeWrite: true }));
    h.externalSet(builtin);
    assert.notEqual(h.scope, oldScope);
    assert.equal(h.current.fontFamilies, before.fontFamilies);
    assert.equal(h.current.fontSizes, before.fontSizes);
    h.flush();
    assert.equal(h.current.preference, builtin);
    assert.deepEqual(h.restores, []);
    h.refresh({}, ready(builtin));
    h.flush();
    assert.deepEqual(h.restores, []);
  }
});

test('model-dropdown settings wave with unchanged fonts queues one runtime-only custom restoration', () => {
  const h = harness();
  const beforeFamilies = h.current.fontFamilies;
  const beforeSizes = h.current.fontSizes;
  const beforeScope = h.scope;
  // A model change elsewhere can replace the form snapshot without changing ui-theme values.
  const modelRefresh = Object.freeze({ status: 'ready', value: beforeScope.value });
  const adoption = h.refresh({}, modelRefresh);
  assert.notEqual(h.scope, beforeScope);
  assert.equal(h.scope.value, beforeScope.value);
  assert.notEqual(adoption.fontFamilies, beforeFamilies);
  assert.notEqual(adoption.fontSizes, beforeSizes);
  assert.equal(h.current.preference, 'system');
  assert.equal(h.deferred.length, 1);
  assert.deepEqual(h.restores, []);
  h.flush();
  assert.equal(h.current.preference, themes[0].id);
  assert.equal(h.current.fontFamilies, adoption.fontFamilies);
  assert.equal(h.current.fontSizes, adoption.fontSizes);
  assert.deepEqual(h.current.fontFamilies, beforeFamilies);
  assert.deepEqual(h.current.fontSizes, beforeSizes);
  assert.deepEqual(h.restores, [themes[0].id]);
  assert.equal(h.deferred.length, 0);
});

for (const own of themes) {
  test(`guard preserves ${own.id} and newly saved font families and sizes`, () => {
    const h = harness({ preference: own.id });
    const fontAdoption = h.refresh({ fontFamilies: maple });
    h.flush();
    assert.equal(h.current.preference, own.id);
    assert.equal(h.current.fontFamilies, fontAdoption.fontFamilies);
    assert.deepEqual(h.current.fontFamilies, maple);
    const larger = Object.freeze({ ...sizes, text: 19, terminal: 15 });
    const sizeAdoption = h.refresh({ fontSizes: larger });
    h.flush();
    assert.equal(h.current.preference, own.id);
    assert.equal(h.current.fontFamilies, sizeAdoption.fontFamilies);
    assert.equal(h.current.fontSizes, sizeAdoption.fontSizes);
    assert.deepEqual(h.current.fontFamilies, maple);
    assert.deepEqual(h.current.fontSizes, larger);
    assert.deepEqual(h.restores, [own.id, own.id]);
  });
}

for (const builtin of builtins) {
  test(`explicit local ${builtin} selection with the same ConfigForm reference is never undone`, () => {
    const h = harness();
    const scope = h.scope;
    h.externalSet(builtin);
    assert.equal(h.scope, scope);
    h.flush();
    assert.equal(h.current.preference, builtin);
    assert.deepEqual(h.restores, []);
    // The following queued durable write/global-config echo must not resurrect the custom theme.
    h.refresh({}, ready(builtin));
    h.flush();
    assert.equal(h.current.preference, builtin);
    assert.deepEqual(h.restores, []);
  });
}

test('explicit remote appearance preference change is respected, including while a restoration is pending', () => {
  for (const pending of [false, true]) {
    const h = harness();
    if (pending) h.refresh();
    h.refresh({}, ready('dark', { model: 'changed-too' }));
    h.flush();
    assert.equal(h.current.preference, 'dark');
    assert.deepEqual(h.restores, []);
    h.refresh({}, ready('dark'));
    h.flush();
    assert.deepEqual(h.restores, []);
  }
});

test('StyleLab Default selection cancels pending restoration even when native setTheme early-returns', () => {
  const h = harness();
  h.refresh();
  const alreadyBuiltin = h.current;
  h.choose('system');
  assert.equal(h.current, alreadyBuiltin);
  h.flush();
  assert.equal(h.current.preference, 'system');
  assert.deepEqual(h.restores, []);
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, []);
});

test('explicit other-builtin event cancels pending intent before its durable write', () => {
  const h = harness();
  h.refresh();
  h.externalSet('light');
  h.flush();
  assert.equal(h.current.preference, 'light');
  assert.deepEqual(h.restores, []);
  h.refresh({}, ready('light'));
  h.flush();
  assert.deepEqual(h.restores, []);
});

test('switching custom A to custom B while pending never restores A and preserves B on the next wave', () => {
  const h = harness();
  h.refresh();
  h.choose(themes[1].id);
  h.flush();
  assert.equal(h.current.preference, themes[1].id);
  assert.deepEqual(h.restores, []);
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, [themes[1].id]);
});

test('reselecting the same custom theme keeps ownership even when no theme event fires', () => {
  const h = harness({ preference: themes[2].id });
  const original = h.current;
  h.choose(themes[2].id);
  assert.equal(h.current, original);
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, [themes[2].id]);
});

test('reselecting a custom theme during a pending default snapshot cancels stale work but tracks future waves', () => {
  const h = harness({ preference: themes[2].id });
  h.refresh();
  h.choose(themes[2].id);
  h.flush();
  assert.equal(h.current.preference, themes[2].id);
  assert.deepEqual(h.restores, []);
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, [themes[2].id]);
});

test('a new custom choice and another settings wave within the same deferred burst restore only the new choice', () => {
  const h = harness();
  h.refresh();
  h.choose(themes[1].id);
  h.refresh({ fontFamilies: maple });
  h.flush();
  assert.equal(h.current.preference, themes[1].id);
  assert.deepEqual(h.current.fontFamilies, maple);
  assert.deepEqual(h.restores, [themes[1].id]);
});

test('multiple built-in settings refreshes coalesce to one owned task and latest fonts/sizes/scope', () => {
  const h = harness();
  h.refresh({}, ready('system', { model: 'one' }));
  h.refresh({ fontFamilies: maple }, ready('system', { model: 'two' }));
  const bigger = Object.freeze({ ...sizes, code: 17 });
  const newest = ready('system', { model: 'three' });
  const latestAdoption = h.refresh({ fontSizes: bigger }, newest);
  assert.equal(h.deferred.length, 1);
  assert.equal(h.schedules, 1);
  h.flush();
  assert.equal(h.current.preference, themes[0].id);
  assert.deepEqual(h.current.fontFamilies, maple);
  assert.deepEqual(h.current.fontSizes, bigger);
  assert.equal(h.current.fontFamilies, latestAdoption.fontFamilies);
  assert.equal(h.current.fontSizes, latestAdoption.fontSizes);
  assert.equal(h.scope, newest);
  assert.deepEqual(h.restores, [themes[0].id]);
});

test('unrelated same-scope registry/token snapshots update pending identity without clearing intent', () => {
  const h = harness();
  h.refresh();
  const sameScope = h.scope;
  h.publish({ themes: [...themes], tokens: { accent: 'changed' } });
  h.publish({ themes: [...themes], tokens: { accent: 'changed-again' } });
  assert.equal(h.scope, sameScope);
  assert.equal(h.deferred.length, 1);
  h.flush();
  assert.deepEqual(h.restores, [themes[0].id]);
  assert.equal(h.current.tokens.accent, 'changed-again');
});

test('unregistering the requested custom theme cancels pending work and does not revive on re-registration', () => {
  const h = harness();
  h.refresh();
  h.publish({ themes: themes.slice(1) });
  h.flush();
  assert.deepEqual(h.restores, []);
  h.publish({ themes });
  h.refresh();
  h.flush();
  assert.equal(h.current.preference, 'system');
  assert.deepEqual(h.restores, []);
});

test('a different plugin custom theme is never overridden by this guard', () => {
  const h = harness();
  h.refresh();
  h.publish({ preference: 'other-plugin-theme', themes: [...themes, { id: 'other-plugin-theme' }] });
  h.flush();
  assert.equal(h.current.preference, 'other-plugin-theme');
  assert.deepEqual(h.restores, []);
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, []);
});

test('flush rejects a stale current theme reference even if preference remains the same built-in', () => {
  const h = harness();
  h.refresh();
  h.silentTheme({ tokens: { newerUnobservedSnapshot: true } });
  h.flush();
  assert.equal(h.current.preference, 'system');
  assert.deepEqual(h.restores, []);
});

test('flush rejects stale current ConfigForm references, with same or changed durable preference', () => {
  for (const durable of ['system', 'dark']) {
    const h = harness();
    h.refresh();
    h.silentScope(ready(durable));
    h.flush();
    assert.deepEqual(h.restores, []);
  }
});

test('disposed guards remove their listener and make already queued work inert', () => {
  const h = harness();
  assert.equal(h.listeners, 1);
  h.refresh();
  h.guard.dispose();
  assert.equal(h.listeners, 0);
  assert.equal(h.disposals, 1);
  h.flush();
  h.refresh();
  h.flush();
  assert.deepEqual(h.restores, []);
});

test('custom restoration itself never requeues or loops, and built-in initial state stays native', () => {
  const h = harness();
  h.refresh();
  assert.equal(h.flush(), 1);
  assert.equal(h.schedules, 1);
  assert.equal(h.deferred.length, 0);
  assert.deepEqual(h.restores, [themes[0].id]);
  const native = harness({ preference: 'system' });
  native.refresh({ fontFamilies: maple });
  native.flush();
  assert.deepEqual(native.restores, []);
  native.choose(themes[2].id);
  native.refresh();
  native.flush();
  assert.deepEqual(native.restores, [themes[2].id]);
});

test('invalid StyleLab selection clears queued work rather than inventing a restorable theme', () => {
  const h = harness();
  h.refresh();
  h.guard.onSelection('not-registered');
  h.flush();
  assert.deepEqual(h.restores, []);
});

test('public ConfigForm dependency and owned guard wiring avoid service patches or persistence', () => {
  const inject = source.match(/^\s*inject:\s*\[([^\]]+)\]/m)[1];
  assert.match(inject, /'configForms'/);
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  assert.match(source, /createThemeRefreshGuard\(ctx\.theme,\s*ctx\.configForms\.get\('ui-theme'\),\s*listener => ctx\.on\('theme\/change', listener\),\s*queueMicrotask(?:\s*,|\))/);
  const binding = source.match(/const (\w+) = createThemeRefreshGuard\(ctx\.theme,/);
  assert.ok(binding);
  const guardName = binding[1];
  const hook = source.match(new RegExp(`(\\w+) = ${guardName}\\.onSelection`));
  assert.ok(hook, 'Owned onSelection hook is saved for choose');
  const chooseStart = source.indexOf('function choose(id)');
  const chooseEnd = source.indexOf('\n          return ', chooseStart);
  const choose = source.slice(chooseStart, chooseEnd < 0 ? undefined : chooseEnd);
  assert.ok(choose.indexOf(`${hook[1]}(id)`) >= 0);
  assert.ok(choose.indexOf(`${hook[1]}(id)`) < choose.indexOf('ctx.theme.setTheme(id)'));
  assert.match(source, new RegExp(`${guardName}\\.dispose`));
  const guardStart = helperSource.indexOf('function createThemeRefreshGuard(');
  const persistenceStart = helperSource.indexOf('function createSkinPersistence(', guardStart);
  const guardCode = helperSource.slice(guardStart, persistenceStart < 0 ? undefined : persistenceStart);
  assert.doesNotMatch(guardCode, /\.update\(|\.replace\(|ctx\.|remote\.|localStorage|sessionStorage|document\.|React\.|\.setTheme\s*=/);
});

for (const builtin of builtins) {
  test(`accepted-selection callback records true external ${builtin} intent but not its settings echo`, () => {
    const accepted = [];
    const h = harness({ onAcceptedSelection: id => accepted.push(id) });
    h.externalSet(builtin);
    assert.deepEqual(accepted, [builtin]);
    h.refresh({}, ready(builtin));
    h.flush();
    assert.deepEqual(accepted, [builtin]);
    assert.deepEqual(h.restores, []);
  });
}

test('accepted-selection callback records a remote durable appearance change once, not later same-preference model waves', () => {
  const accepted = [];
  const h = harness({ onAcceptedSelection: id => accepted.push(id) });
  const before = h.current;
  h.refresh({}, ready('dark'));
  assert.notEqual(h.current.fontFamilies, before.fontFamilies);
  assert.notEqual(h.current.fontSizes, before.fontSizes);
  h.flush();
  assert.equal(h.current.preference, 'dark');
  assert.deepEqual(accepted, ['dark']);
  assert.deepEqual(h.restores, []);
  h.refresh({}, ready('dark', { model: 'new-model' }));
  h.refresh({ fontFamilies: maple, fontSizes: { ...sizes, text: 18 } }, ready('dark'));
  h.flush();
  assert.deepEqual(accepted, ['dark']);
  assert.deepEqual(h.restores, []);
});

test('accepted-selection callback records an external owned skin change, not a marked startup/UI selection', () => {
  const accepted = [];
  const h = harness({ onAcceptedSelection: id => accepted.push(id) });
  h.externalSet(themes[1].id);
  assert.deepEqual(accepted, [themes[1].id]);
  h.choose(themes[2].id);
  h.choose('system');
  assert.deepEqual(accepted, [themes[1].id]);
});

test('background model/font/size adoption, automatic restoration and registry waves never notify accepted selection', () => {
  const accepted = [];
  const h = harness({ onAcceptedSelection: id => accepted.push(id) });
  h.refresh({ fontFamilies: maple, fontSizes: { ...sizes, text: 20 } });
  h.publish({ themes: [...themes], tokens: { changed: true } });
  h.flush();
  assert.deepEqual(h.restores, [themes[0].id]);
  assert.deepEqual(accepted, []);
});

test('unregister fallback and disposed events do not persist a synthetic native selection', () => {
  const accepted = [];
  const h = harness({ onAcceptedSelection: id => accepted.push(id) });
  h.publish({ preference: 'system', themes: themes.slice(1) });
  assert.deepEqual(accepted, []);
  h.guard.dispose();
  h.externalSet('dark');
  assert.deepEqual(accepted, []);
});
