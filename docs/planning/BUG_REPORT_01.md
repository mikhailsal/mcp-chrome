# MCP Chrome Extension — Bug Report

**Date:** 2026-03-10  
**Tester:** Automated via connected MCP  
**Tools tested:** All 28 active tools across the full API surface  
**Environment:** Chrome 143, Linux x86_64, DPR=1.09375, 4 windows / 151 tabs

---

## Summary

| Severity  | Count  |
| --------- | ------ |
| Critical  | 3      |
| High      | 14     |
| Medium    | 18     |
| Low       | 16     |
| **Total** | **51** |

---

## Critical

### BUG-01 · `chrome_keyboard` — Documented example silently fails

**Tool:** `chrome_keyboard`  
**Description:** The tool description lists `"Hello World"` as an explicit usage example (`keys="Hello World"`), but sending any plain text string fails with `"Invalid key string or combination."` — the documented example directly contradicts the implementation. Text input is not supported via `keys`; only key names and combos work.  
**Steps to reproduce:**

```json
{ "keys": "Hello", "tabId": 187425763 }
```

**Expected:** Characters typed into the focused element (as shown in the description).  
**Actual:** `"Invalid key string or combination."`  
**Suggested fix:** Either implement text-input support (press each character key), or remove the text example from the description and clearly state only key names are supported (e.g., `"Enter"`, `"Ctrl+C"`).

---

### BUG-02 · `chrome_network_request` — Whitespace URL silently fetches wrong resource (Security)

**Tool:** `chrome_network_request`  
**Description:** Passing a whitespace-only URL (`"   "`) returns `success:true` with actual content fetched from the active tab's URL. No URL validation is performed; the empty/whitespace string is silently resolved to the current page URL. This can expose unintended page data or mislead the AI into using wrong content.  
**Steps to reproduce:**

```json
{ "url": "   ", "method": "GET" }
```

**Expected:** Validation error — "URL is required."  
**Actual:** `success:true` with content from the active tab's URL.  
**Suggested fix:** Trim and validate the URL before processing. Reject blank/whitespace strings with a clear error.

---

### BUG-03 · `chrome_keyboard` — No text-input capability despite being a "keyboard" tool

**Tool:** `chrome_keyboard`  
**Description:** Despite being named "keyboard" and described as supporting "text input", the tool only dispatches named key events. Typing actual textual content (as users would expect from a keyboard tool) is entirely unsupported. The correct workaround (`chrome_computer type`) is not mentioned.  
**Steps to reproduce:**

```json
{ "keys": "TestUser@example.com", "tabId": 187425763 }
```

**Expected:** Characters typed into the focused field.  
**Actual:** `"Invalid key string or combination."`  
**Suggested fix:** Add cross-reference to `chrome_computer action=type` in the description.

---

## High

### BUG-04 · `chrome_screenshot` — Default mode fails on external pages with cryptic error

**Tool:** `chrome_screenshot`  
**Description:** Using the default mode (no `background:true`) on any external page (e.g., `example.com`, `httpbin.org`) fails with `"Extension manifest must request permission for content scripts."` There is no warning in the tool description that default mode requires special permissions. Most users will hit this immediately on common pages.  
**Steps to reproduce:**

```json
{ "tabId": <external-page-tab> }
```

**Expected:** Screenshot captured.  
**Actual:** `"Extension manifest must request permission for content scripts."`  
**Suggested fix:** Either default to `background=true` for external pages, or add a prominent note that `background:true` is required for most real-world pages.

---

### BUG-05 · `chrome_screenshot` — Silent dual code paths with no documentation

**Tool:** `chrome_screenshot`  
**Description:** `background=false` uses content scripts (fails on most external sites); `background=true` uses CDP (works everywhere). This critical behavioral difference is not mentioned in the description. The tool appears to work or fail unpredictably depending on the page type.  
**Suggested fix:** Document the two modes clearly. Consider making CDP the default or adding auto-fallback.

---

### BUG-06 · `chrome_navigate` — Wrong tab gets navigated when tabId is specified

