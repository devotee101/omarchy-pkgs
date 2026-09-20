const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { test } = require('node:test');

const root = join(__dirname, '..');
const workflow = readFileSync(join(root, '.github/workflows/build-pr.yml'), 'utf8');
const checkoutRefs = [...workflow.matchAll(/^          ref: (.+)$/gm)].map(match => match[1]);
const pinOutput = workflow.match(/^      tooling_sha: (.+)$/m)[1];
const planOverlay = workflow.match(/      - if: github.event_name == 'pull_request'\n        run: \|\n([\s\S]*?)(?=      - id: vouch)/)[1];
const buildOverlay = workflow.match(/      - name: Overlay the PR's package directories onto base tooling[\s\S]*?        run: \|\n([\s\S]*?)(?=      - name: Build)/)[1];
const listScript = workflow.match(/      - id: list\n        run: \|\n([\s\S]*?)(?=      - id: gate)/)[1];

function render(template, context) {
  return template.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
    new Function(...Object.keys(context), `return (${expression})`)(...Object.values(context)) ?? '');
}

function fixture(t, { prTooling = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pr-build-tooling-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'source');
  mkdirSync(source);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, content, executable = false) => {
    const target = join(source, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    if (executable) chmodSync(target, 0o755);
  };
  const commit = message => {
    git(source, 'add', '.');
    git(source, 'commit', '-qm', message);
    return git(source, 'rev-parse', 'HEAD');
  };
  const recipe = name => {
    write(`pkgbuilds/${name}/PKGBUILD`, `pkgname=${name}\npkgver=1\npkgrel=1\narch=(any)\n`);
    write(`pkgbuilds/${name}/.omarchy/package.json`, '{"source":"local"}\n');
  };
  git(source, 'init', '-q', '-b', 'master');
  git(source, 'config', 'user.name', 'CI fixture');
  git(source, 'config', 'user.email', 'fixture@example.invalid');
  git(source, 'config', 'commit.gpgsign', 'false');
  git(source, 'config', 'core.hooksPath', '/dev/null');
  recipe('existing');
  const oldBase = commit('Base before CI tooling existed');
  git(source, 'checkout', '-qb', 'contributor');
  recipe('new-package');
  if (prTooling) {
    write('bin/build-matrix', '#!/bin/bash\ntouch PR_TOOLING_EXECUTED\nexit 99\n', true);
    write('bin/build', 'PR builder must not be used\n');
    write('helpers/package-metadata.sh', 'touch PR_TOOLING_EXECUTED\n');
  }
  const head = commit('Contributor recipe');
  git(source, 'checkout', '-q', 'master');
  for (const path of ['bin/build-matrix', 'helpers/paths.sh', 'helpers/package-metadata.sh']) {
    write(path, readFileSync(join(root, path)), path.startsWith('bin/'));
  }
  write('bin/build', 'trusted builder version one\n');
  recipe('base-only');
  const tooling = commit('Install CI tooling and an unrelated package on the target branch');
  const context = {
    github: { sha: 'unused-merge-sha', event_name: 'pull_request', event: {
      inputs: {}, pull_request: { base: { sha: oldBase, ref: 'master' }, head: { sha: head } },
    } },
  };
  const checkout = (name, ref) => {
    const target = join(directory, name);
    git(directory, 'clone', '-q', '--no-hardlinks', source, target);
    git(target, 'checkout', '-q', ref);
    return target;
  };
  const shell = (cwd, script, extraEnv = {}) => execFileSync('bash', ['-e', '-o', 'pipefail', '-c', render(script, context)], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI_ARCHES: 'x86_64 aarch64', ...extraEnv },
  });
  const plan = () => {
    const target = checkout('plan', render(checkoutRefs[0], context));
    const sha = git(target, 'rev-parse', 'HEAD');
    context.steps = { tooling: { outputs: { commit: sha } } };
    context.needs = { changes: { outputs: { tooling_sha: render(pinOutput, context) } } };
    shell(target, planOverlay);
    const output = join(directory, 'outputs');
    shell(target, listScript, { GITHUB_OUTPUT: output });
    const matrix = JSON.parse(readFileSync(output, 'utf8').split('\n').find(line => line.startsWith('matrix=')).slice(7));
    return { target, sha, matrix };
  };
  return { source, context, git, write, commit, oldBase, tooling, checkout, shell, plan };
}

test('an old PR without build-matrix uses current base tooling and plans only its own package', t => {
  const f = fixture(t);
  assert.equal(f.git(f.source, 'ls-tree', f.oldBase, 'bin/build-matrix'), '');
  assert.equal(f.git(f.source, 'ls-tree', f.context.github.event.pull_request.head.sha, 'bin/build-matrix'), '');
  const planned = f.plan();
  assert.equal(planned.sha, f.tooling);
  assert.deepEqual(planned.matrix.include.map(entry => entry.package), ['new-package']);
  assert.equal(planned.matrix.include[0].arch, 'x86_64');
});

test('planning and builds ignore PR tooling and share one pinned base even if master advances', t => {
  const f = fixture(t, { prTooling: true });
  const planned = f.plan();
  assert.deepEqual(planned.matrix.include.map(entry => entry.package), ['new-package']);
  assert.equal(existsSync(join(planned.target, 'PR_TOOLING_EXECUTED')), false);
  f.write('bin/build', 'trusted builder version two\n');
  const newerBase = f.commit('Target branch advances while builders queue');
  assert.notEqual(newerBase, planned.sha);
  const builder = f.checkout('builder', render(checkoutRefs[1], f.context));
  f.shell(builder, buildOverlay);
  assert.equal(f.git(builder, 'rev-parse', 'HEAD'), planned.sha);
  assert.equal(readFileSync(join(builder, 'bin/build'), 'utf8'), 'trusted builder version one\n');
  assert.equal(readFileSync(join(builder, 'helpers/package-metadata.sh'), 'utf8'), readFileSync(join(root, 'helpers/package-metadata.sh'), 'utf8'));
  assert.ok(existsSync(join(builder, 'pkgbuilds/new-package/PKGBUILD')));
  assert.equal(existsSync(join(builder, 'PR_TOOLING_EXECUTED')), false);
});

test('manual dispatch preserves the selected commit rather than following master', t => {
  const f = fixture(t);
  f.context.github.event_name = 'workflow_dispatch';
  f.context.github.event.pull_request = { base: {} };
  f.context.github.sha = f.tooling;
  f.write('bin/build', 'newer default branch builder\n');
  f.commit('Advance master after dispatch');
  const target = f.checkout('dispatch', render(checkoutRefs[0], f.context));
  const sha = f.git(target, 'rev-parse', 'HEAD');
  assert.equal(sha, f.tooling);
  f.context.steps = { tooling: { outputs: { commit: sha } } };
  f.context.needs = { changes: { outputs: { tooling_sha: render(pinOutput, f.context) } } };
  const builder = f.checkout('builder', render(checkoutRefs[1], f.context));
  assert.equal(f.git(builder, 'rev-parse', 'HEAD'), f.tooling);
});
