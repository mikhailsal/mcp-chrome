# MCP Chrome Extension — Bug Report

**Date:** 2026-03-10  
**Tester:** Automated via connected MCP  
**Tools tested:** All 28 active tools across the full API surface  
**Environment:** Chrome 143, Linux x86_64, DPR=1.09375, 4 windows / 151 tabs

---

## Summary

| Severity  | Count  |
| --------- | ------ |
| Critical  | 1      |
| High      | 8      |
| Medium    | 14     |
| Low       | 16     |
| **Total** | **39** |

**10 bugs resolved and removed since initial report:** BUG-01, BUG-03, BUG-04, BUG-05, BUG-06, BUG-17, BUG-18, BUG-19, BUG-21, BUG-23.

**Post-report addendum (2026-04-25):** BUG-52 was identified and fixed after this snapshot. The summary table above remains the original 2026-03-10 count.

**Post-report addendum (2026-04-25, GIF recorder revalidation):**

- BUG-10 is not reproducible on the current branch. A regression test now verifies that `action="start"` followed by `action="status"` stays in `isRecording:true`.
- BUG-11, BUG-12, BUG-32, BUG-39, BUG-40, and BUG-50 are fixed on the current branch.
- Regression coverage was added in `app/chrome-extension/tests/browser/gif-recorder.tool.test.ts`.

**Post-report addendum (2026-04-25, `chrome_computer` revalidation):**

- BUG-08, BUG-09, BUG-38, and BUG-46 are fixed on the current branch.
- BUG-51 is not reproducible as originally written: `https://httpbin.org/forms/post` exposes a plain `<button>` without `type="submit"`, so `button[type=submit]` and `input[type=submit]` correctly do not match. The selector-hover fallback path was still hardened, and `selector: "button"` now revalidates successfully.
- Regression coverage was added in `app/chrome-extension/tests/browser/computer.tool.test.ts` and `app/chrome-extension/tests/browser/screenshot.tool.test.ts`.

---

## `chrome_gif_recorder` (7 bugs)

### BUG-10 · Recording silently crashes after start · High — NOT REPRODUCED (2026-04-25)

**Description:** `action="start"` returns `success:true, isRecording:true`. A subsequent `action="status"` immediately returns `isRecording:false`. The recording crashes silently — no error message surfaced to the user.  
**Steps to reproduce:**

```json
{ "action": "start", "tabId": 187425763 }
{ "action": "status", "tabId": 187425763 }
```

**Expected:** `isRecording:true` in status.  
**Actual:** `isRecording:false` immediately after start.  
**Suggested fix:** Surface crash/error from the recording worker; return `success:false` with a reason if recording fails to initialize.

**Revalidation (2026-04-25):** Not reproduced on the current branch. The fixed-FPS start path already captures the first frame eagerly and now has regression coverage to ensure `status` remains active immediately after `start`.

---

### BUG-11 · `stop` breaks when `durationMs` auto-stop was used · High — FIXED (2026-04-25)

**Description:** When GIF is started with `durationMs`, it auto-stops after the duration. If the caller then issues `action="stop"`, it gets `"No recording in progress"` — the start/stop workflow is broken when `durationMs` is used. The response gives no indication that the recording already ended.  
**Suggested fix:** After auto-stop, `action="stop"` should return the finalized GIF result (or a clear "already stopped, here is the file" message).

**Fix applied (2026-04-25):** Fixed-FPS auto-stop now caches the finalized stop result. A subsequent manual `action="stop"` returns that finalized result with `alreadyStopped:true` instead of failing with `"No recording in progress"`.

---

### BUG-12 · `tabId` must be consistent but not enforced or documented · High — FIXED (2026-04-25)

**Description:** When `auto_start` is used with a specific `tabId`, all subsequent actions (`capture`, `stop`, `status`) must use the same `tabId`. However, all these actions describe `tabId` as "default: active tab", implying it's always optional. Calling `capture` without `tabId` silently fails or captures the wrong tab.  
**Suggested fix:** After `auto_start`, persist the `tabId` internally and use it automatically for all subsequent calls, OR document that `tabId` is required and must match.