**Tool:** `chrome_navigate`  
**Description:** When a `tabId` is specified for navigation, the tool may switch to a _different_ existing tab that already has the target URL instead of navigating the specified tab. The response says "Activated existing tab" but the wrong (unintended) tab was affected.  
**Steps to reproduce:**

```json
{ "url": "https://httpbin.org/forms/post", "tabId": 187425763 }
```

**Expected:** Tab 187425763 navigates to the URL.  
**Actual:** A different existing tab with that URL was activated; tab 187425763 remained on its current page.  
**Suggested fix:** When `tabId` is explicitly provided, always navigate that specific tab rather than looking for an existing match.

---

### BUG-07 · `chrome_click_element` — `input[type=submit]` selector fails despite visible element

**Tool:** `chrome_click_element`  
**Description:** The selector `input[type=submit]` returns "Element not found" even when `<input type="submit">` is clearly visible on the page (confirmed via screenshot and `chrome_read_page`). Other selectors on the same page work correctly.  
**Steps to reproduce:**

```json
{ "selector": "input[type=submit]", "tabId": 187425763 }
```

**Expected:** Submit button clicked.  
**Actual:** `"Element not found: input[type=submit]"`  
**Suggested fix:** Debug attribute selector matching in the element resolver.

---

### BUG-08 · `chrome_click_element` / `chrome_computer` — Screenshot pixel coords ≠ viewport CSS coords

**Tool:** `chrome_click_element`, `chrome_computer`  
**Description:** Screenshot images are captured in physical pixels (scaled by DPR=1.09375), but click coordinates must be in CSS viewport pixels. When an AI reads pixel positions from a screenshot and passes them to a click action, the click lands in the wrong place. With DPR>1, all clicks are systematically offset.  
**Root cause:** `chrome_screenshot` captures at `image_width = css_width × DPR`; click coordinates are in CSS pixels. No coordinate-space documentation.  
**Impact:** Every coordinate-based click from a screenshot is wrong by a factor of DPR.  
**Suggested fix:** Either scale screenshots down to CSS-pixel space before returning, or introduce explicit coordinate-space docs and a transformation helper. `chrome_computer` partially handles this via `screenshotContextManager` but the mismatch persists for `chrome_click_element`.

---

### BUG-09 · `chrome_computer type` — Silently fails after `left_click`

**Tool:** `chrome_computer`  
**Description:** `action="type"` after `action="left_click"` on an empty text field reports `success:true` but no text appears. The same field successfully accepts text after `action="triple_click"` (which selects then replaces). The `left_click + type` pattern is the natural usage and is not documented as broken.  
**Steps to reproduce:**

```json
{ "action": "left_click", "coordinates": {"x":160,"y":20}, "tabId": 187425763 }
{ "action": "type", "text": "Hello", "tabId": 187425763 }
```

**Expected:** "Hello" typed into the field.  
**Actual:** Field remains empty.  
**Suggested fix:** Investigate focus handling after synthetic click; ensure focus is set before dispatching key events.

---

### BUG-10 · `chrome_gif_recorder start` — Recording silently crashes after start

**Tool:** `chrome_gif_recorder`  
**Description:** `action="start"` returns `success:true, isRecording:true`. A subsequent `action="status"` immediately returns `isRecording:false`. The recording crashes silently — no error message surfaced to the user.  
**Steps to reproduce:**

```json
{ "action": "start", "tabId": 187425763 }
{ "action": "status", "tabId": 187425763 }
```

**Expected:** `isRecording:true` in status.  
**Actual:** `isRecording:false` immediately after start.  
**Suggested fix:** Surface crash/error from the recording worker; return `success:false` with a reason if recording fails to initialize.

---

### BUG-11 · `chrome_gif_recorder stop` — Breaks when `durationMs` auto-stop was used

**Tool:** `chrome_gif_recorder`  
**Description:** When GIF is started with `durationMs`, it auto-stops after the duration. If the caller then issues `action="stop"`, it gets `"No recording in progress"` — the start/stop workflow is broken when `durationMs` is used. The response gives no indication that the recording already ended.  
**Suggested fix:** After auto-stop, `action="stop"` should return the finalized GIF result (or a clear "already stopped, here is the file" message).

---

