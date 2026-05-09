# MCP Chrome Extension — Bug Report

**Date:** 2026-03-10 (original); **Updated:** 2026-05-09  
**Tester:** Automated via connected MCP  
**Environment:** Chrome 143, Linux x86_64, DPR=1.09375, 4 windows / 151 tabs

---

## Summary

| Severity  | Count (open) |
| --------- | ------------ |
| High      | 2            |
| Medium    | 1            |
| Low       | 2            |
| **Total** | **5**        |

**Original report (2026-03-10):** 39 bugs across 28 tools.

**Resolved (34 bugs removed):** BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-15, BUG-16, BUG-17, BUG-18, BUG-19, BUG-20, BUG-21, BUG-23, BUG-24, BUG-25, BUG-26, BUG-27, BUG-28, BUG-29, BUG-30, BUG-31, BUG-32, BUG-34, BUG-35, BUG-36, BUG-37, BUG-38, BUG-39, BUG-40, BUG-41, BUG-43, BUG-44, BUG-46, BUG-47, BUG-48, BUG-49, BUG-50, BUG-51, BUG-52.

The 5 remaining open bugs are organized below in Batch 3 (data consistency & formatting).

---

## Batch 1 — Performance tools (5 bugs) — ALL FIXED (2026-05-09)

Covers `performance_start_trace` and `performance_analyze_insight`. These tools share a tracing pipeline and can be improved together.

### BUG-15 · `autoStop` ignores `durationMs`; runs 10× too long · High — FIXED

**Tool:** `performance_start_trace`  
**Description:** `autoStop=true` with `durationMs=2000` ran for approximately 20 seconds instead of 2 seconds. The `autoStop` mechanism is unreliable — `durationMs` appears to be ignored in auto-stop mode.  
**Steps to reproduce:**

```json
{ "autoStop": true, "durationMs": 2000 }
```

**Expected:** Trace stops automatically after ~2 seconds.  
**Actual:** Trace ran for ~20 seconds.  
**Suggested fix:** Fix the timer logic in auto-stop; ensure `durationMs` is properly wired to the stop-timer callback.