**Fix applied (2026-04-25):** The recorder now persists the `auto_start` tab and automatically reuses it for `capture`, `status`, and `stop` when `tabId` is omitted. Supplying a conflicting `tabId` now returns a clear error, and the shared schema docs were updated to describe the behavior.

---

### BUG-32 · Reports wall-clock time, not GIF playback duration · Medium — FIXED (2026-04-25)

**Description:** The `durationMs` in the stop response is the wall-clock time the recording ran (e.g., 149720ms = ~150 seconds) rather than the actual GIF playback duration. At 5fps with 4 frames, the real playback is 800ms — not 150 seconds.  
**Suggested fix:** Add a `playbackDurationMs` field (`frameCount / fps * 1000`) alongside or instead of wall-clock `durationMs`.

**Fix applied (2026-04-25):** Stop and export responses now return playback timing explicitly via `playbackDurationMs`, preserve `durationMs` as the playback duration for compatibility, and expose the wall-clock value separately as `recordingElapsedMs`.

---

### BUG-39 · `export` after `clear` — Misleading error message · Low — FIXED (2026-04-25)

**Description:** Calling `action="export"` after `action="clear"` (when no recording was ever made) returns `"Use action='stop' to finish a recording first."` — but no recording was in progress. The error message guides the user to take a nonsensical action.  
**Suggested fix:** Detect the "no data" state and return `"No GIF data available. Start a new recording first."`.

**Fix applied (2026-04-25):** `action="export"` now returns `"No GIF data available. Start a new recording first."` when there is no cached GIF data.

---

### BUG-40 · `durationMs` in status response is misleading · Low — FIXED (2026-04-25)

**Description:** In the `status` response, `durationMs` represents wall-clock recording time (e.g., 28239ms = 28 seconds since start), NOT any kind of expected playback duration. The field name is ambiguous.  
**Suggested fix:** Rename to `recordingElapsedMs` in the status response to remove ambiguity.

**Fix applied (2026-04-25):** Status responses now use `recordingElapsedMs` instead of `durationMs` for both fixed-FPS and auto-capture modes.

---

### BUG-50 · `enhancedRenderingEnabled` not included in status response · Low — FIXED (2026-04-25)

**Description:** When `auto_start` is called with `enhancedRendering` config, the `status` response does not include `enhancedRenderingEnabled: true`. The caller cannot verify whether enhanced rendering was activated. (The flag IS computed in `getAutoCaptureStatus()` but not forwarded through the `status` case in `gif-recorder.ts`.)  
**Code reference:** `gif-recorder.ts` line 877–891 — status case omits `enhancedRenderingEnabled` field.  
**Suggested fix:** Add `enhancedRenderingEnabled: status.enhancedRenderingEnabled` to the status case response.

**Fix applied (2026-04-25):** Auto-capture `status` now forwards `enhancedRenderingEnabled` from `getAutoCaptureStatus()`.

---

## `chrome_computer` (5 bugs)

### BUG-08 · Screenshot pixel coords ≠ viewport CSS coords · High — FIXED (2026-04-25)

**Also affects:** `chrome_click_element`  
**Description:** Screenshot images are captured in physical pixels (scaled by DPR=1.09375), but click coordinates must be in CSS viewport pixels. When an AI reads pixel positions from a screenshot and passes them to a click action, the click lands in the wrong place. With DPR>1, all clicks are systematically offset.  
**Root cause:** `chrome_screenshot` captures at `image_width = css_width × DPR`; click coordinates are in CSS pixels. No coordinate-space documentation.  
**Impact:** Every coordinate-based click from a screenshot is wrong by a factor of DPR.  
**Suggested fix:** Either scale screenshots down to CSS-pixel space before returning, or introduce explicit coordinate-space docs and a transformation helper. `chrome_computer` partially handles this via `screenshotContextManager` but the mismatch persists for `chrome_click_element`.