### BUG-12 · `chrome_gif_recorder` — `tabId` must be consistent but not enforced or documented

**Tool:** `chrome_gif_recorder`  
**Description:** When `auto_start` is used with a specific `tabId`, all subsequent actions (`capture`, `stop`, `status`) must use the same `tabId`. However, all these actions describe `tabId` as "default: active tab", implying it's always optional. Calling `capture` without `tabId` silently fails or captures the wrong tab.  
**Suggested fix:** After `auto_start`, persist the `tabId` internally and use it automatically for all subsequent calls, OR document that `tabId` is required and must match.

---

### BUG-13 · `chrome_network_capture` — Inconsistent request schema between backends

**Tool:** `chrome_network_capture`  
**Description:** The `webRequest` backend and `debugger` backend return requests with different schemas:

- `webRequest`: `{ status: 200, requestId: "12345" }`
- `debugger`: `{ status: "complete", statusCode: 200, requestId: "uuid-..." }`

`status` is a number vs string, `statusCode` field appears only in one backend, `requestId` format differs. Consuming code cannot reliably parse requests without knowing which backend was used.  
**Suggested fix:** Normalize request objects to a consistent schema regardless of backend.

---

### BUG-14 · `chrome_read_page` — Viewport coordinates don't match screenshot coordinates

**Tool:** `chrome_read_page`  
**Description:** `chrome_read_page` reports element positions in CSS viewport pixels (e.g., viewport width=880px), while `chrome_screenshot` images capture in physical pixels (~674px wide at DPR=1.09375 scaled output). Coordinates from `read_page` cannot be directly used with coordinate-based tools after a screenshot without transformation.  
**Related to:** BUG-08.  
**Suggested fix:** Unify the coordinate space across all tools.

---

### BUG-15 · `performance_start_trace autoStop` — Ignores `durationMs`; runs 10× too long

**Tool:** `performance_start_trace`  
**Description:** `autoStop=true` with `durationMs=2000` ran for approximately 20 seconds instead of 2 seconds. The `autoStop` mechanism is unreliable — `durationMs` appears to be ignored in auto-stop mode.  
**Steps to reproduce:**

```json
{ "autoStop": true, "durationMs": 2000 }
```

**Expected:** Trace stops automatically after ~2 seconds.  
**Actual:** Trace ran for ~20 seconds.  
**Suggested fix:** Fix the timer logic in auto-stop; ensure `durationMs` is properly wired to the stop-timer callback.

---

### BUG-16 · `performance_start_trace` — No `tabId` parameter; cannot target background tabs

**Tool:** `performance_start_trace`  
**Description:** The tool has no `tabId` parameter. It always records the active tab at call time. If the user switches tabs (or the AI calls any other tool that activates a different tab), trace data is from the wrong tab.  
**Suggested fix:** Add `tabId` parameter consistent with all other tools.

---

### BUG-51 · `chrome_computer hover` — Selector-based hover fails where ref-based hover works

**Tool:** `chrome_computer`  
**Description:** `action="hover"` works when targeting the visible submit control by `ref`, but fails when targeting the same control by CSS selector. On `https://httpbin.org/forms/post`, both `button[type=submit]` and `input[type=submit]` return `"Provide ref or selector or coordinates for hover, or failed to resolve target"` even though the visible "Submit order" control is present and ref-based hover succeeds.  
**Steps to reproduce:**

```json
{ "action": "hover", "selector": "button[type=submit]", "tabId": 187425763 }
```

**Expected:** Hover event dispatched to the visible submit control.  
**Actual:** Target resolution fails.  
**Suggested fix:** Reuse the same selector resolution path as `click`/`fill`, or surface a more specific resolution error that shows whether the selector matched zero elements or matched an unsupported target.

---

## Medium

### BUG-17 · `chrome_navigate` — Response `url` field is stale (pre-navigation URL)

**Tool:** `chrome_navigate`  
**Description:** The `url` field in the navigation response shows the _old_ URL (before navigation), not the URL the tab was navigated to. The response gives a false sense of where the tab ended up.  
**Steps to reproduce:**

