const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const root = join(__dirname, '..');
const workflow = readFileSync(join(root, '.github/workflows/builder-images.yml'), 'utf8');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'builder-image-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'bin'));
  mkdirSync(join(directory, 'build'));
  cpSync(join(root, 'helpers'), join(directory, 'helpers'), { recursive: true });
  cpSync(join(root, 'bin/builder-image'), join(directory, 'bin/builder-image'));
  cpSync(join(root, 'bin/build'), join(directory, 'bin/build'));
  writeFileSync(join(directory, 'build/Dockerfile'), 'FROM scratch\nCOPY input /input\n');
  writeFileSync(join(directory, 'build/input'), 'original input\n');
  const engine = join(directory, 'engine');
  mkdirSync(engine);
  const log = join(directory, 'engine.jsonl');
  writeFileSync(join(engine, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ENGINE_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'manifest' && process.env.PRIVATE_IMAGE === '1') process.exit(1);
if (args[0] === 'push' && process.env.PUSH_FAIL === '1') process.exit(1);
if (args[0] === 'pull' && process.env.PULL_FAIL === '1') process.exit(1);
if (args[0] === 'buildx' && process.env.BUILD_FAIL === '1') process.exit(1);
if (args[0] === 'image' && args[1] === 'inspect') {
  if (!args.includes('--format') && process.env.INSPECT_FAIL === '1') process.exit(1);
  if (args.includes('{{.Id}}')) console.log('sha256:' + 'b'.repeat(64));
  else if (args.includes('--format')) console.log('ghcr.io/omacom/omarchy-pkg-builder@sha256:' + 'a'.repeat(64));
  else console.log(process.env.IMAGE_METADATA || '[]');
}
if (args[0] === 'run' && process.env.FAKE_PACKAGE_RUN === '1' && args.includes('DRY_RUN=true')) {
  const mount = args.find(arg => arg.endsWith(':/build-plan')).split(':')[0];
  fs.writeFileSync(mount + '/packages', 'example\\n');
  fs.writeFileSync(mount + '/skipped', '');
  fs.writeFileSync(mount + '/dependencies', '');
}
`);
  chmodSync(join(engine, 'docker'), 0o755);
  const env = {
    ...process.env, PATH: `${engine}:${process.env.PATH}`, CONTAINER_ENGINE: 'docker',
    ENGINE_LOG: log, ARCH: 'x86_64', MIRROR: 'edge',
  };
  const run = (args, extraEnv = {}) => spawnSync(join(directory, 'bin/builder-image'), args, {
    cwd: directory, env: { ...env, ...extraEnv }, encoding: 'utf8',
  });
  const key = (...args) => {
    const result = run(['key', ...args]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  return { directory, env, run, key, calls };
}

test('image keys are stable across checkout location and timestamp changes', t => {
  const a = fixture(t);
  const b = fixture(t);
  const key = a.key();
  assert.match(key, /^v1-x86_64-edge-[a-f0-9]{64}$/);
  utimesSync(join(b.directory, 'build/input'), new Date(0), new Date(0));
  assert.equal(b.key(), key);
});

test('image keys separate architectures, mirrors, content, modes and symlink targets', t => {
  const f = fixture(t);
  const keys = new Set([f.key(), f.key('--arch', 'aarch64'), f.key('--mirror', 'rc'), f.key('--mirror', 'stable')]);
  writeFileSync(join(f.directory, 'build/input'), 'new input\n');
  keys.add(f.key());
  chmodSync(join(f.directory, 'build/input'), 0o755);
  keys.add(f.key());
  symlinkSync('input', join(f.directory, 'build/link'));
  keys.add(f.key());
  rmSync(join(f.directory, 'build/link'));
  symlinkSync('Dockerfile', join(f.directory, 'build/link'));
  keys.add(f.key());
  assert.equal(keys.size, 8);
  mkdirSync(join(f.directory, 'pkgbuilds/example'), { recursive: true });
  const key = f.key();
  writeFileSync(join(f.directory, 'pkgbuilds/example/PKGBUILD'), 'pkgver=2\n');
  assert.equal(f.key(), key, 'package changes must not invalidate the build environment');
});

test('fresh builds refresh package layers and record their compatibility key', t => {
  const f = fixture(t);
  const key = f.key('--arch', 'aarch64');
  const result = f.run(['build', '--arch', 'aarch64', '--tag', 'candidate:test', '--fresh']);
  assert.equal(result.status, 0, result.stderr);
  const build = f.calls().find(args => args[0] === 'buildx');
  assert.ok(build.includes('--no-cache'));
  assert.ok(build.includes('--pull'));
  assert.ok(build.includes('--load'));
  assert.ok(build.includes('--platform=linux/arm64'));
  assert.ok(build.includes(`org.omarchy.builder.key=${key}`));
  assert.ok(build.includes('candidate:test'));
});

test('invalid targets fail before starting an image build', t => {
  const f = fixture(t);
  for (const args of [['key', '--arch', 'invalid'], ['build', '--mirror', 'invalid'], ['key', '--fresh']]) {
    assert.notEqual(f.run(args).status, 0);
  }
});

function publish(f, extraEnv = {}) {
  const script = workflow.split('      - name: Publish tested image\n')[1].split('        run: |\n')[1]
    .replaceAll('${{ matrix.arch }}', 'x86_64');
  return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd: f.directory, encoding: 'utf8', env: {
      ...f.env, REGISTRY_IMAGE: 'ghcr.io/omacom/omarchy-pkg-builder', CANDIDATE_IMAGE: 'candidate:test',
      GH_TOKEN: 'fixture', GH_ACTOR: 'fixture', DOCKER_CONFIG: join(f.directory, 'auth'),
      RUNNER_TEMP: f.directory, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_STEP_SUMMARY: join(f.directory, 'summary'), ...extraEnv,
    },
  });
}

test('a public tested image gets a version tag before the compatible-image tag advances', t => {
  const f = fixture(t);
  const key = f.key();
  const result = publish(f);
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.deepEqual(calls.filter(args => args[0] === 'push').map(args => args[1]), [
    `ghcr.io/omacom/omarchy-pkg-builder:${key}-123-1`, `ghcr.io/omacom/omarchy-pkg-builder:${key}`,
  ]);
  assert.ok(calls.findIndex(args => args[0] === 'manifest') < calls.findLastIndex(args => args[0] === 'push'));
});

test('a private image or failed push never replaces the previous compatible-image tag', t => {
  for (const extraEnv of [{ PRIVATE_IMAGE: '1' }, { PUSH_FAIL: '1' }]) {
    const f = fixture(t);
    const key = f.key();
    const result = publish(f, extraEnv);
    assert.notEqual(result.status, 0);
    assert.equal(f.calls().some(args => args[0] === 'push' && args[1] === `ghcr.io/omacom/omarchy-pkg-builder:${key}`), false);
  }
});

const repository = 'ghcr.io/omacom/omarchy-pkg-builder';
const digest = `${repository}@sha256:${'a'.repeat(64)}`;
const localId = `sha256:${'b'.repeat(64)}`;
function metadata(f, overrides = {}) {
  return JSON.stringify([{
    Config: { Labels: { 'org.omarchy.builder.key': f.key() } },
    Architecture: 'amd64', Os: 'linux', RepoDigests: [digest], ...overrides,
  }]);
}

test('a matching image is selected by input key and pinned to its registry digest', t => {
  const f = fixture(t);
  const result = f.run(['prepare'], { IMAGE_METADATA: metadata(f) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), digest);
  assert.deepEqual(f.calls().find(args => args[0] === 'pull'), ['pull', '--platform=linux/amd64', `${repository}:${f.key()}`]);
  assert.equal(f.calls().some(args => args[0] === 'buildx'), false);
});

test('mismatched or incomplete registry metadata falls back to this checkout and pins the local image', t => {
  for (const overrides of [
    { Config: { Labels: { 'org.omarchy.builder.key': 'different-inputs' } } },
    { Config: {} }, { Architecture: 'arm64' }, { Os: 'windows' },
    { RepoDigests: [] }, { RepoDigests: [`${repository}@sha256:invalid`] },
    { RepoDigests: ['unrelated.example/builder@sha256:' + 'a'.repeat(64)] },
  ]) {
    const f = fixture(t);
    const result = f.run(['prepare'], { IMAGE_METADATA: metadata(f, overrides) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), localId);
    const build = f.calls().find(args => args[0] === 'buildx');
    assert.equal(build.at(-1), join(f.directory, 'build'));
    assert.ok(build.includes('MIRROR=edge'));
  }
});

test('missing or inaccessible images and inspection failures preserve local builds', t => {
  for (const extraEnv of [{ PULL_FAIL: '1' }, { INSPECT_FAIL: '1' }]) {
    const f = fixture(t);
    const result = f.run(['prepare'], { IMAGE_METADATA: metadata(f), ...extraEnv });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), localId);
    assert.ok(f.calls().some(args => args[0] === 'buildx'));
    if (extraEnv.PULL_FAIL) {
      assert.ok(f.calls().findIndex(args => args[0] === 'buildx') < f.calls().findIndex(args => args[0] === 'image'), 'do not reuse a stale local tag after a failed pull');
    }
  }
});

test('a failed fallback build fails the job instead of reusing a stale image', t => {
  const f = fixture(t);
  const result = f.run(['prepare'], { PULL_FAIL: '1', BUILD_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(f.calls().some(args => args[0] === 'image'), false);
});

test('all package containers use the selected immutable image; local and explicit-image modes still work', t => {
  for (const mode of ['registry', 'fallback', 'local', 'explicit']) {
    const f = fixture(t);
    const result = spawnSync(join(f.directory, 'bin/build'), ['--package', 'example'], {
      cwd: f.directory, encoding: 'utf8', env: {
        ...f.env, IMAGE_METADATA: metadata(f), FAKE_PACKAGE_RUN: '1',
        OMARCHY_PREBUILT_IMAGES: mode === 'local' ? '0' : '1',
        OMARCHY_SKIP_BUILDER_IMAGE: mode === 'explicit' ? '1' : '0',
        PULL_FAIL: mode === 'fallback' ? '1' : '0',
      },
    });
    assert.equal(result.status, 0, `${mode}: ${result.stderr}\n${result.stdout}`);
    const calls = f.calls();
    const containers = calls.filter(args => args[0] === 'run');
    assert.equal(containers.length, 2, 'one planning container and one package container');
    const expected = mode === 'registry' ? digest : mode === 'fallback' ? localId : 'omarchy-pkg-builder:latest-x86_64-edge';
    for (const args of containers) assert.equal(args.at(-2), expected);
    if (mode === 'local' || mode === 'explicit') assert.equal(calls.some(args => args[0] === 'pull'), false);
    if (mode === 'explicit') assert.equal(calls.some(args => args[0] === 'buildx'), false);
  }
});

test('publishing prepares the same matching image only when there are artifacts', t => {
  const publishWorkflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
  const script = publishWorkflow.split('      - name: Prepare publishing image\n')[1].split('        run: |\n')[1].split('      - name: Publish\n')[0];
  for (const artifacts of [false, true]) {
    const f = fixture(t);
    if (artifacts) {
      mkdirSync(join(f.directory, 'build-output/edge/x86_64'), { recursive: true });
      writeFileSync(join(f.directory, 'build-output/edge/x86_64/example.pkg.tar.zst'), 'fixture');
    }
    const output = join(f.directory, 'outputs');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: f.directory, encoding: 'utf8', env: { ...f.env, IMAGE_METADATA: metadata(f), GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, 'utf8'), artifacts ? `image=${digest}\n` : '');
  }
});
