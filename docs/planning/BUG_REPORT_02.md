# MCP Chrome Extension — Bug Report 02

**Date:** 2026-05-09  
**Tester:** Automated via connected MCP (Marcus / Opus 4.6)  
**Environment:** Chrome, Linux x86_64, Cursor IDE  
**Scope:** Full tool audit — all tools listed in TOOL_SCHEMAS

---

## Summary

| Severity  | Count (open) | Fixed |
| --------- | ------------ | ----- |
| High      | 0            | 1     |
| Medium    | 0            | 5     |
| Low       | 5            | 0     |
| **Total** | **5**        | **6** |

---

## Bugs

### BUG-53 · `chrome_close_tabs` with empty `tabIds` array closes active tab · High · FIXED

**Tool:** `chrome_close_tabs`  
**Description:** Passing `tabIds: []` (an empty array) closes the currently active tab instead of doing nothing. The guard condition `if (tabIds && tabIds.length > 0)` on line 647 of `common.ts` evaluates `[].length > 0` as false, causing fallthrough to the "close active tab" fallback on line 703. An empty array explicitly means "close zero tabs", not "close the active tab".  
**Steps to reproduce:**

```json
{ "tabIds": [] }
```

**Expected:** No tabs closed; response indicates 0 tabs closed.  
**Actual:** Active tab is closed (confirmed: closed tab `187478374` on `httpbin.org/forms/post`).  
**Fix applied:** Added early return check `if (Array.isArray(tabIds) && tabIds.length === 0)` in `common.ts` before the `tabIds.length > 0` guard. Returns `{ success: true, closedCount: 0 }`.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. Before fix: `chrome_close_tabs({ tabIds: [] })` closed active tab 187478415 ("Closed active tab", closedCount: 1). After fix: returns `{ success: true, message: "No tabs to close (empty tabIds array)", closedCount: 0 }`. Tab count unchanged (7 tabs before and after).

---

### BUG-54 · `chrome_history` returns raw `lastVisitTime` without human-readable format · Low

**Tool:** `chrome_history`  
**Description:** Each history item includes `lastVisitTime` as a raw Unix millisecond timestamp (e.g., `1778335192080.085`) but does not include a human-readable ISO 8601 equivalent. The `timeRange` object in the response already provides formatted times via `startTimeFormatted` / `endTimeFormatted`, and the bookmark tools (after BUG-42 fix in Report 01) include `dateAddedIso`. The history tool is inconsistent with both its own time range formatting and the bookmark tools.  
**Steps to reproduce:**

```json
{ "text": "httpbin", "maxResults": 5 }
```

**Expected:** Each item includes `lastVisitTimeIso` (e.g., `"2026-05-09T14:00:00.000Z"`) alongside the raw timestamp.  
**Actual:** Only raw `lastVisitTime: 1778335192080.085` is present.  
**Suggested fix:** Add `lastVisitTimeIso: new Date(item.lastVisitTime).toISOString()` to the response mapping at line 197 of `history.ts`, matching the pattern used in bookmark tools.

---

### BUG-55 · `chrome_handle_dialog` has no `tabId`/`windowId` parameter · Medium · FIXED

**Tool:** `chrome_handle_dialog`  
**Description:** The dialog handler always targets the active tab in the current window (`chrome.tabs.query({ active: true, currentWindow: true })`). Unlike nearly every other tool in the suite, it has no `tabId` or `windowId` parameter. This means:

1. If the user has multiple windows, the tool cannot target a dialog in a non-current window.
2. If the active tab changes between the dialog appearing and the tool being called, it will try to handle the dialog on the wrong tab.
3. The tool schema in `tools.ts` has no `tabId`/`windowId` properties, making this a schema-level omission rather than just an implementation gap.

**Steps to reproduce:** Trigger a dialog via `chrome_javascript` on a specific tab with `tabId`, then try to handle it with `chrome_handle_dialog` — no way to specify which tab's dialog to handle.  
**Expected:** `tabId` and `windowId` parameters accepted, consistent with all other tools.  
**Actual:** Only operates on the active tab in the current window.  
**Fix applied:** Added `tabId` and `windowId` parameters to both the TOOL_SCHEMAS entry in `tools.ts` and the `HandleDialogParams` interface + implementation in `dialog.ts`. Now uses `this.tryGetTab(explicitTabId)` + `this.getActiveTabOrThrowInWindow(windowId)` like other tools.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. Before fix: calling `chrome_handle_dialog` while active tab was `chrome://extensions/` returned "Cannot access a chrome:// URL" even when the dialog was on a different tab — no way to specify which tab. After fix: `tabId` and `windowId` parameters accepted in both schema and implementation, enabling targeted dialog handling. Verified that without `tabId`, the previous "Cannot access chrome://" error occurred; the new tab routing avoids this.

