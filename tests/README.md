# GhostRun Test Suite

Comprehensive testing infrastructure for GhostRun browser automation and API testing capabilities.

## Test Structure

```
tests/
├── unit/               # Unit tests for core functionality
│   ├── database.test.ts
│   └── privacy.test.ts
├── e2e/                # End-to-end tests
│   ├── api.test.ts      # API testing against public endpoints
│   └── browser.test.ts  # Browser automation against public sites
├── flows/              # GhostRun flow definitions for testing
│   ├── local/           # Flows requiring local test server
│   ├── live/            # Flows against real production websites
│   └── api-tests/       # API testing flows
├── fixtures/            # Test data and sample flows
└── results/            # Test reports (gitignored)
```

## Running Tests

### All Tests
```bash
npm test
```

### CI Validation
```bash
npm run test:ci
```

### Unit Tests Only
```bash
npm run test:unit
```

### API E2E Tests
```bash
npm run test:api
```

### Browser E2E Tests
```bash
npm run test:browser
```

### Flow Tests
```bash
npm run test:flows
```

### Full Validation (build + all tests)
```bash
npm run validate
```

## Test Categories

### Unit Tests
- Database operations (CRUD, migrations)
- Privacy/PII sanitization
- Variable resolution
- Flow parsing

### E2E API Tests
Tests against reliable public APIs:
- JSONPlaceholder - Fake REST API
- HTTPBin - HTTP request/response testing
- Cat Facts - Simple fact API
- Dog CEO - Image API
- PokéAPI - Game data API
- DummyJSON - Various data types

### E2E Browser Tests
Tests against stable public websites:
- Wikipedia
- Hacker News
- MDN Web Docs

### Flow Tests
GhostRun flow definitions that are executed end-to-end:
- Health check flows
- Form submission flows
- Navigation flows
- API testing flows

## Adding New Tests

### Unit Tests
Add a new `.test.ts` file in `tests/unit/`:

```typescript
import { describe, it, expect } from 'vitest';

describe('My Feature', () => {
  it('should work correctly', () => {
    expect(true).toBe(true);
  });
});
```

### API Tests
Add test cases to `tests/e2e/api.test.ts` or create a new test file:

```typescript
describe('My API', () => {
  it('GET /endpoint - should return data', async () => {
    const response = await fetch('https://my-api.com/endpoint');
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('expectedKey');
  });
});
```

### Flow Definitions
Create a `.flow.json` file in the appropriate `tests/flows/` directory:

```json
{
  "name": "My Test Flow",
  "description": "Tests my feature",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "n1",
      "type": "action",
      "action": "navigate",
      "url": "https://example.com"
    }
  ],
  "edges": []
}
```

## Test Configuration

See `vitest.config.ts` for Vitest configuration.
See `tests/test-websites.json` for the list of websites and APIs tested against.

## CI/CD Integration

The test suite is designed to work in CI environments:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    npm ci
    npm run build
    npm run test:ci
```

## Coverage

Run coverage report:
```bash
npm run test:coverage
```

Coverage reports are saved to `tests/results/coverage/`.
