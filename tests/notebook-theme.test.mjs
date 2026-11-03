import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const text = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const themes = JSON.parse(text.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
const palettes = JSON.parse(text.match(/const DECOR_PALETTES = (\{[\s\S]*?\n    \});/)[1]);
const scope = '[data-stylelab-scope="inspiration"]';
const helpers = text.slice(text.indexOf('function makeVintageCss('), text.indexOf('    function SidebarFrames()'));
// Pure formatting only: no browser factory, React, DOM, settings or font installation.
const { notebook, inspiration } = new Function('DECOR_PALETTES', 'THEMES', 'INSPIRATION_SCOPE',
  `${helpers};return {notebook:makeNotebookCss,inspiration:makeInspirationCss};`)(palettes, themes, scope);
const actualRow = '.wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_panelList .wtg9ga_panelRow';
const previewRoot = '.sl-preview[data-notebook="true"]';
const nativeChat = '[data-conversation-content][data-conversation-region="chat"] > [data-conversation-scroll]';
const noteRow = scope + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]';
const contexts = [
  { name: 'sidebar', preview: false, inspiration: false, row: actualRow, line: 28, height: 10,
    canvas: ['.wtg9ga_root', '.sl-page[data-notebook="true"]', scope, nativeChat],
    hash: 'a393072a3d2e52121a5df17632ea201f2a49387fa622836033afc98b1f485d5f' },
  { name: 'preview', preview: true, inspiration: false, row: previewRoot + ' .sl-preview-notebook', line: 10, height: 7,
    canvas: [previewRoot + ' .sl-preview-main', previewRoot + ' .sl-preview-rail'],
    hash: '1085847bee8de2bee4fa9056bcf35d225d79fe92074b3b57dacd4ed6e088b958' },
  { name: 'inspiration', preview: false, inspiration: true, row: noteRow, line: 28, height: 14, canvas: [],
    hash: '660eaa78cc70fe84bcc7fc6f33ed304a851f793cf5a50ea8cf99c117c35d7293' },
];
function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.trim().split(',').map(selector => selector.trim()), declarations,
  }));
}
function declarationsFor(css, selector) {
  return rules(css).filter(rule => rule.selectors.includes(selector)).map(rule => rule.declarations).join(';');
}
function artwork(css) {
  return [...new Set([...css.matchAll(/data:image\/svg\+xml(?:;[^,]*)?,([^"')\s]+)/g)].map(match => decodeURIComponent(match[1])))];
}

test('third theme stays a named cream notebook with fourteen native tokens', () => {
  assert.equal(themes.length, 3);
  assert.equal(themes[2].id, 'stylelab-ivory-notebook');
  assert.equal(themes[2].colorScheme, 'light');
  assert.equal(Object.keys(themes[2].tokens).length, 14);
  assert.equal(themes[2].tokens['--dsw-alias-bg-base'], '#FAF8F0');
  assert.equal(themes[2].tokens['--dsw-alias-brand-primary'], '#4E695B');
  assert.match(text, /zh:\s*\{[^}]*notebook:\s*'素纸手札'/);
  assert.match(text, /en:\s*\{[^}]*notebook:\s*'Ivory Notebook'/);
});

for (const context of contexts) {
  test(`notebook ${context.name} retains the exact active CSS after removing retired toggle branches`, () => {
    const css = notebook(context.preview, context.inspiration);
    // Fingerprints captured from the previously active all-on output, not retired combinations.
    assert.equal(createHash('sha256').update(css).digest('hex'), context.hash);
    const owned = new Set([context.row, context.row + '::before', context.row + '::after', ...context.canvas]);
    for (const rule of rules(css)) {
      for (const selector of rule.selectors) {
        assert.ok(owned.has(selector), selector);
        if (context.canvas.includes(selector)) {
          const properties = [...rule.declarations.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map(match => match[1]);
          for (const property of properties) assert.match(property, /^background(?:-[a-z]+)?$/);
        }
      }
    }
    const row = declarationsFor(css, context.row);
    assert.match(row, /position:relative/);
    assert.match(row, /repeating-linear-gradient/);
    assert.ok(row.includes(`${context.line}px`));
    assert.match(row, /font-family:var\(--dsh-font-family-text,inherit\)/);
    assert.doesNotMatch(row, /(?:^|;)\s*(?:display|grid[^:;]*|flex[^:;]*|gap|padding[^:;]*|margin[^:;]*|(?:min-|max-)?(?:width|height)|overflow[^:;]*|border-radius|transform|contain|z-index)\s*:/);
    for (const pseudo of ['::before', '::after']) {
      const value = declarationsFor(css, context.row + pseudo);
      assert.match(value, /content:"";display:block;position:absolute;pointer-events:none/);
    }
    assert.ok(declarationsFor(css, context.row + '::after').includes(`height:${context.height}px`));
    assert.match(declarationsFor(css, context.row + '::before'), /max-height:60px/);
    assert.doesNotMatch(css, /(?:backdrop-)?filter\s*:|animation[^:;]*:|@keyframes|will-change\s*:|perspective\s*:|contain\s*:|position:\s*(?:fixed|sticky)/i);
    if (context.name === 'sidebar') {
      assert.match(declarationsFor(css, nativeChat), /^background-image:repeating-linear-gradient/);
    } else assert.equal(declarationsFor(css, nativeChat), '');
    const [image] = artwork(css);
    assert.match(image, /<path/);
    assert.match(image, /<rect/);
    const shapes = image.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    assert.doesNotMatch(shapes, /<(?:script|foreignObject|image|text|a)\b|\bon\w+=|\bhref=|https?:\/\//i);
  });
}

test('one shared all-on artwork is reused in all destinations with no retired checkbox configuration', () => {
  assert.deepEqual(artwork(notebook()), artwork(notebook(true)));
  assert.deepEqual(artwork(notebook()), artwork(notebook(false, true)));
  const formatter = text.slice(text.indexOf('function makeNotebookCss('), text.indexOf('function makeInspirationCss('));
  assert.match(formatter, /function makeNotebookCss\(preview = false, inspiration = false\)/);
  assert.doesNotMatch(formatter, /choices\.|\bdecoration\s*[=,)]|bookmark\s*\?|tabs\s*\?|holes\s*\?/);
  assert.doesNotMatch(text, /NOTEBOOK_DECORATION|notebookDecoration|notebookListeners|toggleNotebookPart|useNotebookDecoration|type: 'checkbox'/);
});

test('notebook semantic leaves retain native layout; native themes emit no material', () => {
  const css = inspiration(themes[2].id);
  assert.ok(css.startsWith(notebook(false, true)));
  assert.doesNotMatch(css, /\.wtg9ga_|\.sl-|\b(?:html|body|:root)\b|backdrop-filter|filter:/);
  for (const rule of rules(css)) {
    for (const selector of rule.selectors) {
      assert.ok(selector.startsWith(scope + ' '));
      assert.match(selector, /\[data-stylelab-surface="(?:note|composer|control)"\]/);
      if (selector.includes('::')) assert.ok(selector === noteRow + '::before' || selector === noteRow + '::after');
    }
    if (!rule.selectors.some(selector => selector.includes('::'))) {
      assert.doesNotMatch(rule.declarations, /(?:^|;)\s*(?:display|grid[^:;]*|flex[^:;]*|gap|padding[^:;]*|margin[^:;]*|(?:min-|max-)?(?:width|height)|overflow[^:;]*|border-radius|transform|contain|z-index)\s*:/);
    }
  }
  for (const preference of ['system', 'light', 'dark', 'unknown', '', undefined]) assert.equal(inspiration(preference), '');
});

test('one-choice notebook selector and preview remain isolated to the third theme', () => {
  assert.match(text, /return h\(DecorationPicker, \{ value: 'pageglow', styles: \['pageglow'\], themeName: 'notebook' \}\)/);
  assert.match(text, /option\.id === THEMES\[2\]\.id \? h\(NotebookControls\) : null/);
  assert.match(text, /isNotebook \? h\('style', null, makeNotebookCss\(true\)\) : h\('style', null, makeMistCss\(mist, true\)\)/);
  assert.match(text, /snapshot\.preference === THEMES\[2\]\.id \? makeNotebookCss\(\) \+ makeInspirationCss\(snapshot\.preference\) : ''/);
  assert.match(text, /id: 'stylelab-notebook-paper', order: 93 \}, NotebookPaper/);
  assert.equal((text.match(/ctx\.slots\.inject\('shell.overlay'/g) || []).length, 5);
});