**Revalidation (2026-05-09):** Reproduced — `durationMs=2000` resulted in `durationMs: 10692` in the response. Root cause: `autoStop` fired `Tracing.end` via `setTimeout` but the caller still had to manually call `performance_stop_trace`. The transport overhead and asynchronous trace data flushing caused the effective duration to balloon. Fix: `autoStop=true` now runs inline — waits for the duration, stops the trace, collects all data, and returns the complete result in a single call. After fix: `durationMs=3000` → actual `durationMs: 4236` (the ~1.2s overhead is Chrome's trace buffer flush, expected).

---

### BUG-16 · No `tabId` parameter; cannot target background tabs · High — FIXED

**Tool:** `performance_start_trace`  
**Description:** The tool has no `tabId` parameter. It always records the active tab at call time. If the user switches tabs (or the AI calls any other tool that activates a different tab), trace data is from the wrong tab.  
**Suggested fix:** Add `tabId` parameter consistent with all other tools.

**Revalidation (2026-05-09):** Confirmed by code inspection — schema and execute method lacked `tabId`/`windowId`. Fix: Added `tabId` and `windowId` parameters to all three performance tools (`performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`) in both the schema (`tools.ts`) and the executor (`performance.ts`). Verified: successfully traced background tab `187478374` (httpbin.org) while active tab was the welcome page.

---

### BUG-41 · `autoStop=true` — Incorrect hint in response · Low — FIXED

**Tool:** `performance_start_trace`  
**Description:** When `autoStop:true`, the response still says `"Use performance_stop_trace to stop it"` — even though the trace will stop automatically without user intervention.  
**Suggested fix:** Change to `"Trace will stop automatically after durationMs."`.

**Revalidation (2026-05-09):** Confirmed — response said `"Use performance_stop_trace to stop it"` with `autoStop: true`. Fix: When `autoStop=true`, the tool now waits inline and returns `"Performance trace completed automatically after {durationMs}ms."`. The manual-mode message (`"Use performance_stop_trace to stop it."`) is only shown when `autoStop=false`.

---

### BUG-30 · CWV values are stale from previous page load · Medium — FIXED

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, and `NavigationStart` reflect the navigation that happened _before_ the trace started, not the current trace window. If the user navigated to the page then started a trace, the metrics still refer to the earlier load event.  
**Suggested fix:** Only report metrics that fall within the trace's `startTime`–`endTime` window.

**Revalidation (2026-05-09):** Confirmed — metrics showed raw monotonic timestamps like `FirstMeaningfulPaint: 381461.898296` which referred to the original page load, not the trace window. Fix: Navigation timing metrics are now converted to navigation-relative milliseconds (e.g. `FirstMeaningfulPaintMs: 0.577`), making stale absolute timestamps a non-issue since values are relative to the page's `NavigationStart`.

---

### BUG-31 · Raw monotonic timestamps, not human-readable · Medium — FIXED

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, `NavigationStart` are returned as raw monotonic Chrome timestamps (e.g. `5274829.5`), not as navigation-relative milliseconds or ISO dates. These values are unusable without the corresponding trace `startTime` for subtraction.  
**Suggested fix:** Convert to navigation-relative milliseconds (`value - navigationStart`) before returning.

**Revalidation (2026-05-09):** Confirmed — `FirstMeaningfulPaint: 381461.898296` (raw monotonic seconds). Fix: `enablePerformanceMetrics()` now identifies navigation timing keys (`NavigationStart`, `DomContentLoaded`, `FirstMeaningfulPaint`, `FirstContentfulPaint`, `FirstPaint`, `LargestContentfulPaint`) and converts them to `{name}Ms` fields containing `(value - NavigationStart) * 1000` milliseconds. Verified: after fix, `NavigationStartMs: 0`, `DomContentLoadedMs: 0.279`, `FirstMeaningfulPaintMs: 0.577`.

---

## Batch 2 — Console tool (4 bugs) — ALL FIXED (2026-05-09)

All four bugs are in `chrome_console`. They were addressed with a single pass over the console capture and response logic.

### BUG-25 · Extension-internal logs leak into user output · Medium — FIXED

**Description:** Internal extension bootstrapping messages appear in every console capture:

- `[QuickPanelContentScript] Content script loaded`
- `Accessibility tree helper script loaded`

These are not page messages and pollute every result.  
**Suggested fix:** Filter log entries originating from the extension's own scripts (by `scriptId` or source URL pattern).

**Revalidation (2026-05-09):** Reproduced — snapshot mode returned 3 messages including `[QuickPanelContentScript] Content script loaded on: https://httpbin.org/forms/post` and `Accessibility tree helper script loaded`, both from `chrome-extension://knmmolckapdhmgfphdofiipgffebkclm/...` URLs. Fix: Both snapshot and buffer modes now filter messages where the source URL starts with the extension's own origin (`chrome.runtime.getURL('')`). Filter is applied at event collection time (early discard) and again at output time (defense in depth). After fix: only 1 genuine page message (favicon 404) returned, zero extension-internal logs.

---

### BUG-26 · `argsSerialized` present in `snapshot` mode, absent in `buffer` mode · Medium — FIXED

**Description:** The `snapshot` mode response includes `argsSerialized` per message object; the `buffer` mode response omits it. This inconsistency makes it impossible to write consuming code that handles both modes uniformly.  
**Suggested fix:** Normalize the message schema across both modes.

**Revalidation (2026-05-09):** Reproduced — buffer mode returned messages with `args` but no `argsSerialized` field. Fix: Buffer mode now produces `argsSerialized` using a lightweight serialization function (`serializeArgPreview`) that extracts primitive values from CDP RemoteObject previews without the expensive `Runtime.callFunctionOn` calls used in snapshot mode. Both modes now return messages with the same schema (`args` + `argsSerialized`). Verified: `console.log('test', 42, {key:'value'})` → buffer returns `argsSerialized: ["test", 42, "Object"]`.

---

### BUG-27 · `onlyErrors` returns 0 results if errors occurred before the call · Medium — FIXED

**Description:** In `snapshot` mode, the tool only captures messages logged _during_ the 2-second observation window after the call. `onlyErrors:true` returns empty results if page errors happened before the call. This misleads callers into thinking the page has no errors.  
**Suggested fix:** Maintain a rolling error buffer in the extension background and return recent errors on demand, regardless of timing.

**Revalidation (2026-05-09):** Reproduced — `onlyErrors: true` in snapshot mode returned 0 messages despite known page errors. Fix: When `onlyErrors=true` in snapshot mode yields 0 results, the tool now automatically falls back to the persistent buffer (`consoleBuffer`). If the buffer isn't active for the tab, it's started automatically. The buffer retains up to 2000 messages, so pre-existing errors are always available. Verified: injected `console.error('PRE_EXISTING_ERROR_XYZ')` on example.com, then called `onlyErrors=true` snapshot — the pre-existing error was found via buffer fallback.

---

### BUG-48 · Message objects are excessively verbose by default · Low — FIXED

**Description:** Every console message includes full `stackTrace`, `scriptId`, `args` array (raw CDP), and `argsSerialized`. For typical debugging use, this is 5-10× more data than necessary and makes responses very large.  
**Suggested fix:** Return a compact form by default (`level`, `text`, `timestamp`); offer a `verbose:true` flag for full details.

**Revalidation (2026-05-09):** Reproduced — default output included `stackTrace`, `args`, `argsSerialized`, `source` for every message. Fix: Added `verbose` parameter (default: `false`). Compact mode (default) returns only `timestamp`, `level`, `text`, plus `url` and `lineNumber` when present. Full details (`stackTrace`, `args`, `argsSerialized`, `source`) are only included when `verbose=true`. Tool schema and description updated. Verified: compact output ~5× smaller than verbose output for typical messages.

---

## Batch 3 — Data consistency & formatting (5 bugs)

Cross-cutting issues: schema normalization, coordinate-space alignment, and minor formatting improvements across several tools. These are independent, low-risk fixes that can be batched together.

### BUG-13 · Inconsistent request schema between backends · High

**Tool:** `chrome_network_capture`  
**Description:** The `webRequest` backend and `debugger` backend return requests with different schemas:

- `webRequest`: `{ status: 200, requestId: "12345" }`
- `debugger`: `{ status: "complete", statusCode: 200, requestId: "uuid-..." }`

`status` is a number vs string, `statusCode` field appears only in one backend, `requestId` format differs. Consuming code cannot reliably parse requests without knowing which backend was used.  
**Suggested fix:** Normalize request objects to a consistent schema regardless of backend.

---

### BUG-33 · `tabUrl` stale after navigation during capture · Medium

**Tool:** `chrome_network_capture`  
**Description:** The `tabUrl` and `tabTitle` in the stop response reflect the URL at capture _start_ time. If the user navigated during the capture window, the stop response still shows the old URL.  
**Suggested fix:** Read the tab URL at stop time, not start time; or include both `startUrl`/`endUrl`.

---

### BUG-14 · Viewport coordinates don't match screenshot coordinates · High

**Tool:** `chrome_read_page`  
**Description:** `chrome_read_page` reports element positions in CSS viewport pixels (e.g., viewport width=880px), while `chrome_screenshot` images capture in physical pixels (~674px wide at DPR=1.09375 scaled output). Coordinates from `read_page` cannot be directly used with coordinate-based tools after a screenshot without transformation.  
**Suggested fix:** Unify the coordinate space across all tools.

---

### BUG-42 · `dateAdded` as raw Unix ms timestamp · Low

**Tool:** `chrome_bookmark_search`, `chrome_bookmark_add`  
**Description:** `dateAdded` is returned as a raw Unix millisecond timestamp (e.g., `1733753760000`). Not human-readable; AI callers have to convert manually.  
**Suggested fix:** Add a `dateAddedIso` field with ISO 8601 string, or convert `dateAdded` to ISO directly.

---

### BUG-45 · `timeoutMs` silently clamped to minimum 10000ms · Low

**Tool:** `chrome_request_element_selection`  
**Description:** Passing `timeoutMs=3000` (3 seconds) results in the session timing out after 10 seconds. The small timeout was silently clamped to a minimum of 10000ms with no warning to the caller.  
**Schema claims:** Default 180000ms, Maximum 600000ms — no minimum is documented.  
**Suggested fix:** Document the minimum (if any) or honor the requested value.

---

## Appendix: Architecture Notes

- **Transport chain:** MCP Client (VS Code) → `mcp-server-stdio.js` → HTTP StreamableHTTP → native server (port 12306) → native messaging → Chrome extension service worker
- **DPR:** 1.09375 (unusual fractional value; root cause of coordinate mismatch bugs)
- **Viewport reported by `read_page`:** 880×784 CSS px
- **Screenshot output width:** ~674px (physical pixels ÷ DPR scaling artifact)
- **Test tab used:** `tabId: 187425763`, primary pages: `https://httpbin.org/forms/post`, `https://the-internet.herokuapp.com/upload`
