import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { validatePackage } from '../scripts/build.mjs';
import * as current from '../simple-fonts-host.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

// Tests resolve the public package API, not removed implementation filenames.
for (const entry of ['fonts', 'font-combinations', 'maple-fonts', 'simple-fonts']) {
  test(`public ${entry} compatibility entry resolves to the one supported implementation`, async () => {
    const api = await import(`@local/dsh-stylelab/${entry}`);
    for (const name of ['apply', 'inject', 'createFontActions']) assert.equal(api[name], current[name]);
    for (const language of ['en', 'zh']) {
      const resolved = import.meta.resolve(`@local/dsh-stylelab/${entry}/locale/${language}.json`);
      assert.deepEqual(JSON.parse(readFileSync(new URL(resolved), 'utf8')),
        JSON.parse(readFileSync(new URL(`fonts/locale/${language}.json`, root), 'utf8')));
    }
    assert.equal(import.meta.resolve(`@local/dsh-stylelab/${entry}/icon`), new URL('icon.svg', root).href);
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
