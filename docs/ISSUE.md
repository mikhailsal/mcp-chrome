# Issue Overview

## Snapshot

- Total issues reviewed: 183
- Open: 116
- Closed: 67
- Close rate: 36.6%
- Last updated: 2025-10-11

## Main Categories

### Feature Requests

Recent requests cluster around:

- Richer browser controls such as tab groups, hover interactions, silent background execution, and better screenshot workflows.
- New integration surfaces such as Electron, n8n, SSE transport, and environment-based tool filtering.
- Better model and semantic tooling support, including offline model loading and smarter page understanding.

Representative requests:

- #215 Improve `chrome_console` so it can inspect deep objects instead of shallow copies.
- #205 Support filling fields directly from the clipboard without relying on injected scripts.
- #202 Reuse the extension in Electron-based applications.
- #175 Support running the MCP server over SSE.
- #171 Add tab group controls.
- #157 Publish to the Chrome Web Store.

### Bug Reports

Common bug themes include:

- Tool invocation errors even when the extension reports a healthy state.
- MCP session and transport mismatches.
- Chrome-specific constraints such as DevTools conflicts and file URL access behavior.
- Oversized screenshot payloads that exceed client token budgets.

Representative issues:

- #212 Tool call errors despite the tool appearing available.
- #206 Missing or invalid MCP session IDs for SSE.
- #191 `chrome_console` conflicts with an open DevTools session.
- #163 Screenshot responses exceeding maximum token limits.

### Installation and Setup

The project receives recurring setup questions about:

- Native messaging registration failures.
- Incorrect configuration formats across MCP clients.
- Missing connect buttons or confusing first-run workflows.
- Windows-specific setup details and Node.js path problems.

### Compatibility

Frequent compatibility threads focus on:

- Claude Code, Cursor, Cherry Studio, Augment, and Python-based integrations.
- Client-specific MCP configuration differences such as `streamableHttp` vs `streamable-http`.
- Browser-specific behavior around session reuse, tab targeting, and console access.

## Common Resolutions

The most repeated fixes across the issue set are:

1. Verify native messaging registration and confirm the host manifest path is correct.
2. Ensure the correct Node.js executable is discoverable by the native host.
3. Use the client-specific MCP configuration format expected by the tool.
4. Reconnect or restart the local service when the bridge and extension session drift apart.

## Documentation Links

- [Troubleshooting](TROUBLESHOOTING.md)
- [Contributing](CONTRIBUTING.md)
- [Tools](TOOLS.md)
- [Windows Installation](WINDOWS_INSTALL.md)

## Notes

This document is an English summary intended to make recurring issue patterns easier to scan. For full detail, use the GitHub Issues list directly.