**Fix applied (2026-04-25):** Screenshot context now records the actual emitted image dimensions together with helper-derived page details, so screenshot-space coordinates taken from the returned image scale back to the correct browser viewport coordinates during `chrome_computer` actions. Revalidation used the actual saved screenshot pixels rather than pre-screenshot `read_page` coordinates, because the debugger infobar can transiently change the viewport during capture.

---

### BUG-09 · `type` silently fails after `left_click` · High — FIXED (2026-04-25)

**Description:** `action="type"` after `action="left_click"` on an empty text field reports `success:true` but no text appears. The same field successfully accepts text after `action="triple_click"` (which selects then replaces). The `left_click + type` pattern is the natural usage and is not documented as broken.  
**Steps to reproduce:**

```json
{ "action": "left_click", "coordinates": {"x":160,"y":20}, "tabId": 187425763 }
{ "action": "type", "text": "Hello", "tabId": 187425763 }
```

**Expected:** "Hello" typed into the field.  
**Actual:** Field remains empty.  
**Suggested fix:** Investigate focus handling after synthetic click; ensure focus is set before dispatching key events.

**Fix applied (2026-04-25):** Coordinate `left_click` now explicitly focuses the clicked editable target, and the `type` fallback preserves the original `tabId` and uses text-mode keyboard input on that same tab. Revalidation confirmed `left_click` followed by `type` writes into the intended text field.

---

### BUG-38 · `wait` action silently clamps `duration=60` to 30; no warning · Low — FIXED (2026-04-25)

**Description:** `action="wait"` with `duration=60` is silently clamped to 30 seconds (max). The response shows `"duration":30` with no message that the original value was truncated.  
**Suggested fix:** Add `"warning": "Duration was clamped from 60s to maximum 30s."` to the response.

**Fix applied (2026-04-25):** `action="wait"` now returns a `warning` field whenever the requested duration is clamped to the 30-second maximum.

---

### BUG-46 · API parameter inconsistency: `coordinate` array vs `coordinates` object · Low — FIXED (2026-04-25)

**Description:** Hover with an array `coordinate: [x, y]` silently fails with "Provide ref or selector or coordinates for hover." The correct form is `coordinates: { "x": N, "y": N }` (an object). The error message says "or coordinates" without explaining the required format. This is confusing given other tools use different coordinate conventions.

**Fix applied (2026-04-25):** Raw MCP calls that pass `coordinate: [x, y]` now receive a format-specific validation error: `Invalid parameter "coordinate". Use coordinates: { "x": N, "y": N }.` The shared tool schema/docs were also updated to make the object shape explicit.

---

### BUG-51 · Selector-based hover fails where ref-based hover works · High — NOT REPRODUCED (2026-04-25)

**Description:** `action="hover"` works when targeting the visible submit control by `ref`, but fails when targeting the same control by CSS selector. On `https://httpbin.org/forms/post`, both `button[type=submit]` and `input[type=submit]` return `"Provide ref or selector or coordinates for hover, or failed to resolve target"` even though the visible "Submit order" control is present and ref-based hover succeeds.  
**Steps to reproduce:**

```json
{ "action": "hover", "selector": "button[type=submit]", "tabId": 187425763 }
```

**Expected:** Hover event dispatched to the visible submit control.  
**Actual:** Target resolution fails.  
**Suggested fix:** Reuse the same selector resolution path as `click`/`fill`, or surface a more specific resolution error that shows whether the selector matched zero elements or matched an unsupported target.

**Revalidation (2026-04-25):** The original selectors in the report do not match the page under test. `https://httpbin.org/forms/post` exposes a plain `<button>Submit order</button>` without `type="submit"`, so both `button[type=submit]` and `input[type=submit]` correctly return no match. On the current branch, selector-based hover succeeds with the valid selector `button`, and the fallback path was hardened to surface selector-resolution failures more explicitly.

