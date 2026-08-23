import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);

const cli = (args, opts = {}) =>
  run(process.execPath, [join(ROOT, 'src', 'cli.mjs'), ...args], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, ...opts });

test('the CLI exits 0 and prints a table for a normal query', async () => {
  const { stdout } = await cli(['--limit', '3', 'name:fox']);
  assert.match(stdout, /query: name:fox/);
  assert.match(stdout, /🦊/u);
});

test('the CLI emits valid JSON with --json', async () => {
  const { stdout } = await cli(['--json', '--limit', '2', 'alt:lying']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.query, 'alt:lying');
  assert.ok(parsed.total >= 1);
  assert.equal(parsed.results[0].emoji, '🧢');
});

test('the explicit gate is closed by default in the CLI', async () => {
  const closed = JSON.parse((await cli(['--json', 'reg:substances'])).stdout);
  assert.equal(closed.total, 0);
  const open = JSON.parse((await cli(['--json', '--explicit', 'reg:substances'])).stdout);
  assert.ok(open.total > 0);
});

/**
 * Piping into a consumer that exits early (`| head`) closes stdout underneath
 * the writer. Node's default reaction is an unhandled EPIPE with a stack trace,
 * which is noise: the consumer got what it asked for and left. Every entry
 * point calls tolerateClosedPipe(), and this asserts it works for real rather
 * than trusting the code path.
 */
async function assertSurvivesClosedPipe(scriptPath, args = []) {
  const child = spawn(process.execPath, [scriptPath, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });

  // Read one chunk, then destroy the pipe -- exactly what `| head -1` does.
  await new Promise((resolve) => {
    child.stdout.once('data', () => { child.stdout.destroy(); resolve(); });
    child.stdout.once('end', resolve);
    child.stdout.once('error', resolve);
  });

  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.ok(!/EPIPE|Unhandled|throw er/.test(stderr), `stack trace on closed pipe:\n${stderr}`);
  assert.notEqual(code, 1, `exited 1 on a closed pipe (stderr: ${stderr})`);
}

test('src/cli.mjs survives a closed stdout', async () => {
  await assertSurvivesClosedPipe(join(ROOT, 'src', 'cli.mjs'), ['--all', '']);
});

test('build/dataset.mjs survives a closed stdout', async () => {
  await assertSurvivesClosedPipe(join(ROOT, 'build', 'dataset.mjs'));
});

test('build/bundle.mjs survives a closed stdout', async () => {
  await assertSurvivesClosedPipe(join(ROOT, 'build', 'bundle.mjs'));
});

test('build/fetch.mjs survives a closed stdout', async () => {
  // Everything is already cached, so this is a no-op run that still prints.
  await assertSurvivesClosedPipe(join(ROOT, 'build', 'fetch.mjs'));
});
