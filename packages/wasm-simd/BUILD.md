# WASM SIMD Build Guide

## Quick Build

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### Build Options

1. **Build from the repository root** (recommended):

   ```bash
   # Build the WASM package and copy it into the Chrome extension automatically
   npm run build:wasm
   ```

2. **Build only the WASM package**:

   ```bash
   # From the packages/wasm-simd directory
   npm run build

   # Or from anywhere via pnpm filter
   pnpm --filter @chrome-mcp/wasm-simd build
   ```

3. **Development build**:
   ```bash
   npm run build:dev  # Faster, unoptimized build
   ```

### Build Artifacts

After the build completes, `pkg/` will contain:

- `simd_math.js` - JavaScript bindings
- `simd_math_bg.wasm` - WebAssembly binary
- `simd_math.d.ts` - TypeScript type definitions
- `package.json` - NPM package metadata

### Integrating with the Chrome Extension

The WASM files are copied automatically into `app/chrome-extension/workers/`, so the Chrome extension can load them directly:

```typescript
// Use inside the Chrome extension
const wasmUrl = chrome.runtime.getURL('workers/simd_math.js');
const wasmModule = await import(wasmUrl);
```

## Development Workflow

1. Update the Rust code in `src/lib.rs`.
2. Run `npm run build` to rebuild.
3. The Chrome extension will pick up the new WASM files automatically.

## Performance Testing

```bash
# Run the benchmark from the Chrome extension
import { runSIMDBenchmark } from './utils/simd-benchmark';
await runSIMDBenchmark();
```