---

## `chrome_console` (4 bugs)

### BUG-25 · Extension-internal logs leak into user output · Medium

**Description:** Internal extension bootstrapping messages appear in every console capture:

- `[QuickPanelContentScript] Content script loaded`
- `Accessibility tree helper script loaded`

These are not page messages and pollute every result.  
**Suggested fix:** Filter log entries originating from the extension's own scripts (by `scriptId` or source URL pattern).

---

### BUG-26 · `argsSerialized` present in `snapshot` mode, absent in `buffer` mode · Medium

**Description:** The `snapshot` mode response includes `argsSerialized` per message object; the `buffer` mode response omits it. This inconsistency makes it impossible to write consuming code that handles both modes uniformly.  
**Suggested fix:** Normalize the message schema across both modes.

---

### BUG-27 · `onlyErrors` returns 0 results if errors occurred before the call · Medium

**Description:** In `snapshot` mode, the tool only captures messages logged _during_ the 2-second observation window after the call. `onlyErrors:true` returns empty results if page errors happened before the call. This misleads callers into thinking the page has no errors.  
**Suggested fix:** Maintain a rolling error buffer in the extension background and return recent errors on demand, regardless of timing.

---

### BUG-48 · Message objects are excessively verbose by default · Low

**Description:** Every console message includes full `stackTrace`, `scriptId`, `args` array (raw CDP), and `argsSerialized`. For typical debugging use, this is 5-10× more data than necessary and makes responses very large.  
**Suggested fix:** Return a compact form by default (`level`, `text`, `timestamp`); offer a `verbose:true` flag for full details.

---

## `chrome_screenshot` (4 bugs)

### BUG-20 · `fullPage` + `background` — silently ignores `fullPage` · Medium

**Description:** `fullPage:true` with `background:true` silently falls back to viewport-only capture. No warning in the response. Users expect a full-page screenshot.  
**Suggested fix:** Return a warning field `{ "warning": "fullPage is not supported with background=true; viewport-only screenshot captured." }` or implement full-page CDP capture.

---

### BUG-22 · No wait-for-load; captures loading spinners · Medium

**Description:** Screenshots taken immediately after navigation show loading spinners / incomplete content. There is no built-in wait mechanism and no warning in the response that the page may not be fully loaded.  
**Suggested fix:** Add optional `waitForLoad:true` parameter, or add a `"pageStatus":"loading"` field to warn callers.

---

### BUG-52 · Default screenshot response saves a file instead of returning MCP image content · Medium — FIXED (2026-04-25)

**Description:** Calling `chrome_screenshot` without `storeBase64`/`savePng` flags returns saved-file metadata such as `fileSaved:true`, `filename`, and `fullPath`, with `base64:null`. Callers that simply ask for a screenshot receive a Downloads path instead of MCP `ImageContent`, which breaks the expected default visual workflow.  
**Steps to reproduce:**

```json
{ "tabId": 187468189 }
```

**Expected:** Screenshot returned as MCP `ImageContent` by default; file saving happens only when explicitly requested.  
**Actual:** PNG is saved to Downloads and the response is text metadata for the saved file.  
**Fix applied:** Defaulted the runtime executor and shared tool schema/docs to `storeBase64:true` and `savePng:false`, preserving file output only for explicit opt-in.

---

### BUG-47 · `fullPage=true` corrupts fixed-position elements · Low

**Description:** For pages with fixed sidebars or navbars, `fullPage:true` produces screenshots where fixed-position elements disappear or reposition incorrectly. The viewport screenshot shows them correctly; the full-page version does not.  
**Suggested fix:** Document that full-page capture may distort fixed/sticky elements, or restore them after scrolled capture.

---

## `chrome_navigate` (3 bugs)

### BUG-29 · `newWindow` — Response schema differs between modes · Medium

