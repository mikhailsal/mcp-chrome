#!/usr/bin/env node
/**
 * Quality gate shared by CI and the pre-push hook: `pnpm check`.
 *
 * Known red spots that predate the gate are listed in QUARANTINE with the
 * reason. The list may only shrink; see CLAUDE.md.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'app/chrome-extension');
const NATIVE = path.join(ROOT, 'app/native-server');
const SHARED = path.join(ROOT, 'packages/shared');

export const QUARANTINE = {
  // Pre-existing ESLint errors (vue/no-mutating-props, no-undef).
  extensionLint: [
    'entrypoints/popup/components/builder/components/properties/PropertyFormRenderer.vue',
    'entrypoints/sidepanel/components/agent-chat/AgentChatShell.vue',
    'scripts/watch-build.mjs',
  ],
  // These suites load sharp, whose native binary is missing unless `pnpm rebuild sharp` ran.
  extensionTests: [
    'tests/record-replay-v3/debugger.contract.test.ts',
    'tests/record-replay-v3/e2e.integration.test.ts',
    'tests/record-replay-v3/events.contract.test.ts',
    'tests/record-replay-v3/queue.contract.test.ts',
    'tests/record-replay-v3/recovery.test.ts',
    'tests/record-replay-v3/runner.onError.contract.test.ts',
    'tests/record-replay-v3/scheduler-integration.test.ts',
    'tests/record-replay-v3/spec-smoke.test.ts',
    'tests/record-replay-v3/triggers.test.ts',
    'tests/record-replay-v3/v2-adapter-integration.test.ts',
  ],
};

const STEPS = [
  { name: 'size', cwd: ROOT, cmd: ['node', 'scripts/check-size.mjs'] },
  { name: 'build shared', cwd: SHARED, cmd: ['pnpm', 'build'] },
  { name: 'lint shared', cwd: SHARED, cmd: ['npx', 'eslint', 'src/**/*.{js,ts}'] },
  { name: 'lint native', cwd: NATIVE, cmd: ['npx', 'eslint', 'src/**/*.{js,ts}'] },
  { name: 'lint root scripts', cwd: ROOT, cmd: ['npx', 'eslint', 'scripts'] },
  { name: 'test root scripts', cwd: ROOT, cmd: ['node', '--test', 'scripts/**/*.test.mjs'] },
  {
    name: 'lint extension',
    cwd: EXT,
    cmd: [
      'npx',
      'eslint',
      '.',
      ...QUARANTINE.extensionLint.flatMap((f) => ['--ignore-pattern', f]),
    ],
  },
  { name: 'typecheck shared', cwd: SHARED, cmd: ['npx', 'tsc', '--noEmit'] },
  { name: 'typecheck native', cwd: NATIVE, cmd: ['npx', 'tsc', '--noEmit'] },
  { name: 'test native', cwd: NATIVE, cmd: ['npx', 'jest', '--coverage=false'] },
  {
    name: 'test extension',
    cwd: EXT,
    cmd: ['npx', 'vitest', 'run', ...QUARANTINE.extensionTests.flatMap((g) => ['--exclude', g])],
  },
];

function run(step) {
  const started = Date.now();
  const [bin, ...args] = step.cmd;
  const result = spawnSync(bin, args, { cwd: step.cwd, stdio: 'inherit', shell: false });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  return { name: step.name, ok: result.status === 0, secs };
}

function main(argv) {
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const steps = only ? STEPS.filter((s) => s.name.includes(only)) : STEPS;
  const results = [];
  for (const step of steps) {
    console.log(`\n=== ${step.name} ===`);
    const result = run(step);
    results.push(result);
    if (!result.ok) break;
  }
  console.log('\nGate summary:');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`);
  const failed = results.some((r) => !r.ok);
  if (failed) console.error('\nGate failed.');
  return failed ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