```json
{ "url": "https://httpbin.org/forms/post", "tabId": 187425763 }
```

**Expected:** `{ "url": "https://httpbin.org/forms/post" }`  
**Actual:** `{ "url": "https://the-internet.herokuapp.com/upload" }` (previous URL)  
**Suggested fix:** Resolve final URL after navigation completes, not before.

---

### BUG-18 · `chrome_navigate` — New tab navigation returns empty URL

**Tool:** `chrome_navigate`  
**Description:** When `newTab:true` (or navigating to a new context), the response `url` field is an empty string `""`.  
**Suggested fix:** Wait for `tabs.onUpdated` with `status:"complete"` before building response; use the final URL.

---

### BUG-19 · `chrome_navigate width/height` — Doesn't create new window; activates existing tab

**Tool:** `chrome_navigate`  
**Description:** Passing `width` and `height` parameters is documented as creating a new window. Instead, the tool activates an existing matching tab (same URL) without creating a new window. The window dimensions have no effect.  
**Suggested fix:** Fix the window-creation logic; when `width`/`height` are supplied, always create a new window.

---

### BUG-20 · `chrome_screenshot` fullPage + background — silently ignores `fullPage`

**Tool:** `chrome_screenshot`  
**Description:** `fullPage:true` with `background:true` silently falls back to viewport-only capture. No warning in the response. Users expect a full-page screenshot.  
**Suggested fix:** Return a warning field `{ "warning": "fullPage is not supported with background=true; viewport-only screenshot captured." }` or implement full-page CDP capture.

---

### BUG-21 · `chrome_screenshot width/height` — Parameters have no visible effect

**Tool:** `chrome_screenshot`  
**Description:** Passing `width` and `height` to `chrome_screenshot` produces an image of the same size as without those parameters. The dimensions are silently ignored.  
**Suggested fix:** Either implement viewport resizing before capture, or remove these parameters and document the limitation.

---

### BUG-22 · `chrome_screenshot` — No wait-for-load; captures loading spinners

**Tool:** `chrome_screenshot`  
**Description:** Screenshots taken immediately after navigation show loading spinners / incomplete content. There is no built-in wait mechanism and no warning in the response that the page may not be fully loaded.  
**Suggested fix:** Add optional `waitForLoad:true` parameter, or add a `"pageStatus":"loading"` field to warn callers.

---

### BUG-23 · `chrome_computer screenshot` — Ignores `tabId`; always captures active tab

**Tool:** `chrome_computer`  
**Description:** `action="screenshot"` internally calls `screenshotTool.execute()` without forwarding the resolved `tab.id`. It captures whatever the focused window's active tab is, ignoring the `tabId` parameter passed to `chrome_computer`. This also bypasses the special-page restriction indirectly: calling `chrome_computer screenshot` with a `chrome://` tab ID does not fail on that page, because the tool silently captures some other active normal tab instead.  
**Steps to reproduce:**

```json
{ "action": "screenshot", "tabId": <background-tab-id> }
```

**Expected:** Screenshot of the specified background tab.  
**Actual:** Screenshot of the active tab in the focused window. When the requested tab is `chrome://extensions`, the tool still returns a screenshot of an unrelated regular tab instead of a security error.  
**Code reference:** `computer.ts` line 1285 — `screenshotTool.execute({ name: 'computer', storeBase64: true, fullPage: false })` — no `tabId` passed.  
**Suggested fix:** Pass `tabId: tab.id` to `screenshotTool.execute()`.

---

### BUG-24 · `chrome_javascript` timeout — Returns raw CDP error code

**Tool:** `chrome_javascript`  
**Description:** When a script times out, the error returned is `{"code":-32603,"message":"Internal error"}` — raw CDP JSON. The caller gets no indication the issue was a timeout.  
**Suggested fix:** Catch the timeout condition and return a user-friendly `"Script timed out after Xms"` message.

---

### BUG-25 · `chrome_console` — Extension-internal logs leak into user output

**Tool:** `chrome_console`  
**Description:** Internal extension bootstrapping messages appear in every console capture:

- `[QuickPanelContentScript] Content script loaded`
- `Accessibility tree helper script loaded`

