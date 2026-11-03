import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeFontLanguages as hostCompose, matchFontLanguages as hostMatch } from '../simple-fonts-core.js';
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const languageCatalog = JSON.parse(readFileSync(new URL('../simple-font-languages.json', import.meta.url), 'utf8'));
const clientLanguages = JSON.parse(source.match(/const FONT_LANGUAGES = (\{[\s\S]*?\n    \});/)[1]);
const themes = JSON.parse(source.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
// Execute only pure helpers: no Client factory, DOM, renderer or React stand-ins.
const helpers = source.slice(source.indexOf('function composeFontLanguages('), source.indexOf('    const DICTS ='));
const { preserve, compose, matchLanguages } = new Function('FONT_LANGUAGES', 'THEMES', `${helpers}; return {preserve:customThemeForSettingsRefresh,compose:composeFontLanguages,matchLanguages:matchingFontLanguages};`)(clientLanguages, themes);
const sizes = { text: 14, code: 11, terminal: 13 };
const empty = { text: '', code: '', terminal: '' };
const asRoles = patch => ({ text: patch.textFontFamily, code: patch.codeFontFamily, terminal: patch.terminalFontFamily });

test('GUI and agent expose only default and Maple with identical catalogs', () => {
  assert.deepEqual(clientLanguages, languageCatalog);
  for (const group of Object.values(clientLanguages)) assert.deepEqual(group.map(record => record.id), ['default', 'maple']);
  assert.doesNotMatch(source, /FONT_PRESETS|Rubik|Ubuntu|YouYuan|Noto Sans|DejaVu|华文细黑|幼圆/);
  assert.match(source, /fontDefault: '系统默认', fontMaple: 'Maple Mono NF CN'/);
  assert.match(source, /ctx.remote.settings.update\(namespace.ns, \{ textFontFamily, codeFontFamily, terminalFontFamily \}, namespace.revision\)/);
  assert.doesNotMatch(source, /ctx.theme.setFontFamily|localStorage|\.style\s*=/);
});

test('all four combinations match native Host helpers and preserve saved Maple identification', () => {
  let count = 0;
  for (const en of languageCatalog.english) for (const cn of languageCatalog.chinese) {
    const patch = compose(en.id, cn.id);
    assert.deepEqual(patch, hostCompose(languageCatalog, en.id, cn.id));
    assert.deepEqual(matchLanguages(asRoles(patch)), { english: en.id, chinese: cn.id, exact: true });
    assert.deepEqual(matchLanguages(asRoles(patch)), hostMatch(patch, languageCatalog));
    if (en.id !== 'default' || cn.id !== 'default') {
      assert.equal(patch.textFontFamily.split(', ')[0], en.text);
      assert.ok(patch.textFontFamily.split(', ').includes(cn.family));
    }
    count += 1;
  }
  assert.equal(count, 4);
  for (const removed of ['rubik','ubuntu','consolas','dejavu','youyuan','noto','stxihei','native','custom']) assert.equal(compose(removed, 'maple'), null);
  assert.deepEqual(compose('default', 'default'), { textFontFamily: '', codeFontFamily: '', terminalFontFamily: '' });
  for (const value of Object.values(compose('maple', 'maple'))) assert.equal(value, 'Maple Mono NF CN Latin, Maple Mono NF CN, Microsoft YaHei UI');
  assert.equal(matchLanguages({ ...empty, text: 'Unknown Family' }), null);
});

test('global row keeps selector-matched previews, drafts and explicit apply/reset', () => {
  assert.ok(source.indexOf('h(FontPicker),') < source.indexOf("h('div', { className: 'sl-list' }"));
  assert.match(source, /languageColumn\('english', 'fontEnglish', englishLabels, 'fontEnglishSample', 'en'\)/);
  assert.match(source, /languageColumn\('chinese', 'fontChinese', chineseLabels, 'fontChineseSample', 'zh-CN'\)/);
  assert.ok(source.indexOf("languageColumn('english'") < source.indexOf("languageColumn('chinese'"));
  const column = source.slice(source.indexOf('function languageColumn('), source.indexOf("return h('section', { className: 'sl-fonts'"));
  assert.match(column, /className: 'sl-font-language'/);
  assert.match(column, /languageSelect\(language, label, labels\)/);
  assert.match(column, /className: 'sl-font-sample', lang, style: \{ fontFamily: previewFamily \}/);
  assert.doesNotMatch(source, /sl-font-samples/);
  assert.match(source, /onChange: event => setDraft\(\{ \.\.\.chosen, \[language\]: event.target.value \}\)/);
  assert.match(source, /onClick: \(\) => saveFonts\(chosen\)/);
  assert.match(source, /saveFonts\(\{ english: 'default', chinese: 'default' \}\)/);
  assert.match(source, /chosen\[language\] === 'custom' \? h\('option', \{ value: 'custom', disabled: true \}/);
  assert.match(source, /disabled: saving \|\| !writable \|\| !combined \|\| unchanged/);
  assert.match(source, /var\(--dsh-font-family-text-default, system-ui\)/);
  assert.match(source, /title: '风格工坊'/);
  assert.match(source, /让灵感自然流动。/);
  assert.match(source, /Make something wonderful\./);
  assert.doesNotMatch(source, /圆润开发|Aa 012345|t\('fontSample'\)/);
  assert.match(source, /font-family:var\(--dsh-font-family-text,inherit\)/);
});

test('every consumed Remote namespace is explicitly injected as a traced child service', () => {
  const declaration = source.match(/^\s*inject:\s*\[([^\]]+)\]/m)[1];
  const dependencies = [...declaration.matchAll(/'([^']+)'/g)].map(match => match[1]);
  const namespaces = new Set([...source.matchAll(/ctx\.remote\.([A-Za-z]\w*)\./g)].map(match => match[1]));
  assert.ok(namespaces.has('settings'));
  assert.ok(dependencies.includes('remote'));
  for (const namespace of namespaces) assert.ok(dependencies.includes('remote.' + namespace), `Missing inject for remote.${namespace}`);
});

test('settings refresh preserves custom themes across model, family and size changes but respects appearance intent', () => {
  const before = { preference: themes[0].id, fontFamilies: empty, fontSizes: sizes, themes };
  const changed = asRoles(compose('maple','maple'));
  const after = { preference: 'system', fontFamilies: { ...changed }, fontSizes: { ...sizes }, themes };
  const beforeScope = { status: 'ready', value: { preference: 'system', model: 'before' } };
  const afterScope = { status: 'ready', value: { preference: 'system', model: 'after' } };
  for (const theme of themes) {
    assert.equal(preserve({ ...before, preference: theme.id }, after, beforeScope, afterScope), theme.id);
    assert.equal(preserve({ ...before, preference: theme.id }, { ...after, fontFamilies: { ...empty } }, beforeScope, afterScope), theme.id);
    assert.equal(preserve({ ...before, preference: theme.id }, { ...after, fontSizes: { ...sizes, text: 15 } }, beforeScope, afterScope), theme.id);
  }
  assert.equal(preserve(before, after, beforeScope, beforeScope), null);
  assert.equal(preserve(before, { ...after, preference: 'dark' }, beforeScope, afterScope), null);
  assert.equal(preserve(before, { ...after, preference: 'dark' }, beforeScope, { status: 'ready', value: { preference: 'dark' } }), null);
  assert.equal(preserve(before, { ...after, preference: themes[1].id }, beforeScope, afterScope), null);
  assert.equal(preserve({ ...before, preference: 'dark' }, after, beforeScope, afterScope), null);
  assert.match(source, /createThemeRefreshGuard\(/);
  assert.match(source, /ctx\.configForms\.get\('ui-theme'\)/);
  assert.match(source, /queueMicrotask/);
  assert.doesNotMatch(source, /customThemeForFontChange/);
});
