import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const themes = JSON.parse(text.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
const palettes = JSON.parse(text.match(/const DECOR_PALETTES = (\{[\s\S]*?\n    \});/)[1]);
const inspirationScope = '[data-stylelab-scope="inspiration"]';
const helperStart = text.indexOf('function makeMistCss(');
const helperEnd = text.indexOf('function makeNotebookCss(');
const inspirationStart = text.indexOf('function makeInspirationCss(');
assert.ok(helperStart > text.indexOf('function makeVintageCss('), 'Mist helper follows the vintage formatter');
assert.ok(helperEnd > helperStart && inspirationStart > helperEnd, 'Mist helper precedes notebook and inspiration formatters');
// Evaluate ONLY pure CSS functions. Never load the browser module or render/mock React or DOM.
// Deliberately do not inject MIST_STYLES: the formatter must be independently usable.
const formatMist = new Function('INSPIRATION_SCOPE', `${text.slice(helperStart, helperEnd)}; return makeMistCss;`)(inspirationScope);
const formatSource = text.slice(text.indexOf('function makeVintageCss('), text.indexOf('    function SidebarFrames()'));
const { formatVintage, formatInspiration } = new Function('DECOR_PALETTES', 'THEMES', 'INSPIRATION_SCOPE',
  `${formatSource}; return { formatVintage: makeVintageCss, formatInspiration: makeInspirationCss };`)(palettes, themes, inspirationScope);

const actualRow = '.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelList .wtg9ga_panelRow';
const previewRow = '.sl-preview[data-glass="true"] .sl-preview-tech';
const inspirationRow = inspirationScope + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]';
const contexts = [
  { name: 'sidebar', preview: false, inspiration: false, row: actualRow, width: 52, height: 12 },
  { name: 'preview', preview: true, inspiration: false, row: previewRow, width: 24, height: 7 },
  { name: 'inspiration', preview: false, inspiration: true, row: inspirationRow, width: 52, height: 12 },
];
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.trim().split(',').map(selector => selector.trim()), declarations,
  }));
}
function declarationsFor(css, selector) {
  return rules(css).filter(rule => rule.selectors.includes(selector)).map(rule => rule.declarations).join(';');
}
function svgs(css) {
  const encoded = [...css.matchAll(/data:image\/svg\+xml(?:;[^,]*)?,([^"')\s]+)/g)].map(match => match[1]);
  return [...new Set(encoded.map(value => decodeURIComponent(value)))];
}

test('Mist exposes only the two internal choices with final user-facing artwork names', () => {
  assert.match(text, /const MIST_STYLES = \['hud',\s*'circuit'\]/);
  for (const label of ['星轨浮光', '微型电路', 'Starlit Traces', 'Micro Circuits']) assert.ok(text.includes(label), label);
  assert.doesNotMatch(text, /hud:\s*['"][^'"]*HUD/i);
  assert.doesNotMatch(text.slice(helperStart, helperEnd), /\bMIST_STYLES\b/);
});

for (const mode of ['hud', 'circuit']) {
  for (const context of contexts) {
    test(`${mode} ${context.name} decorates only owned row corners without ancestor/layout changes`, () => {
      const css = formatMist(mode, context.preview, context.inspiration);
      const parsed = rules(css);
      assert.ok(parsed.length >= 3);
      assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
      const allowed = new Set([context.row, context.row + '::before', context.row + '::after']);
      for (const rule of parsed) {
        for (const selector of rule.selectors) assert.ok(allowed.has(selector), selector);
      }
      assert.match(declarationsFor(css, context.row), /^\s*position:\s*relative;?\s*$/);
      assert.doesNotMatch(css, /(?:^|[;{])\s*(?:(?:-webkit-)?(?:backdrop-filter|filter)|animation[^:;]*|contain|will-change|perspective|font[^:;]*|padding[^:;]*|margin[^:;]*|grid[^:;]*|flex[^:;]*|gap)\s*:/);
      assert.doesNotMatch(css, /\.wtg9ga_(?:regionArea|footArea|toggle|brand|newSession)|\.sl-page|\[data-stylelab-surface="(?:composer|control)"\]/);
      assert.doesNotMatch(css, /position:\s*(?:fixed|sticky)|@keyframes|https?:\/\//);
      for (const pseudo of ['::before', '::after']) {
        const declarations = declarationsFor(css, context.row + pseudo);
        assert.match(declarations, /content:\s*["']{2}/);
        assert.match(declarations, /display:\s*block/);
        assert.match(declarations, /pointer-events:\s*none/);
        assert.match(declarations, /position:\s*absolute/);
        assert.match(declarations, new RegExp(`(?:^|;)\\s*width:\\s*${context.width}px(?:;|$)`));
        assert.match(declarations, new RegExp(`(?:^|;)\\s*height:\\s*${context.height}px(?:;|$)`));
        assert.match(declarations, /max-width:\s*32%/);
        assert.match(declarations, /(?:-webkit-)?mask[^:;]*:/);
        assert.match(declarations, /var\(--dsw-alias-brand-primary\)/);
      }
      const before = declarationsFor(css, context.row + '::before');
      const after = declarationsFor(css, context.row + '::after');
      assert.match(before, /(?:^|;)\s*top:\s*3px(?:;|$)/);
      assert.match(before, /(?:^|;)\s*right:\s*5px(?:;|$)/);
      assert.match(after, /(?:^|;)\s*bottom:\s*3px(?:;|$)/);
      assert.match(after, /(?:^|;)\s*left:\s*5px(?:;|$)/);
      assert.match(after, /transform:\s*rotate\(180deg\)/);
      assert.doesNotMatch(before, /(?:^|;)\s*(?:bottom|left):/);
      assert.doesNotMatch(after, /(?:^|;)\s*(?:top|right):/);
      // Mask images carry shape only; visible color must come from the native brand token.
      assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      const uris = [...css.matchAll(/url\(([\s\S]*?)\)/g)].map(match => match[1]);
      assert.ok(uris.length > 0);
      for (const uri of uris) assert.match(uri, /^["']?data:image\/svg\+xml/);
      const artwork = svgs(css);
      assert.equal(artwork.length, 1);
      assert.match(artwork[0], /^<svg\b/);
      assert.match(artwork[0], /viewBox=["']0 0 52 12["']/);
      assert.match(artwork[0], /<(?:path|polyline)\b/);
      assert.match(artwork[0], /<(?:circle|rect)\b/);
      const shapeOnly = artwork[0].replace(/xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/g, '');
      assert.doesNotMatch(shapeOnly, /<(?:script|foreignObject|image|text)\b|\bon\w+=|\bhref=|https?:\/\//i);
    });
  }
}

test('the two original masks differ, while each mode reuses its artwork at all three destinations', () => {
  const hud = svgs(formatMist('hud'));
  const circuit = svgs(formatMist('circuit'));
  assert.notDeepEqual(hud, circuit);
  for (const mode of ['hud', 'circuit']) {
    const actual = svgs(formatMist(mode));
    assert.deepEqual(svgs(formatMist(mode, true)), actual);
    assert.deepEqual(svgs(formatMist(mode, false, true)), actual);
    assert.equal(formatMist(mode).includes('::before'), true);
    assert.equal(formatMist(mode).includes('::after'), true);
  }
});

test('unknown values normalize to starlit mode and semantic inspiration scope wins over preview', () => {
  for (const context of contexts) {
    const expected = formatMist('hud', context.preview, context.inspiration);
    for (const value of [undefined, null, '', 'unknown', 'HUD', 'mixed', 'tape', 'clips', 'none', false, 0, {}]) {
      assert.equal(formatMist(value, context.preview, context.inspiration), expected);
    }
  }
  assert.equal(formatMist(), formatMist('hud'));
  for (const mode of ['hud', 'circuit']) {
    const semantic = formatMist(mode, true, true);
    assert.doesNotMatch(semantic, /\.sl-preview/);
    for (const rule of rules(semantic)) {
      for (const selector of rule.selectors) assert.ok(selector.startsWith(inspirationRow), selector);
    }
  }
});

test('Mist inspiration appends only its note-corner layer with no second blur or action decoration', () => {
  const mistSource = text.slice(inspirationStart, text.indexOf('    function SidebarFrames()'));
  assert.match(mistSource, /makeInspirationCss\(preference, decoration = \{ palette: 'collage' \}, mistMode = 'hud'\)/);
  assert.match(mistSource, /preference === THEMES\[1\]\.id\) return makeMistCss\(mistMode, false, true\) \+/);
  for (const mode of ['hud', 'circuit']) {
    const css = formatInspiration(themes[1].id, undefined, mode);
    assert.ok(css.startsWith(formatMist(mode, false, true)));
    const parsed = rules(css);
    const blur = parsed.filter(rule => rule.declarations.includes('backdrop-filter:'));
    assert.equal(blur.length, 1);
    assert.equal(blur[0].selectors.length, 2);
    for (const selector of blur[0].selectors) assert.match(selector, /\[data-stylelab-surface="(?:note|composer)"\]$/);
    for (const rule of parsed) {
      for (const selector of rule.selectors) {
        assert.ok(selector.startsWith(inspirationScope + ' '), selector);
        if (selector.includes('::')) assert.ok(selector === inspirationRow + '::before' || selector === inspirationRow + '::after', selector);
      }
      if (!rule.selectors.some(selector => selector.includes('::'))) {
        assert.doesNotMatch(rule.declarations, /(?:^|;)\s*(?:width|height|padding[^:;]*|margin[^:;]*|display|grid[^:;]*|flex[^:;]*|gap|contain|transform|isolation|z-index)\s*:/);
      }
    }
  }
});

test('Oat remains tape-only for every palette regardless of Mist choice; native themes emit nothing', () => {
  for (const palette of Object.keys(palettes)) {
    const original = formatInspiration(themes[0].id, { palette });
    assert.ok(original.startsWith(formatVintage({ palette }, false, true)));
    assert.equal(formatInspiration(themes[0].id, { palette }, 'hud'), original);
    assert.equal(formatInspiration(themes[0].id, { palette }, 'circuit'), original);
    assert.doesNotMatch(original, /::after|mask:|data:image|backdrop-filter|filter:/);
  }
  for (const preference of ['system', 'light', 'dark', 'unknown', '', undefined]) {
    for (const mode of ['hud', 'circuit']) assert.equal(formatInspiration(preference, undefined, mode), '');
  }
  assert.doesNotMatch(text, /DECOR_MODES|choices\.mode|setDecoration\('mode'|clipMask|--sl-show-clip|回形针/);
});

test('source wiring shares context-owned view state between selector, active material and miniature preview', () => {
  assert.match(text, /let mistDecoration = 'hud'/);
  assert.match(text, /new Set\(\)/);
  assert.match(text, /function setMistDecoration\(\w+\)/);
  const raw = text.slice(text.indexOf('function applyMistDecoration('), text.indexOf('function setMistDecoration('));
  const setter = text.slice(text.indexOf('function setMistDecoration('), text.indexOf('        ctx.effect(', text.indexOf('function setMistDecoration(')));
  assert.match(raw, /MIST_STYLES\.includes\(/);
  assert.match(raw, /(?:mistDecoration === \w+|\w+ === mistDecoration)/);
  assert.doesNotMatch(raw, /remember\(|\.mutate\(/);
  assert.match(setter, /MIST_STYLES\.includes\(/);
  assert.match(setter, /applyMistDecoration\(value\)/);
  assert.match(setter, /skinPreferences\?\.remember\(\{ mistMode: value \}\)/);
  assert.match(text, /React\.useSyncExternalStore\(subscribeMistDecoration, getMistDecoration\)/);
  assert.match(text, /ctx\.effect\(\(\) => \(\) => mist[^\n]*\.clear\(\)\)/);
  const material = text.slice(text.indexOf('function ThemeMaterial()'), text.indexOf('function OatVintage()'));
  assert.match(material, /const mist = useMistDecoration\(\)/);
  assert.match(material, /snapshot\.preference === THEMES\[1\]\.id \? GLASS_CSS \+ makeMistCss\(mist\) \+ makeInspirationCss\(snapshot\.preference, undefined, mist\) : ''/);
  assert.match(text, /function MistControls\(\)/);
  assert.match(text, /return h\(DecorationPicker, \{ value: mist, styles: MIST_STYLES, onChange: setMistDecoration, themeName: 'mist' \}\)/);
  assert.match(text, /onChange: event => onChange\(event\.target\.value\)/);
  assert.match(text, /styles\.map\(/);
  assert.match(text, /option\.id === THEMES\[1\]\.id \? h\(MistControls\) : null/);
  const preview = text.slice(text.indexOf('function Preview('), text.indexOf('function unwrapSettings('));
  assert.match(preview, /const mist = useMistDecoration\(\)/);
  assert.match(preview, /makeMistCss\(mist, true\)/);
  assert.match(preview, /className: isOat \? 'sl-preview-note' : isNotebook \? 'sl-preview-notebook' : 'sl-preview-tech'/);
  assert.match(preview, /\[0, 1, 2\]\.map/);
  assert.match(preview, /h\('div', \{ className: 'sl-preview-note-stack' \}/);
  assert.match(preview, /isOat \? h\('style', null, makeVintageCss\(choices, true\)\) : isNotebook \? h\('style', null, makeNotebookCss\(true\)\) : h\('style', null, makeMistCss\(mist, true\)\)/);
});
