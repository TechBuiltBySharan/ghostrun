# GhostRun Examples

## Browser Automation

### Wikipedia Search

```json
{
  "name": "Wikipedia Search",
  "graph": {
    "nodes": [
      {
        "id": "n1",
        "type": "action",
        "action": "navigate",
        "properties": { "url": "https://en.wikipedia.org" }
      },
      {
        "id": "n2",
        "type": "action",
        "action": "fill",
        "properties": { "selector": "input[name=search]", "value": "JavaScript" }
      },
      {
        "id": "n3",
        "type": "action",
        "action": "click",
        "properties": { "selector": "button[type=submit]" }
      },
      {
        "id": "n4",
        "type": "assert",
        "action": "assert",
        "properties": { "type": "url", "value": "JavaScript" }
      }
    ],
    "edges": [
      { "source": "n1", "target": "n2" },
      { "source": "n2", "target": "n3" },
      { "source": "n3", "target": "n4" }
    ]
  }
}
```

## API Testing

### GET Request

```json
{
  "name": "HTTPBin GET Test",
  "graph": {
    "nodes": [
      {
        "id": "req1",
        "type": "api",
        "action": "api",
        "properties": {
          "method": "GET",
          "url": "https://httpbin.org/get"
        }
      },
      {
        "id": "assert1",
        "type": "assert",
        "action": "assert",
        "properties": { "type": "status", "value": 200 }
      }
    ],
    "edges": [
      { "source": "req1", "target": "assert1" }
    ]
  }
}
```

### POST Request with Assertions

```json
{
  "name": "Create Post",
  "graph": {
    "nodes": [
      {
        "id": "create",
        "type": "api",
        "action": "api",
        "properties": {
          "method": "POST",
          "url": "https://jsonplaceholder.typicode.com/posts",
          "body": { "title": "Test", "body": "Content", "userId": 1 }
        }
      },
      {
        "id": "assert_status",
        "type": "assert",
        "action": "assert",
        "properties": { "type": "status", "value": 201 }
      },
      {
        "id": "assert_id",
        "type": "assert",
        "action": "assert",
        "properties": { "type": "json", "selector": "$.id", "value": 101 }
      }
    ],
    "edges": [
      { "source": "create", "target": "assert_status" },
      { "source": "assert_status", "target": "assert_id" }
    ]
  }
}
```

## Load Testing

### Simple Load Test

```bash
# Run flow with 10 concurrent users
ghostrun load ./my-flow.flow.json --users 10 --duration 60s
```
