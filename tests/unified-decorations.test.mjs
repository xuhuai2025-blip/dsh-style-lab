import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source and literal CSS inspection only: never execute a component or emulate React/DOM.
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const css = source.match(/const CSS = `([\s\S]*?)`;/)[1];
const palettes = JSON.parse(source.match(/const DECOR_PALETTES = (\{[\s\S]*?\n    \});/)[1]);
function component(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const end = source.indexOf('\n        function ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function dictionary(language) {
  const body = source.match(new RegExp(`\\b${language}:\\s*\\{([^}]+)\\}`))[1];
  return Object.fromEntries([...body.matchAll(/\b(\w+):\s*'([^']*)'/g)].map(match => [match[1], match[2]]));
}
function cssDeclarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\{([^}]*)\\}`, 'g'))].map(match => match[1]).join(';');
}

test('all three footers delegate to exactly one shared label-and-native-select component', () => {
  const picker = component('DecorationPicker');
  assert.match(picker, /function DecorationPicker\(\{\s*value,\s*styles,\s*onChange = \(\) => \{\},\s*themeName\s*\}\)/);
  assert.match(picker, /return h\('div', \{ className: 'sl-custom' \}/);
  assert.match(picker, /h\('label', null, h\('span', null, t\('techDecoration'\)\)/);
  assert.match(picker, /h\('select', \{ value,/);
  assert.match(picker, /styles\.map\(\w+ => h\('option', \{ key: \w+, value: \w+ \}, t\(\w+\)\)\)/);
  for (const tag of ['div', 'label', 'span', 'select', 'option']) {
    assert.equal((picker.match(new RegExp(`h\\('${tag}'`, 'g')) || []).length, 1, tag);
  }
  assert.equal((source.match(/function DecorationPicker\(/g) || []).length, 1);
  assert.equal((source.match(/return h\(DecorationPicker,/g) || []).length, 3);
  for (const name of ['OatControls', 'MistControls', 'NotebookControls']) {
    const wrapper = component(name);
    assert.match(wrapper, /return h\(DecorationPicker,/);
    assert.doesNotMatch(wrapper, /h\('(?:div|label|span|select|option|input)'/);
  }
});

test('shared native semantics retain unique accessible names and unmodified keyboard operation', () => {
  const picker = component('DecorationPicker');
  assert.match(picker, /'aria-label': t\(themeName\) \+ ' · ' \+ t\('techDecoration'\)/);
  assert.match(picker, /onChange: event => onChange\(event\.target\.value\)/);
  assert.doesNotMatch(picker, /disabled\s*:|readOnly\s*:|aria-disabled|tabIndex|onKey(?:Down|Up|Press)|preventDefault|stopPropagation|role\s*:/);
  for (const language of ['en', 'zh']) {
    const labels = dictionary(language);
    const names = ['oat', 'mist', 'notebook'].map(theme => `${labels[theme]} · ${labels.techDecoration}`);
    assert.equal(new Set(names).size, 3);
    for (const name of names) assert.doesNotMatch(name, /undefined/);
  }
});

test('Oat offers one Vintage Tape option, Mist two live options, and Notebook one Page Keepsakes option', () => {
  const oat = component('OatControls');
  const mist = component('MistControls');
  const notebook = component('NotebookControls');
  assert.match(oat, /h\(DecorationPicker, \{ value: 'vintage', styles: \['vintage'\], themeName: 'oat' \}\)/);
  assert.match(mist, /const mist = useMistDecoration\(\)/);
  assert.match(mist, /h\(DecorationPicker, \{ value: mist, styles: MIST_STYLES, onChange: setMistDecoration, themeName: 'mist' \}\)/);
  assert.match(notebook, /h\(DecorationPicker, \{ value: 'pageglow', styles: \['pageglow'\], themeName: 'notebook' \}\)/);
  const mistStyles = JSON.parse(source.match(/const MIST_STYLES = (\[[^\n]+\]);/)[1].replaceAll("'", '"'));
  assert.deepEqual([['vintage'].length, mistStyles.length, ['pageglow'].length], [1, 2, 1]);
  assert.deepEqual(mistStyles, ['hud', 'circuit']);
  assert.doesNotMatch(oat + notebook, /onChange\s*:|disabled\s*:|useState|useSyncExternalStore/);
  for (const [index, name] of ['OatControls', 'MistControls', 'NotebookControls'].entries()) {
    assert.match(source, new RegExp(`option\\.id === THEMES\\[${index}\\]\\.id \\? h\\(${name}\\) : null`));
    assert.equal((source.match(new RegExp(`h\\(${name}\\)`, 'g')) || []).length, 1);
  }
});

test('both locales use unified Decoration labels and the final style names, without retired palette/checkbox labels', () => {
  const en = dictionary('en');
  const zh = dictionary('zh');
  assert.equal(zh.techDecoration, '装饰');
  assert.equal(zh.vintage, '复古胶带');
  assert.equal(zh.pageglow, '书页拾光');
  assert.equal(zh.hud, '星轨浮光');
  assert.equal(zh.circuit, '微型电路');
  assert.equal(en.vintage, 'Vintage Tape');
  assert.equal(en.pageglow, 'Page Keepsakes');
  assert.equal(en.hud, 'Starlit Traces');
  assert.equal(en.circuit, 'Micro Circuits');
  for (const labels of [en, zh]) {
    for (const removed of ['palette', 'collage', 'tea', 'sage', 'blue', 'bookmark', 'tabs', 'holes', 'notebookWidgets']) {
      assert.equal(Object.hasOwn(labels, removed), false, removed);
    }
  }
});

test('fixed Oat and Notebook defaults preserve existing artwork without mutable stores or checkboxes', () => {
  assert.deepEqual(palettes, { collage: ['#C5AC73', '#99A68C', '#BE9689', '#98A9B5'] });
  assert.match(source, /const OAT_DECORATION = Object\.freeze\(\{ palette: 'collage' \}\)/);
  assert.doesNotMatch(source, /NOTEBOOK_DECORATION|notebookDecoration/);
  assert.match(component('OatVintage'), /const choices = OAT_DECORATION/);
  assert.match(component('NotebookPaper'), /makeNotebookCss\(\)/);
  const preview = component('Preview');
  assert.match(preview, /const choices = OAT_DECORATION/);
  assert.match(preview, /makeNotebookCss\(true\)/);
  assert.doesNotMatch(source, /\b(?:setDecoration|useDecoration|getDecoration|subscribeDecoration|decorationListeners|toggleNotebookPart|useNotebookDecoration|getNotebookDecoration|subscribeNotebookDecoration|notebookListeners)\b/);
  assert.doesNotMatch(source, /type: 'checkbox'|sl-checkbox|notebookWidgets|t\('palette'\)/);
});

test('Mist keeps validated immediate state and delegates persistence without writing fonts or native appearance', () => {
  assert.match(source, /let mistDecoration = 'hud'/);
  assert.match(source, /const mistListeners = new Set\(\)/);
  assert.match(source, /ctx\.effect\(\(\) => \(\) => mistListeners\.clear\(\)\)/);
  const raw = component('applyMistDecoration');
  const setter = component('setMistDecoration').split('\n        ctx.effect(')[0];
  assert.match(raw, /MIST_STYLES\.includes\(value\)/);
  assert.match(raw, /(?:value === mistDecoration|mistDecoration === value)/);
  assert.match(raw, /mistDecoration = value/);
  assert.doesNotMatch(raw, /remember\(|\.mutate\(/);
  assert.match(setter, /applyMistDecoration\(value\)/);
  assert.match(setter, /skinPreferences\?\.remember\(\{ mistMode: value \}\)/);
  assert.match(source, /React\.useSyncExternalStore\(subscribeMistDecoration, getMistDecoration\)/);
  const controls = ['DecorationPicker', 'OatControls', 'MistControls', 'NotebookControls'].map(component).join('\n') + raw + setter;
  assert.doesNotMatch(controls, /ctx\.(?:remote|settings|theme)|saveFonts|setFont|localStorage|sessionStorage|fetch\(|document\./);
});

test('all theme-footer dimensions are common scoped CSS with a minimum 56px row and 140px native select', () => {
  const footer = cssDeclarations('.sl-custom');
  const select = cssDeclarations('.sl-custom select');
  assert.match(footer, /(?:^|;)\s*min-height:\s*56px(?:;|$)/);
  assert.match(select, /(?:^|;)\s*width:\s*140px(?:;|$)/);
  assert.match(css, /\.sl-custom select:focus-visible/);
  for (const selector of [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim())) {
    if (selector.includes('.sl-custom')) assert.doesNotMatch(selector, /data-(?:oat|glass|notebook)|stylelab-(?:oat|mist|ivory)/);
  }
  assert.doesNotMatch(footer + select, /pointer-events:\s*none|display:\s*none|visibility:\s*hidden/);
});