**Description:** `newWindow:false` response has `tabId` at the top level; `newWindow:true` response has `tabId` nested inside `tabs[0].tabId`. Consuming code must branch on which mode was used.  
**Suggested fix:** Normalize: always include `tabId` at the top level in all navigate responses.

---

### BUG-35 · `about:blank` — Exposes internal URL pattern in error · Low

**Description:** Navigating to `about:blank` returns `"Error navigating to URL: Invalid url pattern 'about:///*'"` — exposing an internal URL validation pattern to the user.  
**Suggested fix:** Catch this case; either allow `about:blank` or return `"URL scheme 'about:' is not supported."`.

---

### BUG-49 · `back`/`forward` don't confirm the resulting URL in response · Low

**Description:** After `action="back"` or `action="forward"`, the response doesn't include the URL the tab ended up on. The caller is left unaware of the current URL state.  
**Suggested fix:** Include `finalUrl` in the navigation response for history traversal actions.

---

## `performance_start_trace` (3 bugs)

### BUG-15 · `autoStop` ignores `durationMs`; runs 10× too long · High

**Description:** `autoStop=true` with `durationMs=2000` ran for approximately 20 seconds instead of 2 seconds. The `autoStop` mechanism is unreliable — `durationMs` appears to be ignored in auto-stop mode.  
**Steps to reproduce:**

```json
{ "autoStop": true, "durationMs": 2000 }
```

**Expected:** Trace stops automatically after ~2 seconds.  
**Actual:** Trace ran for ~20 seconds.  
**Suggested fix:** Fix the timer logic in auto-stop; ensure `durationMs` is properly wired to the stop-timer callback.

---

### BUG-16 · No `tabId` parameter; cannot target background tabs · High

**Description:** The tool has no `tabId` parameter. It always records the active tab at call time. If the user switches tabs (or the AI calls any other tool that activates a different tab), trace data is from the wrong tab.  
**Suggested fix:** Add `tabId` parameter consistent with all other tools.

---

### BUG-41 · `autoStop=true` — Incorrect hint in response · Low

**Description:** When `autoStop:true`, the response still says `"Use performance_stop_trace to stop it"` — even though the trace will stop automatically without user intervention.  
**Suggested fix:** Change to `"Trace will stop automatically after durationMs."`.

---

## `performance_analyze_insight` (2 bugs)

### BUG-30 · CWV values are stale from previous page load · Medium

**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, and `NavigationStart` reflect the navigation that happened _before_ the trace started, not the current trace window. If the user navigated to the page then started a trace, the metrics still refer to the earlier load event.  
**Suggested fix:** Only report metrics that fall within the trace's `startTime`–`endTime` window.

---

### BUG-31 · Raw monotonic timestamps, not human-readable · Medium

**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, `NavigationStart` are returned as raw monotonic Chrome timestamps (e.g. `5274829.5`), not as navigation-relative milliseconds or ISO dates. These values are unusable without the corresponding trace `startTime` for subtraction.  
**Suggested fix:** Convert to navigation-relative milliseconds (`value - navigationStart`) before returning.

---

## `chrome_network_capture` (2 bugs)

### BUG-13 · Inconsistent request schema between backends · High

**Description:** The `webRequest` backend and `debugger` backend return requests with different schemas:

- `webRequest`: `{ status: 200, requestId: "12345" }`
- `debugger`: `{ status: "complete", statusCode: 200, requestId: "uuid-..." }`

`status` is a number vs string, `statusCode` field appears only in one backend, `requestId` format differs. Consuming code cannot reliably parse requests without knowing which backend was used.  
**Suggested fix:** Normalize request objects to a consistent schema regardless of backend.

---

### BUG-33 · `tabUrl` stale after navigation during capture · Medium

**Description:** The `tabUrl` and `tabTitle` in the stop response reflect the URL at capture _start_ time. If the user navigated during the capture window, the stop response still shows the old URL.  
**Suggested fix:** Read the tab URL at stop time, not start time; or include both `startUrl`/`endUrl`.

---