---

### BUG-56 · `chrome_get_web_content` always steals window focus by default · Medium · FIXED

**Tool:** `chrome_get_web_content`  
**Description:** When `background` is `false` (the default), the web fetcher unconditionally calls `chrome.windows.update(tab.windowId, { focused: true })` on line 91 of `web-fetcher.ts`. This brings the browser window to the OS foreground (on top of all other applications) on every content fetch, even when the user hasn't requested it. This is disruptive when the user is working in the IDE and the AI is fetching content in the background.

By contrast, `chrome_navigate` only focuses the window when `focusWindow=true` is explicitly set, and defaults to just activating the tab within its window (which is non-disruptive if the window is already behind other apps). The two tools have inconsistent focus semantics.

**Steps to reproduce:**

```json
{ "tabId": 187478405, "textContent": true }
```

**Expected:** Tab is activated within its window but the window is NOT brought to the OS foreground (matching `chrome_navigate`'s default behavior).  
**Actual:** Browser window is forcibly focused, interrupting the user's work.  
**Fix applied:** Removed the `chrome.windows.update(tab.windowId, { focused: true })` call from the `!background` path in `web-fetcher.ts`. Now only activates the tab within its window (via `chrome.tabs.update`), matching `chrome_navigate`'s default focus semantics.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. After fix: `chrome_get_web_content({ tabId: 187478411, textContent: true })` successfully fetched content from a non-active tab without bringing the browser window to the OS foreground. The tab was activated within its window but the window stayed behind the IDE.

---

### BUG-57 · `chrome_get_web_content` creates tab when URL provided but waits only 3s (hardcoded) · Low

**Tool:** `chrome_get_web_content`  
**Description:** When a `url` parameter is provided and no matching tab exists, the tool creates a new tab and waits for exactly 3000ms (line 69 of `web-fetcher.ts`) before fetching content. This is:

1. A hardcoded constant with no user control — some pages take much longer to load.
2. Not based on actual page load events (e.g., `webNavigation.onCompleted`), so it may fetch incomplete content on slow pages or waste time on fast pages.
3. The new tab is never cleaned up — it remains open after the content is fetched.

**Steps to reproduce:**

```json
{ "url": "https://example.com/slow-page" }
```

**Expected:** The tool waits for the page to finish loading, then fetches content. The tab behavior (stay open / close) is documented.  
**Actual:** Always waits exactly 3 seconds regardless of actual load state. Tab remains open permanently.  
**Suggested fix:** Use `chrome.tabs.onUpdated` listener or `webNavigation.onCompleted` to wait for actual page load, with a configurable timeout. Consider adding a `closeAfterFetch` option.

---

### BUG-58 · `chrome_computer` action=`fill` does not pass `tabId` to the underlying `fillTool` · Medium · FIXED

**Tool:** `chrome_computer`  
**Description:** In `computer.ts` at the `fill` action case (line 1016), the `fillTool.execute()` call passes `selector`, `selectorType`, `ref`, and `value` but does **not** forward `tabId` or `windowId`. The `fillTool` then falls back to `getActiveTabOrThrowInWindow()` to find the active tab, which may not be the tab the user intended when a `tabId` was explicitly provided to `chrome_computer`.

The same issue exists in the `fill_form` action (line 1039). By contrast, the `type` and `key` actions correctly use `clickTool.execute({ tabId: tab.id, ... })` to forward the resolved tab ID.

**Steps to reproduce:**

```json
{ "action": "fill", "ref": "ref_2", "value": "test", "tabId": 187478405 }
```

When tab `187478405` is **not** the active tab, `fillTool` will target the wrong tab.

**Expected:** The `tabId` resolved by `chrome_computer` is forwarded to `fillTool.execute()`.  
**Actual:** `fillTool` uses its own tab resolution (active tab), potentially filling the wrong tab.  
**Fix applied:** Added `tabId: tab.id` and `windowId: tab.windowId` to both `fillTool.execute()` call sites in `computer.ts`: the `fill` action and the `fill_form` loop.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. After fix: `chrome_computer({ action: "fill", ref: "ref_4", value: "test@bugfix.com", tabId: 187478405 })` successfully filled the email input on tab 187478405 (httpbin.org/forms/post) while the active tab was 187478408 (httpbin.org/html). Returned `elementInfo.value: "test@bugfix.com"` confirming correct tab targeting.

---

### BUG-59 · `chrome_network_request` has no `tabId` parameter — always uses active tab context · Low

**Tool:** `chrome_network_request`  
**Description:** The network request tool always injects its content script and sends the request from the active tab (`chrome.tabs.query({ active: true, currentWindow: true })` on line 44 of `network-request.ts`). Neither the schema nor the implementation accepts a `tabId` or `windowId` parameter. Since the request inherits cookies and browser context from the tab it runs in, the user cannot control which tab's session/cookies are used. If the active tab changes between the user's intent and the tool call, the request may use the wrong context.

**Expected:** `tabId` parameter accepted, consistent with other tools, allowing the user to specify which tab's context to use for the request.  
**Actual:** Always uses active tab's context.  
**Suggested fix:** Add `tabId`/`windowId` parameters to the schema and implementation.

---

### BUG-60 · Documentation lists `chrome_go_back_or_forward` as a separate tool, but it doesn't exist · Low

**Tool:** (documentation)  
**Description:** The README.md (line 157) lists `chrome_go_back_or_forward` as a separate tool under Browser Management. The TOOLS.md (lines 109–121) documents it with its own parameters section. However, this tool does not exist in `TOOL_SCHEMAS`, `TOOL_NAMES`, or any tool executor class. The functionality is implemented within `chrome_navigate` by passing `url: "back"` or `url: "forward"`. The documentation is misleading — AI agents and users will try to call `chrome_go_back_or_forward` and get a "tool not found" error.

**Expected:** Documentation reflects the actual tool surface (mention `chrome_navigate` with `url: "back"/"forward"` instead).  
**Actual:** Phantom tool listed in docs that doesn't exist.  
**Suggested fix:** Remove the standalone `chrome_go_back_or_forward` entry from both README.md and TOOLS.md. Instead, document the `url: "back"` / `url: "forward"` behavior under `chrome_navigate`.

---

### BUG-61 · Documentation lists `windowIds` parameter for `chrome_close_tabs`, but schema doesn't have it · Low

**Tool:** `chrome_close_tabs` (documentation)  
**Description:** TOOLS.md (line 76) documents a `windowIds` parameter for `chrome_close_tabs`: "Array of window IDs to close". However, the actual `TOOL_SCHEMAS` in `tools.ts` only defines `tabIds` and `url` properties — there is no `windowIds` property. The `CloseTabsTool` implementation in `common.ts` also has no code to handle `windowIds`.

**Expected:** Documentation matches schema — either add `windowIds` support or remove it from docs.  
**Actual:** Documented parameter that doesn't exist in schema or implementation.  
**Suggested fix:** Either implement `windowIds` support or remove it from the documentation.

---

### BUG-62 · `chrome_computer` action=`key` does not forward `tabId` in `clickTool` ref-focus and `keyboardTool` fallback · Medium · FIXED

**Tool:** `chrome_computer` (action: `key`)  
**Description:** Two sub-calls in the `key` action of `computer.ts` fail to forward the resolved `tabId`:

1. **Line 1083–1087** — When the user provides a `ref` for focus, `clickTool.execute()` is called without `tabId: tab.id`. This means the click used to focus the element before key dispatch targets the active tab, not the tab resolved by `chrome_computer`.
2. **Line 1112** — The `keyboardTool.execute()` fallback (used when CDP fails) also omits `tabId`. This means the keyboard fallback goes to the active tab.

Note: The sibling `type` action (line 943–1007) correctly forwards `tabId` in both its `clickTool.execute()` (line 945) and `keyboardTool.execute()` (line 1006) calls, making this an inconsistency within the same file.

**Expected:** `tabId: tab.id` passed to both `clickTool.execute()` (line 1084) and `keyboardTool.execute()` (line 1112).  
**Actual:** Missing `tabId`, falls back to active tab in both calls.  
**Fix applied:** Added `tabId: tab.id` to both the `clickTool.execute()` call for ref-focus and the `keyboardTool.execute()` fallback in the `key` action of `computer.ts`.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. After fix: `chrome_computer({ action: "key", text: "Tab", ref: "ref_2", tabId: 187478405 })` successfully dispatched key event with ref-focus on tab 187478405 while the active tab was 187478408. Returned `{ success: true, action: "key", keys: ["Tab"] }`.

---

### BUG-63 · `chrome_computer` action=`click`/`right_click`/`double_click` does not forward `tabId` for ref-based and selector-based clicks · Medium · FIXED

**Tool:** `chrome_computer` (actions: `click`, `right_click`, `double_click`)  
**Description:** When `chrome_computer` is called with a `ref` or `selector` target for a click action, the delegation to `clickTool.execute()` omits `tabId: tab.id`:

- **Line 504** (ref-based click): `tabId` not passed.
- **Line 515** (selector-based click): `tabId` not passed.
- **Line 551** (coordinate-based click): `tabId: tab.id` IS correctly passed.

This means ref-based and selector-based clicks from `chrome_computer` always target the active tab, even when the user specified a different `tabId` or `windowId` to `chrome_computer`. Only coordinate-based clicks correctly respect the resolved tab.

**Expected:** `tabId: tab.id` passed in all three `clickTool.execute()` call sites.  
**Actual:** Missing in ref-based and selector-based paths; present only in coordinate-based path.  
**Fix applied:** Added `tabId: tab.id` to both the ref-based and selector-based `clickTool.execute()` calls in the `left_click`/`right_click` case of `computer.ts`.

> **Revalidation (2026-05-09):** REPRODUCED → FIXED. After fix: `chrome_computer({ action: "left_click", ref: "ref_9", tabId: 187478405 })` successfully clicked checkbox ref_9 on tab 187478405 (httpbin.org/forms/post) while the active tab was 187478408 (httpbin.org/html). Returned `clickMethod: "ref"` confirming the ref path was used with correct tab targeting.

---

## Audit Notes

### Tools Tested (Functional + Source Review) — No Bugs Found

| Tool                                                            | Status                                       |
| --------------------------------------------------------------- | -------------------------------------------- |
| `get_windows_and_tabs`                                          | PASS                                         |
| `chrome_navigate`                                               | PASS                                         |
| `chrome_screenshot`                                             | PASS                                         |
| `chrome_switch_tab`                                             | PASS                                         |
| `chrome_read_page`                                              | PASS                                         |
| `chrome_click_element`                                          | PASS                                         |
| `chrome_fill_or_select`                                         | PASS                                         |
| `chrome_keyboard`                                               | PASS                                         |
| `chrome_console`                                                | PASS                                         |
| `chrome_javascript`                                             | PASS                                         |
| `chrome_network_capture` (start/stop)                           | PASS                                         |
| `chrome_bookmark_search/add/delete`                             | PASS                                         |
| `chrome_upload_file`                                            | PASS                                         |
| `chrome_handle_download`                                        | PASS                                         |
| `chrome_request_element_selection`                              | PASS (source review; human-in-the-loop tool) |
| `chrome_inject_script` / `chrome_send_command_to_inject_script` | PASS                                         |
| `chrome_userscript`                                             | PASS (source review)                         |
| `chrome_search_tabs_content`                                    | PASS (source review)                         |

### Tools with Timeouts During Testing

| Tool                                                 | Note                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `performance_start_trace` / `performance_stop_trace` | Timed out (client-side MCP timeout for long-running operations). Source code reviewed — no implementation bugs found. |
| `chrome_gif_recorder`                                | Timed out (same class of timeout). Source code reviewed — no implementation bugs found.                               |

### Bug Pattern Summary

The most prevalent bug pattern is **missing `tabId` forwarding in `chrome_computer` sub-calls** (BUG-58, BUG-62, BUG-63). The `chrome_computer` tool correctly resolves the target tab from `tabId`/`windowId` parameters, but fails to pass this resolved tab ID when delegating to `clickTool`, `fillTool`, or `keyboardTool`. This makes background-tab operations unreliable through `chrome_computer` specifically for `fill`, `fill_form`, `key` (fallback + ref focus), and `click` (ref + selector paths).
