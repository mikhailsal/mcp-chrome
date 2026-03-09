#!/usr/bin/env node
/**
 * Watch-build script for Chrome extension development.
 * 
 * Uses `wxt build --mode development` (with sourcemaps, no dev server)
 * to avoid WXT dev server's tab-reload behavior that reloads ALL browser tabs.
 * 
 * On file changes, automatically rebuilds. Reload the extension with Alt+R
 * on chrome://extensions/ to apply changes.
 */
import { execSync } from 'child_process';
import { watch } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const WATCH_DIRS = ['entrypoints', 'utils', 'components', 'workers', 'assets', 'inject-scripts'];
const DEBOUNCE_MS = 500;

let buildTimeout = null;
let building = false;

function build() {
  if (building) return;
  building = true;
  const start = Date.now();
  console.log('\n🔄 Building extension...');
  try {
    execSync('npx wxt build --mode development', {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log(`✅ Build complete in ${((Date.now() - start) / 1000).toFixed(1)}s — press Alt+R in Chrome to reload`);
  } catch {
    console.error('❌ Build failed');
  } finally {
    building = false;
  }
}

// Initial build
build();

// Watch source directories
console.log(`\n👀 Watching for changes in: ${WATCH_DIRS.join(', ')}`);
for (const dir of WATCH_DIRS) {
  const fullPath = resolve(ROOT, dir);
  try {
    watch(fullPath, { recursive: true }, (_event, filename) => {
      if (filename && (filename.endsWith('.map') || filename.startsWith('.'))) return;
      clearTimeout(buildTimeout);
      buildTimeout = setTimeout(() => {
        console.log(`\n📝 Changed: ${dir}/${filename}`);
        build();
      }, DEBOUNCE_MS);
    });
  } catch {
    // Directory might not exist, that's fine
  }
}

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Stopped watching');
  process.exit(0);
});
