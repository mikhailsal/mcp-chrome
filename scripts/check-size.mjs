#!/usr/bin/env node
/**
 * Size gate: source files <= 500 lines, test files <= 1000, functions <= 80.
 *
 * Exceptions live in size-allowlist.json with the size each one had when it was
 * recorded. An exception may shrink, never grow, and nothing new may be added
 * without the maintainer's agreement.
 *
 *   node scripts/check-size.mjs            check (exit 1 on violations)
 *   node scripts/check-size.mjs --shrink   lower recorded sizes that went down
 *                                          and drop entries that now fit
 *   node scripts/check-size.mjs --init     record every current violation
 *                                          (bootstrap only, needs agreement)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureFunctions } from './size/functions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = path.join(ROOT, 'size-allowlist.json');

export const LIMITS = { source: 500, test: 1000, function: 80 };

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|vue)$/;
const EXCLUDED = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.output\//,
  /(^|\/)\.wxt\//,
  /\.d\.ts$/,
  /\.min\.js$/,
  /^app\/chrome-extension\/workers\//, // vendored onnxruntime / wasm glue
  /^packages\/wasm-simd\/pkg\//, // wasm-bindgen output
];

function isTestFile(file) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)(tests|__tests__)\//.test(file);
}

function listSourceFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  return out
    .split('\0')
    .filter((f) => f && SOURCE_EXT.test(f) && !EXCLUDED.some((re) => re.test(f)))
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .sort();
}

function countLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

/** Measure every file and every over-limit function. */
export function measure(files = listSourceFiles()) {
  const fileSizes = {};
  const functionSizes = {};
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const limit = isTestFile(file) ? LIMITS.test : LIMITS.source;
    const lines = countLines(text);
    if (lines > limit) fileSizes[file] = lines;
    for (const fn of measureFunctions(file, text)) {
      if (fn.lines > LIMITS.function) functionSizes[`${file}::${fn.name}`] = fn.lines;
    }
  }
  return { files: fileSizes, functions: functionSizes };
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return { files: {}, functions: {} };
  const data = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  return { files: data.files ?? {}, functions: data.functions ?? {} };
}

function saveAllowlist(allow) {
  const sorted = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  const body = {
    $comment:
      'Size exceptions with their recorded size. They may shrink, never grow. Run `pnpm check:size --shrink` after making one smaller.',
    files: sorted(allow.files),
    functions: sorted(allow.functions),
  };
  fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(body, null, 2)}\n`);
}

/** Compare a measurement against the allowlist. */
export function compare(current, allow) {
  const violations = [];
  const shrinkable = [];
  for (const kind of ['files', 'functions']) {
    const limit = kind === 'functions' ? `${LIMITS.function}` : 'the file limit';
    for (const [key, size] of Object.entries(current[kind])) {
      const recorded = allow[kind][key];
      if (recorded === undefined)
        violations.push(`${key}: ${size} lines (over ${limit}, not allowlisted)`);
      else if (size > recorded)
        violations.push(`${key}: ${size} lines (allowlisted at ${recorded}, may not grow)`);
      else if (size < recorded) shrinkable.push(key);
    }
    for (const key of Object.keys(allow[kind])) {
      if (current[kind][key] === undefined) shrinkable.push(key);
    }
  }
  return { violations, shrinkable };
}

function shrink(current, allow) {
  for (const kind of ['files', 'functions']) {
    for (const key of Object.keys(allow[kind])) {
      const size = current[kind][key];
      if (size === undefined) delete allow[kind][key];
      else if (size < allow[kind][key]) allow[kind][key] = size;
    }
  }
  return allow;
}

function main(argv) {
  const current = measure();
  if (argv.includes('--init')) {
    saveAllowlist(current);
    console.log(
      `Recorded ${Object.keys(current.files).length} files and ${Object.keys(current.functions).length} functions.`,
    );
    return 0;
  }
  const allow = loadAllowlist();
  if (argv.includes('--shrink')) {
    saveAllowlist(shrink(current, allow));
    console.log('Allowlist shrunk to current sizes.');
    return 0;
  }
  const { violations, shrinkable } = compare(current, allow);
  if (shrinkable.length > 0) {
    console.log(
      `${shrinkable.length} allowlist entries shrank or now fit; run with --shrink to lock that in.`,
    );
  }
  if (violations.length === 0) {
    console.log(
      `Size check passed (files <= ${LIMITS.source}, tests <= ${LIMITS.test}, functions <= ${LIMITS.function}).`,
    );
    return 0;
  }
  console.error(`Size check failed: ${violations.length} violation(s).`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    'Split the file or function by responsibility. Do not raise limits or grow the allowlist.',
  );
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
