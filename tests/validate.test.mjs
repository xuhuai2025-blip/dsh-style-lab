import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const text = readFileSync(resolve(root, 'client.js'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
// Inspect literal data; never execute the browser module or emulate React/DOM.
const themes = JSON.parse(text.match(/const THEMES = (\[[\s\S]*?\n    \]);/)[1]);
const catalog = [
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay', '--dsw-alias-border-l1', '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary', '--dsw-alias-label-primary', '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary', '--dsw-specific-sidebar-fill'
];
function rgba(hex) {
  const values = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255);
  return values.length === 3 ? [...values, 1] : values;
}
function over(foreground, background) {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  return [...foreground.slice(0, 3).map((v, i) => (v * foreground[3] + background[i] * background[3] * (1 - foreground[3])) / alpha), alpha];
}
function luminance(color) {
  const values = color.slice(0, 3).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('bundle exports all linked distribution resources without install scripts', () => {
  assert.equal(manifest.name, 'dsh-style-lab');
  assert.equal(manifest.version, '0.9.0');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(manifest.scripts.build);
  assert.ok(manifest.scripts.test);
  for (const name of ['preinstall', 'install', 'postinstall']) assert.equal(manifest.scripts[name], undefined);
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'fonts/maple-NOTICE.md', 'fonts/OFL-Maple.txt']) {
    assert.ok(manifest.files.includes(file));
    assert.ok(existsSync(resolve(root, file)));
  }
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(resolve(root, `locale/${lang}.json`), 'utf8'));
    assert.equal(locale.meta.title, '风格工坊');
    assert.equal([...locale.meta.title].length, 4);
    assert.ok(locale.meta.description.length > 20);
  }
  assert.equal(manifest.exports['./icon'], './icon.svg');
  assert.ok(manifest.files.includes('locale/*.json'));
});

test('three unique palettes cover exactly the inspected public token catalog', () => {
  assert.equal(themes.length, 3);
  assert.equal(new Set(themes.map(theme => theme.id)).size, 3);
  assert.deepEqual(themes.map(theme => theme.colorScheme), ['light', 'dark', 'light']);
  for (const theme of themes) {
    assert.deepEqual(Object.keys(theme.tokens).sort(), [...catalog].sort());
    for (const color of Object.values(theme.tokens)) assert.match(color, /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/);
  }
});

