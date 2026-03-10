# Property Panel UI Refactor Plan

## Background

The current Property Panel UI still differs significantly from the reference design in `attr-ui.html`. This document lays out the refactor work in priority order, with the goal of aligning both visual presentation and interaction behavior with the design.

### Reference Files

- **Design reference**: `attr-ui.html`
- **Current styles**: `ui/shadow-host.ts`
- **Panel structure**: `ui/property-panel/property-panel.ts`
- **Control components**: `ui/property-panel/controls/*.ts`

---

## Prerequisite Tasks (Completed)

### 0.1 Minimal Bug Fix ✅

**Issue**: when the toolbar and property panel were minimized, only the background disappeared while the contents still remained visible.

**Root cause**: CSS rules using `display: flex/inline-flex` overrode the default `display: none` behavior of the `[hidden]` attribute.

**Solution**:

- [x] Add a global `[hidden] { display: none !important; }` rule at the end of `shadow-host.ts`

### 0.2 Input Improvements ✅

**Issues**:

1. Inputs displayed placeholders instead of real values.
2. Number inputs did not support ArrowUp and ArrowDown stepping.

**Solution**:

- [x] Create the utility module `ui/property-panel/controls/number-stepping.ts`
  - Supports ArrowUp and ArrowDown keyboard stepping
  - Supports Shift (10x) and Alt (0.1x) modifiers
  - Supports multiple CSS units such as `px`, `%`, `rem`, `em`, `vh`, `vw`, `vmin`, and `vmax`
- [x] Update all controls to display real values, preferring inline values and falling back to computed values
- [x] Add keyboard stepping support to all numeric inputs:
  - `size-control.ts` - Width and Height
  - `spacing-control.ts` - Margin and Padding
  - `position-control.ts` - Top, Right, Bottom, Left, and Z-Index
  - `layout-control.ts` - Gap
  - `typography-control.ts` - Font Size and Line Height
  - `appearance-control.ts` - Opacity, Border Radius, and Border Width

---

## Phase 1: Visual System Alignment ✅ Completed

### 1.1 Color System Refactor ✅

**Goal**: move from the current gray-heavy palette to the design's white panel with gray input surfaces.

| Property         | Old value               | New value                                        | Status |
| ---------------- | ----------------------- | ------------------------------------------------ | ------ |
| Panel background | `#f8f8f8`               | `#ffffff`                                        | ✅     |
| Input background | `#f0f0f0`               | `#f3f3f3`                                        | ✅     |
| Input hover      | `#e8e8e8` background    | `border #e0e0e0` inset                           | ✅     |
| Input focus      | outer `box-shadow` ring | `inset 2px border #3b82f6` plus white background | ✅     |
| Border color     | `#e8e8e8`               | `#e5e5e5`                                        | ✅     |

**Completed work**:

- [x] Update CSS variable definitions in `shadow-host.ts`
- [x] Change input hover and focus styling to the inset-border pattern
- [x] Switch the panel background to pure white

### 1.2 Typography and Font Size Adjustments ✅

| Property             | Old value   | New value                  | Status |
| -------------------- | ----------- | -------------------------- | ------ |
| Base panel font size | `13px`      | `11px`                     | ✅     |
| Label font size      | `11px`      | `10px`                     | ✅     |
| Input font size      | `12px`      | `11px`                     | ✅     |
| Font family          | system font | Inter with system fallback | ✅     |

**Completed work**:

- [x] Add Inter font declarations with system fallback
- [x] Adjust panel, label, and input font sizes
- [x] Remove uppercase styling from labels

### 1.3 Spacing and Padding Adjustments ✅

| Property       | Old value   | New value  | Status |
| -------------- | ----------- | ---------- | ------ |
| Panel width    | `320px`     | `280px`    | ✅     |
| Header padding | `10px 14px` | `8px 12px` | ✅     |
| Body gap       | `10px`      | `12px`     | ✅     |

**Completed work**:

- [x] Adjust padding and gap on `.we-panel`, `.we-prop-body`, and `.we-field-group`
- [x] Adjust header padding

### 1.4 Corner Radius and Shadow ✅

| Property     | Old value   | New value                       | Status |
| ------------ | ----------- | ------------------------------- | ------ |
| Panel shadow | `0 1px 2px` | Tailwind `shadow-xl` equivalent | ✅     |
| Input radius | `6px`       | `4px`                           | ✅     |
| Tab shadow   | none        | `shadow-sm`                     | ✅     |

**Completed work**:

- [x] Strengthen panel shadows using a dual-layer shadow similar to `shadow-xl`
- [x] Reduce input corner radius to `4px`
- [x] Add a shadow to the active tab

