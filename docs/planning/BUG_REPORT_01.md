# MCP Chrome Extension — Bug Report

**Date:** 2026-03-10 (original); **Updated:** 2026-05-09  
**Tester:** Automated via connected MCP  
**Environment:** Chrome 143, Linux x86_64, DPR=1.09375, 4 windows / 151 tabs

---

## Summary

| Severity  | Count  |
| --------- | ------ |
| High      | 4      |
| Medium    | 7      |
| Low       | 3      |
| **Total** | **14** |

**Original report (2026-03-10):** 39 bugs across 28 tools.

**Resolved (25 bugs removed):** BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-17, BUG-18, BUG-19, BUG-20, BUG-21, BUG-23, BUG-24, BUG-28, BUG-29, BUG-32, BUG-34, BUG-35, BUG-36, BUG-37, BUG-38, BUG-39, BUG-40, BUG-43, BUG-44, BUG-46, BUG-47, BUG-49, BUG-50, BUG-51, BUG-52.

The 14 remaining open bugs are organized below into three fix batches by subsystem affinity, so each batch can be tackled in a single session.

---

## Batch 1 — Performance tools (5 bugs)

Covers `performance_start_trace` and `performance_analyze_insight`. These tools share a tracing pipeline and can be improved together.

### BUG-15 · `autoStop` ignores `durationMs`; runs 10× too long · High

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

### BUG-16 · No `tabId` parameter; cannot target background tabs · High

**Tool:** `performance_start_trace`  
**Description:** The tool has no `tabId` parameter. It always records the active tab at call time. If the user switches tabs (or the AI calls any other tool that activates a different tab), trace data is from the wrong tab.  
**Suggested fix:** Add `tabId` parameter consistent with all other tools.

---

### BUG-41 · `autoStop=true` — Incorrect hint in response · Low

**Tool:** `performance_start_trace`  
**Description:** When `autoStop:true`, the response still says `"Use performance_stop_trace to stop it"` — even though the trace will stop automatically without user intervention.  
**Suggested fix:** Change to `"Trace will stop automatically after durationMs."`.

---

### BUG-30 · CWV values are stale from previous page load · Medium

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, and `NavigationStart` reflect the navigation that happened _before_ the trace started, not the current trace window. If the user navigated to the page then started a trace, the metrics still refer to the earlier load event.  
**Suggested fix:** Only report metrics that fall within the trace's `startTime`–`endTime` window.

---

### BUG-31 · Raw monotonic timestamps, not human-readable · Medium

**Tool:** `performance_analyze_insight`  
**Description:** `FirstMeaningfulPaint`, `DomContentLoaded`, `NavigationStart` are returned as raw monotonic Chrome timestamps (e.g. `5274829.5`), not as navigation-relative milliseconds or ISO dates. These values are unusable without the corresponding trace `startTime` for subtraction.  
**Suggested fix:** Convert to navigation-relative milliseconds (`value - navigationStart`) before returning.

---

## Batch 2 — Console tool (4 bugs)

All four bugs are in `chrome_console`. They can be addressed with a single pass over the console capture and response logic.

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
