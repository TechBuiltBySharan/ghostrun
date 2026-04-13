# GhostRun — Flow Actions Reference

Complete reference for all actions you can use in recorded or hand-crafted `.flow.json` files.

---

## Browser Actions

### Navigation

| Action | Fields | Description |
|--------|--------|-------------|
| `navigate` | `url` | Go to URL |
| `reload` | — | Reload the current page |
| `back` | — | Browser back |
| `forward` | — | Browser forward |

### Interaction

| Action | Fields | Description |
|--------|--------|-------------|
| `click` | `selector` | Left-click an element |
| `dblclick` | `selector` | Double-click an element |
| `fill` | `selector`, `value` | Clear field and type value |
| `type` | `selector`, `value`, `delay?` | Type with configurable key delay (ms) |
| `clear` | `selector` | Clear a field |
| `select` | `selector`, `value` | Select a dropdown option by value |
| `check` | `selector`, `value: "true"\|"false"` | Check/uncheck a checkbox |
| `focus` | `selector` | Focus an element |
| `hover` | `selector` | Mouse hover |
| `drag` | `selector`, `targetSelector` | Drag one element to another |
| `keyboard` | `key`, `selector?` | Press a key (e.g. `Enter`, `Tab`, `Control+a`) |
| `upload` | `selector`, `value` | Set file input (comma-separated paths) |

### Waiting

| Action | Fields | Description |
|--------|--------|-------------|
| `wait` | `selector` | Wait for element to appear |
| `wait:text` | `selector`, `value` | Wait until element contains text |
| `wait:url` | `value` | Wait for URL to match pattern |
| `wait:ms` | `value` | Wait for N milliseconds |

### Scrolling

| Action | Fields | Description |
|--------|--------|-------------|
| `scroll` | `selector?` | Scroll to element (or page) |
| `scroll:element` | `selector` | Scroll element into view |
| `scroll:bottom` | — | Scroll to bottom of page |
| `scroll:load` | `value?` | Scroll to bottom, wait for load (repeat N times) |
| `next:page` | `selector?` | Click next page link and wait |

### Assertions

| Action | Fields | Description |
|--------|--------|-------------|
| `assert:visible` | `selector` | Assert element is visible |
| `assert:hidden` | `selector` | Assert element is not visible |
| `assert:text` | `selector`, `value` | Assert element contains text |
| `assert:not-text` | `selector`, `value` | Assert element does NOT contain text |
| `assert:value` | `selector`, `value` | Assert input value |
| `assert:count` | `selector`, `value` | Assert number of matching elements |
| `assert:attr` | `selector`, `value: "attr=expected"` | Assert element attribute |

### Data Extraction

| Action | Fields | Description |
|--------|--------|-------------|
| `extract` | `selector`, `value: "variableName"` | Extract element text → variable |
| `screenshot` | — | Capture screenshot at this step |

### Browser State

| Action | Fields | Description |
|--------|--------|-------------|
| `cookie:set` | `value: "name=value; domain=..."` | Set a cookie |
| `cookie:clear` | — | Clear all cookies |
| `storage:set` | `selector: "key"`, `value: "val"` | Set localStorage item |
| `eval` | `value` | Execute JavaScript on the page |
| `iframe:enter` | `selector` | Enter an iframe context |
| `iframe:exit` | — | Exit iframe context, return to main frame |

---

## API Actions

### HTTP Requests

| Action | Fields | Description |
|--------|--------|-------------|
| `http:request` | `method`, `url`, `headers?`, `body?`, `auth?`, `extract?` | Make an HTTP request. `auth` supports `{ type: "bearer", token: "{{var}}" }`. `extract` is a map of `variableName → $.jsonPath`. |

### Assertions

| Action | Fields | Description |
|--------|--------|-------------|
| `assert:response` | `assert: "status"`, `expected` | Assert HTTP status code |
| `assert:response` | `assert: "json:path"`, `path`, `expected` | Assert JSONPath value equals expected |
| `assert:response` | `assert: "json:exists"`, `path` | Assert JSONPath exists in response |
| `assert:response` | `assert: "header"`, `header`, `expected` | Assert response header value |
| `assert:response` | `assert: "body:contains"`, `expected` | Assert raw body contains string |
| `assert:response` | `assert: "time"`, `expected` | Assert response time < expected ms |

### Variables & Flow Control

| Action | Fields | Description |
|--------|--------|-------------|
| `set:variable` | `variable`, `value` | Set a named variable (supports `{{interpolation}}`) |
| `extract:json` | `variable`, `path` | Extract a value from the last response body via JSONPath |
| `env:switch` | `value` | Switch active environment mid-flow |

---

## Variables

Use `{{variableName}}` in any `value`, `url`, `selector`, or `body` field:

```json
{ "action": "fill", "selector": "#email", "value": "{{userEmail}}" }
```

Pass at runtime:

```bash
ghostrun run <id> --var userEmail=user@example.com
```

Values extracted with `extract:` and `extract:json` are automatically available as variables in subsequent steps.

---

## Limitations

| Interaction | Status | Notes |
|------------|--------|-------|
| Canvas drawing | ❌ | `<canvas>` elements — no visual capture |
| WebGL / Three.js | ❌ | GPU-rendered content |
| Browser native dialogs | ⚠️ Partial | `alert()`/`confirm()`/`prompt()` auto-dismissed |
| File download verification | ⚠️ Partial | Download triggers but content is not validated |
| WebRTC / media streams | ❌ | Camera, mic, screen capture APIs |
| Browser extensions | ❌ | Extension UI not accessible via Playwright |
| Shadow DOM (closed mode) | ⚠️ Limited | Open shadow DOM works; closed mode needs `eval` workaround |
| Multi-tab / popup flows | ⚠️ Partial | New tabs opened by click are not automatically followed |
| OS-level dialogs | ❌ | Native file picker, print dialog, OS auth prompts |
| CAPTCHAs | ❌ | By design — no circumvention |
| Biometric auth | ❌ | Touch ID, Face ID, WebAuthn |
| Browser gestures (pinch/zoom) | ❌ | Mobile multi-touch gestures |
| Hover-only menus (CSS `:hover`) | ✅ | Use `hover` action before clicking submenu items |
| Right-click context menus | ⚠️ Limited | Browser context menus inaccessible; app-level menus often work |
| Drag and drop | ✅ | Use `drag` with `selector` + `targetSelector` |
| Infinite scroll / lazy load | ✅ | Use `scroll:load` with repeat count |

**Workarounds:**

```json
// Run JS directly
{ "action": "eval", "value": "document.querySelector('#btn').click()" }

// Shadow DOM
{ "action": "eval", "value": "document.querySelector('my-el').shadowRoot.querySelector('button').click()" }

// Timing-sensitive steps
{ "action": "wait:ms", "value": "500" }
```