### 1.5 Group and Section Style Refactor ✅

| Property          | Old style         | New style         | Status |
| ----------------- | ----------------- | ----------------- | ------ |
| Group border      | card-style border | no border         | ✅     |
| Section separator | none              | top divider       | ✅     |
| Header style      | bold and large    | `11px` and `#333` | ✅     |

**Completed work**:

- [x] Remove border and background from `.we-group`
- [x] Add top dividers between sections using `border-top`
- [x] Adjust group header styling

---

## Phase 2: Input Container Refactor ✅ Base Complete

### 2.1 Build an Input Container System ✅

**Background**: in the design, inputs are not plain standalone fields. They are container-based components that support:

- Prefixes, such as labels and icons
- Suffixes, such as units and icons
- Hover and focus styling driven by the container rather than the input itself

**Current structure**:

```html
<div class="we-field">
  <span class="we-field-label">Width</span>
  <input class="we-input" />
</div>
```

**Target structure**:

```html
<div class="we-field">
  <span class="we-field-label">Position</span>
  <div class="we-input-container">
    <!-- New container -->
    <span class="we-input-container__prefix">X</span>
    <!-- Optional prefix -->
    <input class="we-input-container__input" />
    <span class="we-input-container__suffix">px</span>
    <!-- Optional suffix -->
  </div>
</div>
```

**Completed work**:

- [x] Define `.we-input-container` styles in `shadow-host.ts`
- [x] Define `.we-input-container__prefix` and `.we-input-container__suffix` styles
- [x] Create the component `ui/property-panel/components/input-container.ts`
- [x] Move hover and focus styling to the container level by using `:focus-within`

### 2.2 Update Controls to Use the New Container ✅ Completed

**Controls updated**:

- [x] `size-control.ts` - Width and Height, with a two-column layout, W/H prefixes, and dynamic unit suffixes
- [x] `spacing-control.ts` - Margin and Padding, refactored into a 2x2 grid with direction icons and dynamic unit suffixes
- [x] `position-control.ts` - Top, Right, Bottom, Left, and Z-Index, with T/R/B/L prefixes and dynamic unit suffixes
- [x] `layout-control.ts` - Gap, with an icon prefix and dynamic unit suffix
- [x] `typography-control.ts` - Font Size and Line Height, with dynamic unit suffixes and smart line-height display
- [ ] `appearance-control.ts` - Opacity, Border Radius, and Border Width, still pending

**Completed shared modules**:

- [x] Create the shared module `css-helpers.ts` with `extractUnitSuffix`, `hasExplicitUnit`, and `normalizeLength`
- [x] Move all controls onto the shared helpers to eliminate duplicate logic

---

## Phase 3: Section Structure Refactor (Pending)

### 3.1 Tab Information Architecture

**Current state**: 4 tabs: Design, CSS, Props, and DOM
**Design target**: 2 tabs: Design and CSS

**Options**:

- **Option A**: keep all 4 tabs and move overflow into a menu
- **Option B**: move Props and DOM into another entry point
- **Option C**: keep all 4 tabs and adapt the styling

**Tasks**:

- [ ] Decide on the product direction for tab count
- [ ] Implement the chosen option

---

## Phase 4: Functional Components (Pending)

### 4.1 Flow Layout Icon Group ✅ Completed

**Design location**: `attr-ui.html:133-156`
**Function**: 4 icon buttons that control `flex-direction`

```
[→] Row
[↓] Column
[←] Row Reverse
[↑] Column Reverse
```

**Completed work**:

- [x] Create the reusable component `ui/property-panel/components/icon-button-group.ts`
- [x] Add `.we-icon-button-group` styles to `shadow-host.ts`
- [x] Replace the Direction select in `layout-control.ts` with the icon group
- [x] Add matching SVG arrow icons for row, column, row-reverse, and column-reverse

### 4.2 Alignment 3x3 Grid ✅ Completed

**Design location**: `attr-ui.html:166-208`
**Function**: a 3x3 grid that controls `justify-content` and `align-items`

```
[↖][↑][↗]
[←][·][→]
[↙][↓][↘]
```

**Completed work**:

- [x] Create the component `ui/property-panel/components/alignment-grid.ts`
- [x] Add `.we-alignment-grid` styles to `shadow-host.ts`
- [x] Replace the Justify and Align selects in `layout-control.ts`
- [x] Use `beginMultiStyle` to submit both properties atomically

### 4.3 Color Picker Fixes ✅ Partially Completed

**Current issues**:

- `showPicker()` had no try/catch and could throw
- alpha channel values were dropped
- token values like `var(--xxx)` displayed incorrectly

**Completed work**:

