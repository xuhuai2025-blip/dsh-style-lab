import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../client.js',import.meta.url),'utf8');
const range = source.match(/const MAPLE_LATIN_RANGE = '([^']+)'/)[1];
const faces = JSON.parse(source.match(/const MAPLE_LOCAL_FACES = (\[[\s\S]*?\n    \]);/)[1]);
// Pure CSS formatting only. No browser factory, DOM, font rasterizer or renderer is invoked.
const cssDeclaration = source.slice(source.indexOf('const MAPLE_FONT_CSS ='),source.indexOf('    function MapleFontFaces()'));
const css = new Function('MAPLE_LOCAL_FACES','MAPLE_LATIN_RANGE',`${cssDeclaration}; return MAPLE_FONT_CSS;`)(faces,range);
const intervals = range.split(',').map(token => token.replace('U+','').split('-').map(value => parseInt(value,16)));
const covers = code => intervals.some(([start,end = start]) => code >= start && code <= end);

test('Maple English alias includes Latin and Nerd icons but excludes selected CJK glyphs',()=>{
  for(const point of [0x41,0x61,0x30,0x03bb,0x2192,0xe0b0,0xf013,0xf0001,0x100001]) assert.ok(covers(point),point.toString(16));
  for(const point of [0x3002,0x3042,0x3400,0x4e2d,0x6587,0x65e5,0xf900,0xff0c,0x20000,0x30000]) assert.equal(covers(point),false,point.toString(16));
  assert.match(source,/"id":"maple","text":"Maple Mono NF CN Latin"/);
  assert.match(source,/"id":"maple","family":"Maple Mono NF CN"/);
});

test('eight local-only faces match installed official full and PostScript names',()=>{
  assert.equal(faces.length,8);
  assert.deepEqual([...new Set(faces.map(face=>face.weight))],[400,500,600,700]);
  assert.equal((css.match(/@font-face/g)||[]).length,8);
  assert.equal((css.match(/unicode-range:/g)||[]).length,8);
  for(const face of faces){
    assert.ok(['normal','italic'].includes(face.style));
    assert.ok(css.includes(`local("Maple Mono NF CN ${face.name}")`));
    assert.ok(css.includes(`local("MapleMono-NF-CN-${face.postscript}")`));
  }
  assert.doesNotMatch(css,/url\(|https?:|document|!important/);
  assert.match(css,/font-display:swap/);
  assert.match(source,/return h\('style', \{ 'data-stylelab-font': 'maple-latin' \}, MAPLE_FONT_CSS\)/);
  assert.match(source,/ctx.slots.inject\('shell.overlay', \(\) => ctx.slots.register\(\{ name: 'shell.overlay', id: 'stylelab-maple-fonts'/);
});
