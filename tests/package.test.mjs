import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validatePackage } from '../scripts/build.mjs';
import * as current from '../simple-fonts-host.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

test('package name, browser module ID and bundle entries share the unscoped release name', () => {
  assert.equal(manifest.name, 'dsh-style-lab');
  assert.match(manifest.name, /^dsh-[a-z]+-[a-z]+$/);
  const browser = readFileSync(new URL('client.js', root), 'utf8');
  assert.equal(browser.match(/\bid:\s*'([^']+)'/)[1], manifest.name);
  const patch = readFileSync(new URL('cordis.patch.yml', root), 'utf8');
  assert.deepEqual([...patch.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1]),
    [manifest.name, `${manifest.name}/simple-fonts`]);
});

test('README identifies AI-generated original work and upstream resources without official endorsement', () => {
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.match(readme, /^# dsh-style-lab · 风格工坊/m);
  assert.ok(readme.includes('原创插件代码、界面、图标、文档及测试**全部由 AI 生成**'));
  for (const statement of ['官方宣传片', 'https://www.deepseek.com/zh/harness/',
    'https://github.com/deepseek-ai/deepseek-harness', '非官方插件', '未获得其背书',
    '不包括宿主或第三方资源', 'Maple Mono', '独立许可']) assert.ok(readme.includes(statement), statement);
});

// Tests resolve the public package API, not removed implementation filenames.
for (const entry of ['fonts', 'font-combinations', 'maple-fonts', 'simple-fonts']) {
  test(`public ${entry} compatibility entry resolves to the one supported implementation`, async () => {
    const api = await import(`dsh-style-lab/${entry}`);
    for (const name of ['apply', 'inject', 'createFontActions']) assert.equal(api[name], current[name]);
    for (const language of ['en', 'zh']) {
      const resolved = import.meta.resolve(`dsh-style-lab/${entry}/locale/${language}.json`);
      assert.deepEqual(JSON.parse(readFileSync(new URL(resolved), 'utf8')),
        JSON.parse(readFileSync(new URL(`fonts/locale/${language}.json`, root), 'utf8')));
    }
    assert.equal(import.meta.resolve(`dsh-style-lab/${entry}/icon`), new URL('icon.svg', root).href);
  });
}

test('build whitelist contains runtime closure, verification scripts, tests and third-party notices', () => {
  const files = validatePackage();
  for (const file of ['simple-fonts-core.js', 'simple-fonts-host.js', 'simple-font-languages.json',
    'fonts/OFL-Maple.txt', 'fonts/maple-NOTICE.md', 'LICENSE', 'scripts/build.mjs', 'tests/package.test.mjs']) {
    assert.ok(files.includes(file), file);
  }
  assert.ok(files.filter(file => file.startsWith('tests/')).length >= 9);
  assert.ok(manifest.scripts.build);
  assert.ok(manifest.scripts.test);
  assert.ok(manifest.scripts.check);
  // pnpm strips publish-only lifecycle scripts from packed manifests.
  // The shipped check command remains the executable release gate in either form.
  assert.equal(manifest.scripts.prepack ?? manifest.scripts.check, manifest.scripts.check);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
});

test('retired multi-generation font implementations and catalogs are absent', () => {
  for (const file of ['fonts-host.js', 'font-combinations-host.js', 'fonts-core.js', 'font-languages-core.js',
    'maple-fonts-host.js', 'maple-fonts-core.js', 'font-presets.json', 'font-languages.json', 'maple-font-languages.json']) {
    assert.equal(existsSync(new URL(file, root)), false, file);
  }
  assert.equal(existsSync(new URL('tests/fonts-host.test.mjs', root)), false);
  assert.equal(existsSync(new URL('tests/maple-fonts-host.test.mjs', root)), false);
});

test('release text does not contain machine-specific absolute paths or personal metadata', () => {
  for (const file of validatePackage()) {
    const value = readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(value, /(?:^|[\s"'`(])[A-Za-z]:[\\/]|(?:^|[\s"'`(])\/(?:Users|home)\//m, file);
    assert.doesNotMatch(value, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, file);
  }
  for (const field of ['author', 'contributors', 'maintainers', 'repository', 'homepage', 'bugs']) {
    assert.equal(manifest[field], undefined);
  }
});