## `chrome_read_page` (2 bugs)

### BUG-14 · Viewport coordinates don't match screenshot coordinates · High

**Related to:** BUG-08.  
**Description:** `chrome_read_page` reports element positions in CSS viewport pixels (e.g., viewport width=880px), while `chrome_screenshot` images capture in physical pixels (~674px wide at DPR=1.09375 scaled output). Coordinates from `read_page` cannot be directly used with coordinate-based tools after a screenshot without transformation.  
**Suggested fix:** Unify the coordinate space across all tools.

---

### BUG-36 · `refMapCount` off by one · Low

**Description:** `refMapCount` consistently reports one less than the actual number of refs in the response. E.g., `refMapCount=13` but refs `ref_1` through `ref_14` (=14 refs) are returned. Confirmed across multiple pages.  
**Suggested fix:** Fix the count: `refMapCount = Object.keys(refMap).length` (post-insertion count, not pre-insertion).

---

## `chrome_click_element` (1 bug)

### BUG-07 · `input[type=submit]` selector fails despite visible element · High — NOT REPRODUCED

**Status: NOT REPRODUCED (2026-04-05)**

**Description:** The selector `input[type=submit]` returns "Element not found" even when `<input type="submit">` is clearly visible on the page (confirmed via screenshot and `chrome_read_page`). Other selectors on the same page work correctly.  
**Steps to reproduce:**

```json
{ "selector": "input[type=submit]", "tabId": 187425763 }
```

**Expected:** Submit button clicked.  
**Actual:** `"Element not found: input[type=submit]"`  
**Suggested fix:** Debug attribute selector matching in the element resolver.

**Investigation (2026-04-05):**

The bug could not be reproduced. The original test page (httpbin.org/forms/post) uses `<button>Submit order</button>`, not `<input type="submit">`. The CSS attribute selector `input[type=submit]` correctly returns no match because no such element exists on that page. When tested on a page with an actual `<input type="submit">` element, `chrome_click_element` finds and clicks it successfully.

The likely cause of the original report: `chrome_read_page` shows the button as `button "Submit order" [ref=ref_14]`, which could be misread as `<input type="submit">` by an AI agent. The selector `input[type=submit]` was never going to match a `<button>` element.

**Improvements applied nonetheless:**

- [click-helper.js](../../app/chrome-extension/inject-scripts/click-helper.js) — Replaced `document.querySelector()` with `querySelectorDeep()` for shadow DOM traversal (parity with accessibility-tree-helper.js). Also fixed `isElementVisible()` to correctly handle elements inside shadow roots whose host is returned by `document.elementFromPoint()`.

---

## `chrome_network_request` (1 bug)

### BUG-02 · Whitespace URL silently fetches wrong resource (Security) · Critical

**Description:** Passing a whitespace-only URL (`"   "`) returns `success:true` with actual content fetched from the active tab's URL. No URL validation is performed; the empty/whitespace string is silently resolved to the current page URL. This can expose unintended page data or mislead the AI into using wrong content.  
**Steps to reproduce:**

```json
{ "url": "   ", "method": "GET" }
```

**Expected:** Validation error — "URL is required."  
**Actual:** `success:true` with content from the active tab's URL.  
**Suggested fix:** Trim and validate the URL before processing. Reject blank/whitespace strings with a clear error.

---

## `chrome_javascript` (1 bug)

### BUG-24 · Timeout returns raw CDP error code · Medium

**Description:** When a script times out, the error returned is `{"code":-32603,"message":"Internal error"}` — raw CDP JSON. The caller gets no indication the issue was a timeout.  
**Suggested fix:** Catch the timeout condition and return a user-friendly `"Script timed out after Xms"` message.

---

## `chrome_history` (1 bug)

### BUG-28 · Time format "1 hour ago" unsupported; misleading error message · Medium

