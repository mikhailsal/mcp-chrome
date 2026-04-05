# mcp-chrome Extension Development Notes

## Extension Reload Pitfall (Critical)

### Problem

After rebuilding the Chrome extension (`pnpm build:dev`), changes may NOT take effect even after pressing Alt+R on `chrome://extensions/`.

### Root Cause

- The Chrome extension uses native messaging (`chrome.runtime.connectNative`) to communicate with the native server.
- The native server (port 12306) keeps a persistent connection to the extension's service worker.
- When the extension is reloaded, the old native messaging connection may be stale.
- Additionally, Chrome may cache the old service worker and not pick up the new `background.js` until the extension is fully removed and re-added.

### Proven Fix

1. **Remove the extension** from `chrome://extensions/` (not just disable — fully remove)
2. **Re-add** it via "Load unpacked" pointing to `.output/chrome-mv3-dev/`
3. **Restart the MCP wrapper/server** to establish a fresh connection chain
4. After reinstall, Chrome opens the extension's welcome page — navigate to a real URL (e.g. `https://example.com`) before testing

### Recommendation

When debugging "changes not taking effect":

- Do NOT just reload — **remove and re-add** the extension
- Restart any MCP servers that connect through the native messaging chain
- Verify the active tab is a real web page, not `chrome-extension://` or `chrome://` URLs (screenshots of those will fail)

## Architecture Chain

```
MCP Client (VS Code/Cursor) → mcp-server-stdio.js (global mcp-chrome-bridge)
  → HTTP StreamableHTTP → native server (port 12306, app/native-server/)
  → native messaging → Chrome extension service worker
```

## MCP Image Content Format

- MCP protocol `ImageContent`: `{ type: 'image', data: string (base64), mimeType: string }`
- NEVER use `type: 'text'` with JSON-encoded base64 for images — VS Code/Cursor won't render them
- The native server and bridge are pure pass-through proxies — all tool logic lives in the Chrome extension

## Singleton Bug (Fixed)

- `getMcpServer()` in mcp-server.ts was a singleton — caused "Already connected to transport" crash
- Changed to factory `createMcpServer()` — fresh Server instance per connection
- This was the root cause of "Failed to connect to MCP server" errors

## Local Bridge Development

- Config: `~/.cursor/mcp.json` chrome entry now points to local `app/native-server/dist/mcp/mcp-server-stdio.js`
- After modifying bridge code: `cd app/native-server && npx ts-node src/scripts/build.ts`
- Then kill old native server: `kill $(lsof -t -i :12306)` — Chrome auto-restarts it
- Stdio bridge logs go to stderr (visible in IDE MCP output panel)

## Build Hash Indicator

The extension popup displays a **build hash** in the header (e.g., `Build: a3f7c2e1`).
This is an 8-character SHA-256 hash that changes on every build or dev-server module reload.

**Purpose**: Instantly verify that the extension has been updated after a code change.
If the hash hasn't changed, the extension is still running the old code and needs to be reloaded.

**Implementation**: A custom Vite plugin (`buildHashPlugin` in `wxt.config.ts`) provides a
virtual module `virtual:build-hash` that generates a fresh hash each time it is loaded.

- In **dev mode** (`pnpm dev:extension`): the hash changes each time a file is modified and
  the popup is reopened, because the Vite dev server re-serves the virtual module.
- In **build mode** (`wxt build`): the hash is embedded at compile time, so it changes
  with every rebuild.

## Build Commands

- Dev build: `cd app/chrome-extension && pnpm build:dev`
- Watch build: `pnpm dev:extension:watch` (from repo root)
- Native server: `cd app/native-server && npx ts-node src/scripts/build.ts`
- Register native host: `cd app/native-server && node dist/scripts/register-dev.js`

# Copilot Instructions for mcp-chrome

## Chrome Extension Development — Recommended Dev Workflow

### Option 1: WXT Dev Server (recommended for fast iteration)

```bash
# From repo root:
pnpm dev:extension
```

This starts the WXT dev server with **automatic extension reloading**. When you edit source
files, WXT rebuilds and pushes updates to the extension automatically — no manual reload
needed. The popup's build hash changes on every code change, confirming the update was applied.

Load the extension from `.output/chrome-mv3-dev/` as an unpacked extension in Chrome.

**Caveat**: The WXT dev server may reload content scripts across all open tabs on startup.
If you have many tabs open and this causes issues, use Option 2 instead.
See: https://github.com/wxt-dev/wxt/issues/975

### Option 2: Watch-build script (manual reload, no dev server side effects)

```bash
# From repo root:
pnpm dev:extension:watch

# Or from app/chrome-extension/:
pnpm dev:watch
```

This runs `wxt build --mode development` (produces sourcemaps, no dev server hot-reload code)
and watches for file changes to automatically rebuild.

After a rebuild, press **Alt+R** on `chrome://extensions/` (or click the reload button on the
extension card) to reload the extension in Chrome. Check the **build hash** in the popup to
confirm the new code is loaded.

### One-off dev build (no watch)

```bash
# From app/chrome-extension/:
pnpm build:dev
```

### Verifying extension updates

After any rebuild or dev-server hot update:

1. Click the extension icon to open the popup
2. Check the **Build:** hash in the top-right corner of the header
3. If the hash matches the previous one, the extension has not been updated —
   try removing and re-adding it from `chrome://extensions/`

### Installing dependencies

`pnpm install` may fail because `app/native-server/postinstall` requires built artifacts.
Use `pnpm install --ignore-scripts` first, then build the packages manually:

```bash
pnpm install --ignore-scripts
pnpm run build:shared
cd app/native-server && npx ts-node src/scripts/build.ts
```

### Native messaging host

After building the native server, register the native messaging host for Chrome:

```bash
cd app/native-server && node dist/scripts/register-dev.js
```

If using a dev-loaded extension (unpacked), its extension ID will differ from the production ID
(`hbdgbgagpkpjffpklnamcljpakneikee`). You must add the dev extension ID to
`~/.config/google-chrome/NativeMessagingHosts/com.chromemcp.nativehost.json` in the
`allowed_origins` array.