These are not page messages and pollute every result.  
**Suggested fix:** Filter log entries originating from the extension's own scripts (by `scriptId` or source URL pattern).

---

### BUG-26 · `chrome_console` — `argsSerialized` present in `snapshot` mode, absent in `buffer` mode

**Tool:** `chrome_console`  
**Description:** The `snapshot` mode response includes `argsSerialized` per message object; the `buffer` mode response omits it. This inconsistency makes it impossible to write consuming code that handles both modes uniformly.  
**Suggested fix:** Normalize the message schema across both modes.

---

### BUG-27 · `chrome_console onlyErrors` — Returns 0 results if errors occurred before the call

**Tool:** `chrome_console`  
**Description:** In `snapshot` mode, the tool only captures messages logged _during_ the 2-second observation window after the call. `onlyErrors:true` returns empty results if page errors happened before the call. This misleads callers into thinking the page has no errors.  
**Suggested fix:** Maintain a rolling error buffer in the extension background and return recent errors on demand, regardless of timing.

---

### BUG-28 · `chrome_history` — Time format "1 hour ago" unsupported; misleading error message

**Tool:** `chrome_history`  
**Description:** The tool description implies flexible relative time queries. However, "1 hour ago" fails. Only `"X days/weeks/months/years ago"` works. The error message reveals the internal supported format list but omits hours entirely. This suggests hours were never implemented.  
**Steps to reproduce:**

```json
{ "query": "github", "startTime": "1 hour ago" }
```

**Expected:** Results from the last hour.  
**Actual:** Error — `"Please use 'X days/weeks/months/years ago' format."`  
**Suggested fix:** Add hour support to the time parser, or explicitly document the supported granularities.

---

### BUG-29 · `chrome_navigate newWindow` — Response schema differs between modes

**Tool:** `chrome_navigate`  
**Description:** `newWindow:false` response has `tabId` at the top level; `newWindow:true` response has `tabId` nested inside `tabs[0].tabId`. Consuming code must branch on which mode was used.  
**Suggested fix:** Normalize: always include `tabId` at the top level in all navigate responses.

---

### BUG-30 · `performance metrics` — CWV values are stale from previous page load

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, and `NavigationStart` reflect the navigation that happened _before_ the trace started, not the current trace window. If the user navigated to the page then started a trace, the metrics still refer to the earlier load event.  
**Suggested fix:** Only report metrics that fall within the trace's `startTime`–`endTime` window.

---

### BUG-31 · `performance_analyze_insight` — Raw monotonic timestamps, not human-readable

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, `NavigationStart` are returned as raw monotonic Chrome timestamps (e.g. `5274829.5`), not as navigation-relative milliseconds or ISO dates. These values are unusable without the corresponding trace `startTime` for subtraction.  
**Suggested fix:** Convert to navigation-relative milliseconds (`value - navigationStart`) before returning.

---

### BUG-32 · `chrome_gif_recorder durationMs` — Reports wall-clock time, not GIF playback duration

**Tool:** `chrome_gif_recorder`  
**Description:** The `durationMs` in the stop response is the wall-clock time the recording ran (e.g., 149720ms = ~150 seconds) rather than the actual GIF playback duration. At 5fps with 4 frames, the real playback is 800ms — not 150 seconds.  
**Suggested fix:** Add a `playbackDurationMs` field (`frameCount / fps * 1000`) alongside or instead of wall-clock `durationMs`.

---

### BUG-33 · `chrome_network_capture stop` — `tabUrl` stale after navigation during capture

**Tool:** `chrome_network_capture`  
**Description:** The `tabUrl` and `tabTitle` in the stop response reflect the URL at capture _start_ time. If the user navigated during the capture window, the stop response still shows the old URL.  
**Suggested fix:** Read the tab URL at stop time, not start time; or include both `startUrl`/`endUrl`.

---

### BUG-34 · `chrome_handle_dialog` — Returns raw CDP JSON error object

**Tool:** `chrome_handle_dialog`  
**Description:** When no dialog is showing, the error returned is `{"code":-32602,"message":"No dialog is showing"}` — raw CDP JSON object. Not user-friendly.  
**Suggested fix:** Transform to `{ "success": false, "error": "No dialog is currently showing." }`.