**Description:** The tool description implies flexible relative time queries. However, "1 hour ago" fails. Only `"X days/weeks/months/years ago"` works. The error message reveals the internal supported format list but omits hours entirely. This suggests hours were never implemented.  
**Steps to reproduce:**

```json
{ "query": "github", "startTime": "1 hour ago" }
```

**Expected:** Results from the last hour.  
**Actual:** Error — `"Please use 'X days/weeks/months/years ago' format."`  
**Suggested fix:** Add hour support to the time parser, or explicitly document the supported granularities.

---

## `chrome_handle_dialog` (1 bug)

### BUG-34 · Returns raw CDP JSON error object · Medium

**Description:** When no dialog is showing, the error returned is `{"code":-32602,"message":"No dialog is showing"}` — raw CDP JSON object. Not user-friendly.  
**Suggested fix:** Transform to `{ "success": false, "error": "No dialog is currently showing." }`.

---

## `chrome_fill_or_select` (1 bug)

### BUG-37 · Schema doesn't enforce `selector`/`ref` requirement · Low

**Description:** The input schema marks only `value` as required. At runtime the tool also requires either `selector` or `ref`. The schema mismatch means AI/LLM callers won't be warned by schema validation that they need to provide a target.  
**Suggested fix:** Add `oneOf: [required: ["selector"], required: ["ref"]]` to the schema.

---

## `chrome_handle_download` (1 bug)

### BUG-43 · Error format is plain string, not structured JSON · Low

**Description:** Timeout error is returned as a plain string: `"Handle download failed: Download wait timed out"` — inconsistent with other tools that return structured JSON error objects.  
**Suggested fix:** Return `{ "success": false, "error": "Download wait timed out" }`.

---

## `chrome_upload_file` (1 bug)

### BUG-44 · Accepts nonexistent file paths and reports success · Low

**Description:** Providing a path to a nonexistent file (`/tmp/nonexistent-xyz.txt`) returns `{ "success": true, "message": "File(s) uploaded successfully" }`. The file input in the browser shows the filename but no actual file data exists. No error is surfaced.  
**Steps to reproduce:**

```json
{ "filePath": "/tmp/nonexistent-xyz.txt", "selector": "#file-upload", "tabId": 187425763 }
```

**Expected:** Error — "File not found at path: /tmp/nonexistent-xyz.txt"  
**Actual:** `success: true`  
**Suggested fix:** Validate file existence on the native server before passing to the extension.

---

## `chrome_request_element_selection` (1 bug)

### BUG-45 · `timeoutMs` silently clamped to minimum 10000ms · Low

**Description:** Passing `timeoutMs=3000` (3 seconds) results in the session timing out after 10 seconds. The small timeout was silently clamped to a minimum of 10000ms with no warning to the caller.  
**Schema claims:** Default 180000ms, Maximum 600000ms — no minimum is documented.  
**Suggested fix:** Document the minimum (if any) or honor the requested value.

---

## `chrome_bookmark_*` (1 bug)

### BUG-42 · `dateAdded` as raw Unix ms timestamp · Low

**Tool:** `chrome_bookmark_search`, `chrome_bookmark_add`  
**Description:** `dateAdded` is returned as a raw Unix millisecond timestamp (e.g., `1733753760000`). Not human-readable; AI callers have to convert manually.  
**Suggested fix:** Add a `dateAddedIso` field with ISO 8601 string, or convert `dateAdded` to ISO directly.

---

## Appendix: Architecture Notes

- **Transport chain:** MCP Client (VS Code) → `mcp-server-stdio.js` → HTTP StreamableHTTP → native server (port 12306) → native messaging → Chrome extension service worker
- **DPR:** 1.09375 (unusual fractional value; root cause of coordinate mismatch bugs)
- **Viewport reported by `read_page`:** 880×784 CSS px
- **Screenshot output width:** ~674px (physical pixels ÷ DPR scaling artifact)
- **Test tab used:** `tabId: 187425763`, primary pages: `https://httpbin.org/forms/post`, `https://the-internet.herokuapp.com/upload`