test('text and accents pass WCAG AA after alpha compositing on single and nested surfaces', () => {
  for (const theme of themes) {
    const base = rgba(theme.tokens['--dsw-alias-bg-base']);
    const keys = ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay', '--dsw-specific-sidebar-fill'];
    const surfaces = keys.map(key => [key, over(rgba(theme.tokens[key]), base)]);
    for (const lower of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-specific-sidebar-fill']) {
      for (const upper of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay']) {
        surfaces.push([`${upper} over ${lower}`, over(rgba(theme.tokens[upper]), over(rgba(theme.tokens[lower]), base))]);
      }
    }
    for (const foreground of ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-brand-primary']) {
      for (const [name, surface] of surfaces) {
        const ratio = contrast(over(rgba(theme.tokens[foreground]), surface), surface);
        assert.ok(ratio >= 4.5, `${theme.id}: ${foreground} / ${name} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('native slot ids match and switching uses the canonical theme API', () => {
  assert.match(text, /name: 'sidebar.panellist', id: 'stylelab'/);
  assert.match(text, /name: 'main', key: 'stylelab'/);
  assert.match(text, /ctx\.theme\.setTheme\(id\)/);
  assert.match(text, /id: 'system', name: 'system'/);
  assert.match(text, /choose\(option\.id\)/);
  assert.match(text, /ctx\.on\('theme\/change', setSnapshot\)/);
  assert.match(text, /return dispose/);
  assert.match(text, /ctx\.effect\(\(\) => ctx\.theme\.register\(definition\)\)/);
  assert.doesNotMatch(text, /document\.|localStorage|fetch\(|require\('@deepseek-ai\//);
});

test('component styles are scoped and consume only public theme tokens', () => {
  const css = text.match(/const CSS = `([\s\S]*?)`;/)[1];
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(catalog.includes(token), token);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(text, /'aria-pressed': selected/);
  assert.doesNotMatch(text, /sl-info|sl-intro|sl-status|eyebrow|sessionNote|scopeNote/);
  assert.match(text, /function Preview\(\{ definition, name \}\)/);
  assert.match(text, /option\.definition \? h\(Preview/);
  assert.match(text, /style: \{ \.\.\.definition\.tokens, colorScheme: definition\.colorScheme \}/);
  const zh = text.match(/zh:\s*\{([^}]+)\}/)[1];
  for (const [key, label] of [['title', '风格工坊'], ['oat', '燕麦暖笺'], ['mist', '雾蓝微光'], ['notebook', '素纸手札'], ['system', '默认']]) {
    assert.match(zh, new RegExp(`\\b${key}: '${label}'`));
  }
});

test('sidebar frames affect only existing navigation rows and preserve host interactions', () => {
  const css = text.match(/const SIDEBAR_CSS = `([\s\S]*?)`;/)[1];
  assert.match(text, /name: 'shell.overlay', id: 'stylelab-sidebar-frames'/);
  assert.match(text, /return h\('style', \{ 'data-stylelab-skin': 'sidebar-frames' \}, SIDEBAR_CSS\)/);
  assert.match(css, /\.wtg9ga_root \.wtg9ga_panelList \.wtg9ga_panelRow/);
  assert.match(css, /\[aria-current="page"\]/);
  assert.match(css, /\[aria-expanded="true"\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /pointer-events|position:|z-index:|display:|#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(text, /querySelector|MutationObserver|appendChild|\.style\s*=/);
  for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(catalog.includes(token), token);
});

test('replacement palettes use muted surfaces, warm paper and real glass alpha', () => {
  assert.deepEqual(themes.map(theme => theme.id), ['stylelab-oat-parchment', 'stylelab-mist-glow', 'stylelab-ivory-notebook']);
  const warm = rgba(themes[0].tokens['--dsw-alias-bg-base']);
  assert.ok(warm[0] > warm[1] && warm[1] > warm[2] && warm[2] > 0.85);
  const backgrounds = ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay', '--dsw-specific-sidebar-fill'];
  for (const theme of themes) {
    for (const token of backgrounds) {
      const rgb = rgba(theme.tokens[token]).slice(0, 3);
      assert.ok(Math.max(...rgb) - Math.min(...rgb) < 0.12, `${theme.id}: ${token} is too chromatic`);
    }
  }
  for (const token of backgrounds.filter(token => token !== '--dsw-alias-bg-base')) {
    const alpha = rgba(themes[1].tokens[token])[3];
    assert.ok(alpha >= 0.6 && alpha < 1, token);
  }
  for (const theme of themes) {
    for (const token of ['--dsw-alias-bg-base', '--dsw-alias-label-primary', '--dsw-alias-label-secondary']) assert.equal(rgba(theme.tokens[token])[3], 1);
  }
  assert.doesNotMatch(text, /stylelab-mint-light|stylelab-midnight-blue|薄荷浅色|午夜蓝深色/);
});

test('glass material follows the selected theme without changing the default', () => {
  const css = text.match(/const GLASS_CSS = `([\s\S]*?)`;/)[1];
  assert.match(css, /backdrop-filter:blur\(/);
  assert.match(css, /linear-gradient/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(catalog.includes(token), token);
  assert.match(text, /snapshot.preference === THEMES\[1\].id \? GLASS_CSS \+ makeMistCss\(mist\) \+ makeInspirationCss\(snapshot.preference, undefined, mist\) : ''/);
  assert.match(text, /'data-glass': definition.id === THEMES\[1\].id/);
  assert.match(text, /id: 'stylelab-mist-material'/);
});

test('mist sidebar preserves the viewport containing block of Windows caption controls', () => {
  const css = text.match(/const GLASS_CSS = `([\s\S]*?)`;/)[1];
  const root = css.match(/(?:^|\n)\.wtg9ga_root\{([^}]*)\}/)[1];
  assert.match(root, /background:linear-gradient/);
  assert.doesNotMatch(root, /(?:^|;)\s*(?:-webkit-)?(?:backdrop-filter|filter|transform|perspective|contain|will-change|translate|rotate|scale)\s*:/);
  assert.match(css, /\.wtg9ga_panelRow\{backdrop-filter:blur\(/);
  assert.doesNotMatch(css, /wtg9ga_toggle|wtg9ga_newSession|wtg9ga_brand|margin-top|top:|left:/);
});

// Exercise only the pure CSS formatter; do not load the browser factory or emulate DOM/React.
const decorPalettes = JSON.parse(text.match(/const DECOR_PALETTES = (\{[\s\S]*?\n    \});/)[1]);
const formatSource = text.slice(text.indexOf('function makeVintageCss('), text.indexOf('    function SidebarFrames()'));
const inspirationScope = '[data-stylelab-scope="inspiration"]';
const { formatVintage, formatInspiration } = new Function('DECOR_PALETTES', 'THEMES', 'INSPIRATION_SCOPE', `${formatSource}; return { formatVintage: makeVintageCss, formatInspiration: makeInspirationCss };`)(decorPalettes, themes, inspirationScope);
function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({ selectors: selectors.trim().split(','), declarations }));
}

test('vintage paper and stationery are enabled only for Oat Parchment', () => {
  assert.match(text, /snapshot.preference === THEMES\[0\].id \? makeVintageCss\(choices\) \+ makeInspirationCss\(snapshot.preference, choices\) : ''/);
  assert.match(text, /option.id === THEMES\[0\].id \? h\(OatControls\) : null/);
  assert.match(text, /'data-oat': isOat/);
  assert.match(text, /id: 'stylelab-oat-vintage'/);
  assert.match(text, /const OAT_DECORATION = Object\.freeze\(\{ palette: 'collage' \}\)/);
  assert.doesNotMatch(text, /\b(?:setDecoration|useDecoration|getDecoration|subscribeDecoration|decorationListeners)\b/);
  assert.doesNotMatch(text, /DECOR_MODES|choices\.mode|setDecoration\('mode'|clipMask|--sl-show-clip|Paperclips|回形针/);
  assert.match(text, /return h\(DecorationPicker, \{ value: 'vintage', styles: \['vintage'\], themeName: 'oat' \}\)/);
});

test('the fixed collage palette produces only bounded, scoped, non-interactive tape CSS', () => {
  assert.deepEqual(Object.keys(decorPalettes), ['collage']);
  for (const palette of Object.keys(decorPalettes)) {
    assert.equal(decorPalettes[palette].length, 4);
    const css = formatVintage({ palette });
    assert.match(css, /\.wtg9ga_root:not\(\.wtg9ga_collapsed\)/);
    assert.doesNotMatch(css, /\.sl-preview|\.sl-page|\.wtg9ga_regionArea|\.wtg9ga_footArea/);
    assert.match(css, /::before\{[^}]*display:block;[^}]*pointer-events:none/);
    assert.match(css, /clip-path:polygon/);
    assert.doesNotMatch(css, /::after|show-clip|mask:|data:image|https?:\/\//);
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
    for (const color of decorPalettes[palette]) assert.ok(css.includes(color));
    for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(catalog.includes(token) || token.startsWith('--sl-') || token === '--dsh-font-family-text', token);
    const preview = formatVintage({ palette }, true);
    assert.match(preview, /\.sl-preview\[data-oat="true"\]/);
    assert.doesNotMatch(preview, /\.wtg9ga_root|::after|mask:/);
    for (const oldMode of ['mixed','clips','none']) assert.equal(formatVintage({ mode: oldMode, palette }), css);
  }
  for (const palette of ['invalid', 'tea', 'sage', 'blue']) {
    assert.equal(formatVintage({ palette }), formatVintage({ palette: 'collage' }));
  }
});

test('inspiration material requires semantic opt-in and leaves host layout and fonts native', () => {
  assert.match(text, /const INSPIRATION_SCOPE = '\[data-stylelab-scope="inspiration"\]'/);
  for (const theme of themes) {
    const css = formatInspiration(theme.id);
    assert.ok(cssRules(css).length > 0);
    assert.doesNotMatch(css, /\.wtg9ga_|\.sl-|\b(?:html|body|:root)\b/);
    for (const { selectors, declarations } of cssRules(css)) {
      for (const selector of selectors) {
        assert.ok(selector.startsWith(inspirationScope + ' '), selector);
        assert.match(selector, /\[data-stylelab-surface="(?:note|composer|control)"\]/);
        if (selector.includes('[data-stylelab-surface="note"]')) assert.ok(selector.includes('[data-stylelab-collection="notes"]'));
      }
      if (!selectors.some(selector => selector.includes('::'))) {
        assert.doesNotMatch(declarations, /(?:^|;)\s*(?:display|grid[^:;]*|flex[^:;]*|gap|padding[^:;]*|margin[^:;]*|(?:min-|max-)?(?:width|height)|overflow[^:;]*|border-radius|transform|isolation|contain|z-index|pointer-events)\s*:/);
        assert.doesNotMatch(declarations, /(?:^|;)\s*position:(?:fixed|absolute|sticky)/);
      }
    }
    for (const [, token] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(catalog.includes(token) || token.startsWith('--sl-') || token === '--dsh-font-family-text', token);
    assert.match(css, /font-family:var\(--dsh-font-family-text,inherit\)/);
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length);
  }
});

test('inspiration oat shares tape palettes without decorating actions', () => {
  const row = inspirationScope + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]';
  for (const palette of Object.keys(decorPalettes)) {
    const css = formatInspiration(themes[0].id, { palette });
    assert.match(css, /repeating-linear-gradient/);
    assert.match(css, /box-shadow:/);
    assert.doesNotMatch(css, /backdrop-filter|filter:|::after|mask:|show-clip/);
    for (const [index, color] of decorPalettes[palette].entries()) {
      assert.ok(css.includes(`${row}:nth-child(4n+${index + 1}){--sl-art:${color}}`));
    }
    const pseudos = cssRules(css).filter(rule => rule.selectors.some(selector => selector.includes('::')));
    assert.equal(pseudos.length, 1);
    for (const { selectors, declarations } of pseudos) {
      assert.equal(selectors[0], row + '::before');
      assert.match(declarations, /display:block/);
      assert.match(declarations, /pointer-events:none/);
      assert.match(declarations, /position:absolute/);
      assert.match(declarations, /left:38%/);
      assert.match(declarations, /translateX\(-50%\)/);
      assert.doesNotMatch(declarations, /(?:^|;)right:/);
    }
    assert.doesNotMatch(css, /button|aria-|cursor:|onClick|content:"[^\"]+"/);
  }
  assert.equal(formatInspiration(themes[0].id, { palette: 'invalid' }), formatInspiration(themes[0].id));
});

test('inspiration mist blurs only note and composer leaves with native-token accents', () => {
  const css = formatInspiration(themes[1].id);
  const rules = cssRules(css);
  const blurRules = rules.filter(rule => rule.declarations.includes('backdrop-filter:'));
  assert.equal(blurRules.length, 1);
  assert.equal(blurRules[0].selectors.length, 2);
  for (const selector of blurRules[0].selectors) assert.match(selector, /\[data-stylelab-surface="(?:note|composer)"\]$/);
  assert.match(blurRules[0].declarations, /backdrop-filter:blur\(14px\) saturate\(\.7\)/);
  assert.match(blurRules[0].declarations, /-webkit-backdrop-filter:blur\(14px\) saturate\(\.7\)/);
  assert.match(blurRules[0].declarations, /linear-gradient.*var\(--dsw-alias-brand-primary\)/);
  const control = rules.find(rule => rule.selectors.some(selector => selector.endsWith('[data-stylelab-surface="control"]')));
  assert.ok(control);
  assert.doesNotMatch(control.declarations, /filter|transform|perspective|contain|will-change/);
  assert.doesNotMatch(css, /--sl-art|#[0-9a-f]{3,8}\b|(?:^|;)filter:/i);
  const note = inspirationScope + ' [data-stylelab-collection="notes"] [data-stylelab-surface="note"]';
  const ownedPseudos = new Set();
  for (const rule of rules.filter(rule => rule.selectors.some(selector => selector.includes('::')))) {
    for (const selector of rule.selectors) {
      assert.ok(selector === note + '::before' || selector === note + '::after', selector);
      ownedPseudos.add(selector);
    }
    assert.doesNotMatch(rule.declarations, /(?:backdrop-)?filter:|animation:|contain:/);
  }
  assert.deepEqual([...ownedPseudos].sort(), [note + '::after', note + '::before']);
});

test('native/default themes and ctx-owned unload leave no inspiration material layer', () => {
  for (const preference of ['system', 'light', 'dark', 'unknown', '', undefined]) {
    for (const mode of ['mixed', 'tape', 'clips', 'none']) assert.equal(formatInspiration(preference, { mode, palette: 'blue' }), '');
  }
  const themeMaterial = text.slice(text.indexOf('function ThemeMaterial()'), text.indexOf('function OatControls()'));
  assert.match(themeMaterial, /snapshot.preference === THEMES\[1\].id[^\n]+: ''/);
  assert.match(themeMaterial, /snapshot.preference === THEMES\[0\].id[^\n]+: ''/);
  assert.match(themeMaterial, /const choices = OAT_DECORATION/);
  assert.match(themeMaterial, /makeInspirationCss\(snapshot.preference, choices\)/);
  assert.equal((text.match(/ctx\.slots\.inject\('shell.overlay'/g) || []).length, 5);
  assert.equal((text.match(/ctx\.slots\.inject\('shell.overlay'[^\n]+(?:SidebarFrames|ThemeMaterial|OatVintage|NotebookPaper)\)\)/g) || []).length, 4);
  assert.match(text, /ctx\.slots\.inject\('shell.overlay', \(\) => ctx\.slots\.register\([^\n]+MapleFontFaces\)\)/);
  assert.match(text, /ctx\.slots\.inject\('shell.overlay', \(\) => ctx\.slots\.register\([^\n]+ThemeMaterial\)\)/);
  assert.match(text, /ctx\.slots\.inject\('shell.overlay', \(\) => ctx\.slots\.register\([^\n]+OatVintage\)\)/);
  assert.match(text, /ctx\.slots\.inject\('shell.overlay', \(\) => ctx\.slots\.register\([^\n]+NotebookPaper\)\)/);
  assert.doesNotMatch(text, /document\.|querySelector|MutationObserver|appendChild|localStorage|sessionStorage|require\(['"][^'"]*idea/);
});