---

## Low

### BUG-35 · `chrome_navigate about:blank` — Exposes internal URL pattern in error

**Tool:** `chrome_navigate`  
**Description:** Navigating to `about:blank` returns `"Error navigating to URL: Invalid url pattern 'about:///*'"` — exposing an internal URL validation pattern to the user.  
**Suggested fix:** Catch this case; either allow `about:blank` or return `"URL scheme 'about:' is not supported."`.

---

### BUG-36 · `chrome_read_page` — `refMapCount` off by one

**Tool:** `chrome_read_page`  
**Description:** `refMapCount` consistently reports one less than the actual number of refs in the response. E.g., `refMapCount=13` but refs `ref_1` through `ref_14` (=14 refs) are returned. Confirmed across multiple pages.  
**Suggested fix:** Fix the count: `refMapCount = Object.keys(refMap).length` (post-insertion count, not pre-insertion).

---

### BUG-37 · `chrome_fill_or_select` — Schema doesn't enforce `selector`/`ref` requirement

**Tool:** `chrome_fill_or_select`  
**Description:** The input schema marks only `value` as required. At runtime the tool also requires either `selector` or `ref`. The schema mismatch means AI/LLM callers won't be warned by schema validation that they need to provide a target.  
**Suggested fix:** Add `oneOf: [required: ["selector"], required: ["ref"]]` to the schema.

---

### BUG-38 · `chrome_computer wait` — Silently clamps `duration=60` to 30; no warning

**Tool:** `chrome_computer`  
**Description:** `action="wait"` with `duration=60` is silently clamped to 30 seconds (max). The response shows `"duration":30` with no message that the original value was truncated.  
**Suggested fix:** Add `"warning": "Duration was clamped from 60s to maximum 30s."` to the response.

---

### BUG-39 · `chrome_gif_recorder export` after `clear` — Misleading error message

**Tool:** `chrome_gif_recorder`  
**Description:** Calling `action="export"` after `action="clear"` (when no recording was ever made) returns `"Use action='stop' to finish a recording first."` — but no recording was in progress. The error message guides the user to take a nonsensical action.  
**Suggested fix:** Detect the "no data" state and return `"No GIF data available. Start a new recording first."`.

---

### BUG-40 · `chrome_compute` screenshot — `durationMs` in GIF status is misleading

**Tool:** `chrome_gif_recorder`  
**Description:** In the `status` response, `durationMs` represents wall-clock recording time (e.g., 28239ms = 28 seconds since start), NOT any kind of expected playback duration. The field name is ambiguous.  
**Suggested fix:** Rename to `recordingElapsedMs` in the status response to remove ambiguity.

---

### BUG-41 · `performance_start_trace autoStop=true` — Incorrect hint in response

**Tool:** `performance_start_trace`  
**Description:** When `autoStop:true`, the response still says `"Use performance_stop_trace to stop it"` — even though the trace will stop automatically without user intervention.  
**Suggested fix:** Change to `"Trace will stop automatically after durationMs."`.

---

### BUG-42 · `chrome_bookmark_*` — `dateAdded` as raw Unix ms timestamp

**Tool:** `chrome_bookmark_search`, `chrome_bookmark_add`  
**Description:** `dateAdded` is returned as a raw Unix millisecond timestamp (e.g., `1733753760000`). Not human-readable; AI callers have to convert manually.  
**Suggested fix:** Add a `dateAddedIso` field with ISO 8601 string, or convert `dateAdded` to ISO directly.

---

### BUG-43 · `chrome_handle_download` — Error format is plain string, not structured JSON

**Tool:** `chrome_handle_download`  
**Description:** Timeout error is returned as a plain string: `"Handle download failed: Download wait timed out"` — inconsistent with other tools that return structured JSON error objects.  
**Suggested fix:** Return `{ "success": false, "error": "Download wait timed out" }`.

---

### BUG-44 · `chrome_upload_file` — Accepts nonexistent file paths and reports success

