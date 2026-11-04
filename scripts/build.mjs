import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const text = file => readFileSync(resolve(root, file), 'utf8');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Validate the source-as-distribution package without generating output or loading the GUI. */
export function validatePackage() {
  const manifest = JSON.parse(text('package.json'));
  assert.notEqual(manifest.private, true, 'Package must be publishable');
  assert.equal(manifest.license, 'MIT');
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'Runtime is self-contained apart from the host');
  assert.equal(Object.keys(manifest.devDependencies ?? {}).length, 0, 'Build and tests use Node built-ins only');
  assert.deepEqual(manifest.peerDependencies, { '@deepseek-ai/schemastery': '~3.18.5' }, 'Only the native schema peer is permitted');
  assert.equal(manifest.exports['.'], './skin-preferences-host.js');
  for (const name of ['preinstall', 'install', 'postinstall']) assert.equal(manifest.scripts[name], undefined);

  function expand(pattern) {
    const target = resolve(root, pattern);
    assert.ok(!isAbsolute(relative(root, target)) && !relative(root, target).startsWith('..'), 'Resource must stay in package');
    if (!pattern.includes('*')) return existsSync(target) && statSync(target).isFile() ? [pattern] : [];
    const folder = dirname(pattern);
    const expression = new RegExp('^' + pattern.split('*').map(escape).join('[^/]*') + '$');
    return readdirSync(resolve(root, folder)).map(name => (folder === '.' ? '' : folder + '/') + name)
      .filter(name => expression.test(name) && statSync(resolve(root, name)).isFile());
  }
  const included = new Set(['package.json']);
  for (const pattern of manifest.files) {
    const matches = expand(pattern);
    assert.ok(matches.length, `Empty package files entry: ${pattern}`);
    for (const file of matches) included.add(file);
  }
  for (const target of Object.values(manifest.exports)) {
    const matches = expand(target.replace(/^\.\//, ''));
    assert.ok(matches.length, `Missing export target: ${target}`);
    for (const file of matches) assert.ok(included.has(file), `Export omitted from package: ${file}`);
  }
  for (const file of ['LICENSE', 'README.md', 'cordis.patch.yml', 'fonts/maple-NOTICE.md', 'fonts/OFL-Maple.txt',
    'scripts/build.mjs', 'tests/package.test.mjs', 'simple-font-languages.json']) {
    assert.ok(included.has(file), `Required resource omitted: ${file}`);
  }
  assert.match(text('LICENSE'), /MIT License[\s\S]*StyleLab contributors/);
  assert.match(text('fonts/OFL-Maple.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(text(manifest.dsh.bundle.patch.replace(/^\.\//, '')), /name: 'dsh-style-lab\/simple-fonts'/);
  for (const file of included) {
    assert.doesNotMatch(file, /(?:^|\/)(?:node_modules|font-sources|\.git)(?:\/|$)|\.(?:ttf|otf|woff2?|tgz|log)$/i);
    if (file.endsWith('.json')) JSON.parse(text(file));
    // Only this Host schema entry may import the explicitly declared native Schemastery peer.
    if (file.endsWith('.js') && file !== 'client.js') {
      for (const match of text(file).matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
        const dependency = match[1];
        if (dependency.startsWith('node:')) continue;
        if (file === 'skin-preferences-host.js' && dependency === '@deepseek-ai/schemastery') continue;
        assert.ok(dependency.startsWith('./'), `Unexpected external dependency in ${file}`);
        const local = relative(root, resolve(root, dirname(file), dependency)).replaceAll('\\', '/');
        assert.ok(included.has(local), `Local import omitted: ${local}`);
      }
    }
  }
  const browser = text('client.js');
  assert.deepEqual([...browser.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1]), ['react']);
  assert.doesNotMatch(browser, /font-sources|file:\/\/|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  return [...included].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const included = validatePackage();
  for (const file of included.filter(file => /\.(?:js|mjs)$/.test(file))) {
    const checked = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
    if (checked.error) throw checked.error;
    assert.equal(checked.status, 0, `Syntax check failed: ${file}`);
  }
  console.log(`Build verified ${included.length} package files; source is ready to load (no generated artifacts).`);
}
