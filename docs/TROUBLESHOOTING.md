# 🚀 Installation and Connection Issues

## Quick Diagnosis

Run the diagnostic tool to identify common issues:

```bash
mcp-chrome-bridge doctor
```

To automatically fix common issues:

```bash
mcp-chrome-bridge doctor --fix
```

## Export Report for GitHub Issues

If you need to open an issue, export a diagnostic report:

```bash
# Print Markdown report to terminal (copy/paste into GitHub Issue)
mcp-chrome-bridge report

# Write to a file
mcp-chrome-bridge report --output mcp-report.md

# Copy directly to clipboard
mcp-chrome-bridge report --copy
```

By default, usernames, paths, and tokens are redacted. Use `--no-redact` if you're comfortable sharing full paths.

## If Connection Fails After Clicking the Connect Button on the Extension

1. **Run the diagnostic tool first**

```bash
mcp-chrome-bridge doctor
```

This will check installation, manifest, permissions, and Node.js path.

2. **Check if mcp-chrome-bridge is installed successfully**, ensure it's globally installed

```bash
mcp-chrome-bridge -V
```

<img width="612" alt="Screenshot 2025-06-11 15 09 57" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

2. **Check if the manifest file is in the correct directory**

Windows path: C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts

Mac path: /Users/xxx/Library/Application\ Support/Google/Chrome/NativeMessagingHosts

If the npm package is installed correctly, a file named `com.chromemcp.nativehost.json` should be generated in this directory

3. **Check logs**
   Logs are now stored in user-writable directories:

- **macOS**: `~/Library/Logs/mcp-chrome-bridge/`
- **Windows**: `%LOCALAPPDATA%\mcp-chrome-bridge\logs\`
- **Linux**: `~/.local/state/mcp-chrome-bridge/logs/`

<img width="804" alt="Screenshot 2025-06-11 15 09 41" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />

4. **Check if you have execution permissions**
   You need to check your installation path (if unclear, open the manifest file in step 2, the path field shows the installation directory). For example, if the Mac installation path is as follows:

`xxx/node_modules/mcp-chrome-bridge/dist/run_host.sh`

Check if this script has execution permissions. Run to fix:

```bash
mcp-chrome-bridge fix-permissions
```

5. **Node.js not found**
   If you use a Node version manager (nvm, volta, asdf, fnm), the wrapper script may not find Node.js. Set the `CHROME_MCP_NODE_PATH` environment variable:

```bash
export CHROME_MCP_NODE_PATH=/path/to/your/node
```

Or run `mcp-chrome-bridge doctor --fix` to write the current Node path.

## Log Locations

Wrapper logs are now stored in user-writable locations:

- **macOS**: `~/Library/Logs/mcp-chrome-bridge/`
- **Windows**: `%LOCALAPPDATA%\mcp-chrome-bridge\logs\`
- **Linux**: `~/.local/state/mcp-chrome-bridge/logs/`

The stdio bridge (the component that VS Code / Cursor spawns) also writes diagnostic logs to **stderr** with timestamps:

```
[2026-03-10T00:24:32.401Z] [stdio-bridge] [info] Tool call: chrome_screenshot {"storeBase64":true}
[2026-03-10T00:24:32.403Z] [stdio-bridge] [info] Connecting to backend: http://127.0.0.1:12306/mcp
[2026-03-10T00:24:32.492Z] [stdio-bridge] [info] Connected to backend successfully
```

These are visible in the MCP output panel of your IDE (VS Code: "Output" → select your MCP server).

## "Error calling tool: Failed to connect to MCP server"

This error means the stdio bridge cannot connect to the native HTTP server on port 12306.

1. **Check if the native server is running:**

   ```bash
   curl -s http://127.0.0.1:12306/ping
   # Should return: {"status":"ok","message":"pong"}
   ```

2. **If ping responds but tools fail**, the MCP endpoint may be stuck. Kill and let Chrome restart it:

   ```bash
   # Find the process
   lsof -i :12306
   # Kill it (Chrome will auto-restart it via native messaging)
   kill <PID>
   ```

3. **If ping fails (connection refused)**, the extension hasn't started the native server. Open Chrome and ensure the MCP Chrome extension is enabled. Click the extension icon to trigger the native messaging connection.

## Tool Execution Timeout

If a tool starts correctly but times out before returning a result:

1. Reconnect the extension and your MCP client before retrying the tool.
2. Check whether the current page is unusually heavy, blocked by permissions, or waiting on a network response.
3. Review the wrapper and IDE MCP logs for the last tool call to see whether the timeout happened in Chrome, the native host, or the client.
4. Retry once after refreshing the target page if the tab state may be stale.

## Output Quality and Agent Differences

Different models and agent clients do not use browser tools with the same reliability or precision.

1. If a workflow behaves inconsistently, try a different agent client before assuming the extension is broken.
2. Prefer agents that handle structured tool calls well and can recover from partial tool results.
3. If results are weak, simplify the prompt and ask the model for one browser action at a time instead of a large multi-step instruction.