**Tool:** `chrome_upload_file`  
**Description:** Providing a path to a nonexistent file (`/tmp/nonexistent-xyz.txt`) returns `{ "success": true, "message": "File(s) uploaded successfully" }`. The file input in the browser shows the filename but no actual file data exists. No error is surfaced.  
**Steps to reproduce:**

```json
{ "filePath": "/tmp/nonexistent-xyz.txt", "selector": "#file-upload", "tabId": 187425763 }
```

**Expected:** Error — "File not found at path: /tmp/nonexistent-xyz.txt"  
**Actual:** `success: true`  
**Suggested fix:** Validate file existence on the native server before passing to the extension.

---

### BUG-45 · `chrome_request_element_selection` — `timeoutMs` silently clamped to minimum 10000ms

**Tool:** `chrome_request_element_selection`  
**Description:** Passing `timeoutMs=3000` (3 seconds) results in the session timing out after 10 seconds. The small timeout was silently clamped to a minimum of 10000ms with no warning to the caller.  
**Schema claims:** Default 180000ms, Maximum 600000ms — no minimum is documented.  
**Suggested fix:** Document the minimum (if any) or honor the requested value.

---

### BUG-46 · `chrome_computer` — API parameter inconsistency: `coordinate` array vs `coordinates` object

**Tool:** `chrome_computer`  
**Description:** Hover with an array `coordinate: [x, y]` silently fails with "Provide ref or selector or coordinates for hover." The correct form is `coordinates: { "x": N, "y": N }` (an object). The error message says "or coordinates" without explaining the required format. This is confusing given other tools use different coordinate conventions.

---

### BUG-47 · `chrome_screenshot fullPage=true` — Corrupts fixed-position elements

**Tool:** `chrome_screenshot`  
**Description:** For pages with fixed sidebars or navbars, `fullPage:true` produces screenshots where fixed-position elements disappear or reposition incorrectly. The viewport screenshot shows them correctly; the full-page version does not.  
**Suggested fix:** Document that full-page capture may distort fixed/sticky elements, or restore them after scrolled capture.

---

### BUG-48 · `chrome_console` — Message objects are excessively verbose by default

**Tool:** `chrome_console`  
**Description:** Every console message includes full `stackTrace`, `scriptId`, `args` array (raw CDP), and `argsSerialized`. For typical debugging use, this is 5-10× more data than necessary and makes responses very large.  
**Suggested fix:** Return a compact form by default (`level`, `text`, `timestamp`); offer a `verbose:true` flag for full details.

---

### BUG-49 · `chrome_navigate` — `back`/`forward` don't confirm the resulting URL in response

**Tool:** `chrome_navigate`  
**Description:** After `action="back"` or `action="forward"`, the response doesn't include the URL the tab ended up on. The caller is left unaware of the current URL state.  
**Suggested fix:** Include `finalUrl` in the navigation response for history traversal actions.

---

### BUG-50 · `chrome_gif_recorder status` — `enhancedRenderingEnabled` not included in response

**Tool:** `chrome_gif_recorder`  
**Description:** When `auto_start` is called with `enhancedRendering` config, the `status` response does not include `enhancedRenderingEnabled: true`. The caller cannot verify whether enhanced rendering was activated. (The flag IS computed in `getAutoCaptureStatus()` but not forwarded through the `status` case in `gif-recorder.ts`.)  
**Code reference:** `gif-recorder.ts` line 877–891 — status case omits `enhancedRenderingEnabled` field.  
**Suggested fix:** Add `enhancedRenderingEnabled: status.enhancedRenderingEnabled` to the status case response.

---

## Appendix: Architecture Notes

- **Transport chain:** MCP Client (VS Code) → `mcp-server-stdio.js` → HTTP StreamableHTTP → native server (port 12306) → native messaging → Chrome extension service worker
- **DPR:** 1.09375 (unusual fractional value; root cause of coordinate mismatch bugs)
- **Viewport reported by `read_page`:** 880×784 CSS px
- **Screenshot output width:** ~674px (physical pixels ÷ DPR scaling artifact)
- **Test tab used:** `tabId: 187425763`, primary pages: `https://httpbin.org/forms/post`, `https://the-internet.herokuapp.com/upload`
