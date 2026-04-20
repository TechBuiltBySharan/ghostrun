# GhostRun API Documentation

## Flow Structure

```json
{
  "name": "Flow Name",
  "description": "What this flow does",
  "graph": {
    "nodes": [
      {
        "id": "node1",
        "type": "action",
        "action": "navigate",
        "properties": { "url": "https://example.com" }
      }
    ],
    "edges": [
      { "source": "node1", "target": "node2" }
    ]
  }
}
```

## Supported Actions

| Action | Properties | Description |
|--------|------------|-------------|
| `navigate` | url | Navigate to URL |
| `click` | selector | Click element |
| `fill` | selector, value | Fill input field |
| `type` | selector, value | Type text character by character |
| `wait` | selector | Wait for element |
| `screenshot` | path | Take screenshot |
| `assert` | type, selector, value | Assert condition |
| `api` | method, url, headers, body | Make API request |
| `hover` | selector | Hover over element |
| `select` | selector, value | Select dropdown option |
| `check` | selector | Check checkbox |
| `uncheck` | selector | Uncheck checkbox |
| `refresh` | - | Refresh page |
| `goBack` | - | Go back |
| `goForward` | - | Go forward |

## API Request Format

```json
{
  "id": "api1",
  "type": "api",
  "action": "api",
  "properties": {
    "method": "POST",
    "url": "https://api.example.com/users",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer {{token}}"
    },
    "body": {
      "name": "Test User",
      "email": "test@example.com"
    }
  }
}
```

## Assertion Types

| Type | Description | Example |
|------|-------------|---------|
| `status` | HTTP status code | `{ "type": "status", "value": 200 }` |
| `body` | Response body contains | `{ "type": "body", "value": "success" }` |
| `json` | JSON path match | `{ "type": "json", "selector": "$.id", "value": 1 }` |
| `visible` | Element visible | `{ "type": "visible", "selector": "#content" }` |
| `text` | Element text | `{ "type": "text", "selector": "h1", "value": "Title" }` |
| `count` | Element count | `{ "type": "count", "selector": "li", "value": 5 }` |

## Variables

Use `{{variableName}}` syntax in properties:

```json
{
  "url": "https://api.example.com/users/{{userId}}",
  "headers": {
    "Authorization": "Bearer {{token}}"
  }
}
```