- [x] Add error handling for `showPicker()` with try/catch and click fallback
- [x] Improve parsing and display of `var()` values by passing computed values through placeholders

**Pending**:

- [ ] Support alpha channels such as RGBA and HSLA, likely by introducing a third-party color picker
- [ ] Evaluate a third-party color picker such as `@simonwep/pickr`

---

## Phase 5: New Feature Modules (Pending)

### 5.1 Shadow and Blur Controls

**Design location**: `attr-ui.html:396-425`
**Function**:

- Enable and disable toggles
- Type selection for Drop Shadow, Inner Shadow, Layer Blur, and Backdrop Blur
- Visibility control

**CSS properties**:

- `box-shadow`
- `filter: blur()`
- `backdrop-filter: blur()`

**Tasks**:

- [x] Create `ui/property-panel/controls/effects-control.ts`
- [x] Implement parsing and editing for `box-shadow`
- [x] Implement parsing and editing for `filter`
- [x] Implement parsing and editing for `backdrop-filter`
- [x] Add the type-switching UI
- [ ] Add enable and disable toggles as a later enhancement

### 5.2 Gradient Editor

**Design location**: `attr-ui.html:269-325`
**Function**:

- Linear and radial gradient types
- Color stops
- Angle controls
- Flip button

**CSS properties**:

- `background-image: linear-gradient(...)`
- `background-image: radial-gradient(...)`

**Tasks**:

- [x] Create `ui/property-panel/controls/gradient-control.ts`
- [x] Implement gradient parsing from CSS gradient syntax into a data structure
- [x] Implement angle and position inputs
- [x] Implement editing for two color stops
- [x] Integrate it into the property panel as a standalone Gradient control group
- [ ] Add a gradient preview slider as an optional enhancement
- [ ] Add color stop create, delete, and drag interactions as an optional enhancement

### 5.3 Token or Variable Pill Display

**Design location**: `attr-ui.html:374-384`
**Function**: when a value is a CSS variable, display it as a clickable pill

**Tasks**:

- [ ] Detect `var(--xxx)` values
- [ ] Render the value using pill styling
- [ ] Open a token picker on click

---

## Phase 6: Code Quality (Ongoing)

### 6.1 Unified Styling System

- [x] All colors now use CSS variables from Phase 1
- [ ] Move all dimensions to a consistent token system
- [ ] Remove inline styles and consolidate them into `shadow-host.ts`

### 6.2 Component Reuse

- [ ] Extract common components into `ui/property-panel/components/`
- [ ] Standardize event handling patterns
- [ ] Standardize disabled and enabled state handling

### 6.3 Type Safety

- [ ] Use strict TypeScript types in all components
- [ ] Define clearer interfaces and types
- [ ] Remove `any` assertions

---

## Implementation Progress

| Phase | Task                      | Status     | Notes                                                    |
| ----- | ------------------------- | ---------- | -------------------------------------------------------- |
| 0.1   | Minimal bug fix           | ✅         | Added the global `[hidden]` rule                         |
| 0.2   | Input improvements        | ✅         | Includes number stepping and real value display          |
| 1.1   | Color system refactor     | ✅         | White panel, gray inputs, inset focus styling            |
| 1.2   | Typography and sizing     | ✅         | 11px base sizing and Inter support                       |
| 1.3   | Spacing and padding       | ✅         | More compact layout                                      |
| 1.4   | Radius and shadow         | ✅         | `shadow-xl` style with `4px` corners                     |
| 1.5   | Group and section styling | ✅         | Divider-based visual structure                           |
| 2.1   | Input container system    | ✅         | Component and CSS styles complete                        |
| 2.2   | Control migration         | ✅         | Major controls migrated and sharing `css-helpers.ts`     |
| 3.1   | Tab architecture          | Pending    |                                                          |
| 4.1   | Flow icon group           | ✅         | `icon-button-group.ts` integrated into `layout-control`  |
| 4.2   | Alignment 3x3 grid        | ✅         | `alignment-grid.ts` integrated into `layout-control`     |
| 4.3   | Color picker fixes        | ✅ Partial | `showPicker` error handling and `var()` parsing          |
| 5.1   | Shadow and Blur           | ✅         | `effects-control.ts` integrated into the property panel  |
| 5.2   | Gradient editor           | ✅         | `gradient-control.ts` integrated into the property panel |
| 5.3   | Token pill                | Pending    |                                                          |

---

## Notes

1. **Implement incrementally**: each phase should remain testable and releasable on its own.
2. **Preserve backward compatibility**: the refactor should not break existing functionality.
3. **Record design decisions**: when the reference design conflicts with product needs, document the reasoning.
4. **Watch performance**: new components should avoid unnecessary DOM work and rendering overhead.
