# PAT3.0 Testing Guide

## Overview

This directory contains comprehensive test suites for the PAT3.0 Property Analysis Tool. Tests are organized by module and cover utilities, calculations, and integrations.

## Test Structure

```
tests/
├── app.test.js          # Utility function tests (70+ tests)
├── grasp.test.js        # GRASP module tests (50+ tests)
├── frat.test.js         # FRAT module tests (50+ tests)
├── integration.test.js  # End-to-end workflow tests (30+ tests)
└── setup.js             # Jest configuration and mocks
```

## Quick Start

### 1. Install Testing Framework

```bash
npm install --save-dev jest @testing-library/dom
```

### 2. Add to package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "@testing-library/dom": "^9.0.0"
  }
}
```

### 3. Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (rerun on file change)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Coverage Goals

### Phase 1: Foundation (Priority 1)
- **app.test.js**: Utility functions
  - Storage functions: 10 tests
  - Numeric functions: 8 tests
  - Formatting functions: 8 tests
  - KPI banding: 12 tests
  - Address parsing: 10 tests
  - **Total**: 48+ tests

### Phase 2: Core Logic (Priority 2)
- **grasp.test.js**: GRASP calculations
  - Form state: 12 tests
  - Calculations: 30+ tests
  - KPI calculations: 15 tests
  - **Total**: 57+ tests

- **frat.test.js**: FRAT calculations
  - Form state: 12 tests
  - ROI/profit calculations: 25+ tests
  - **Total**: 37+ tests

### Phase 3: Integration (Priority 3)
- **integration.test.js**: End-to-end workflows
  - Save property workflow: 8 tests
  - Edit property workflow: 8 tests
  - Import/export cycle: 6 tests
  - Search & filter: 8 tests
  - **Total**: 30+ tests

## Expected Test Coverage

| Module | Target | Current |
|--------|--------|---------|
| app.js | 95% | N/A |
| grasp.js | 90% | N/A |
| frat.js | 90% | N/A |
| catalogue.js | 80% | N/A |
| **Overall** | **90%** | **N/A** |

## Running Specific Tests

```bash
# Run only app.test.js
npm test app.test.js

# Run only GRASP tests
npm test grasp.test.js

# Run tests matching pattern
npm test -- --testNamePattern="Cash Flow"

# Run with verbose output
npm test -- --verbose
```

## Coverage Report

```bash
npm run test:coverage
```

This generates an HTML coverage report in `coverage/index.html`:
- **Statements**: All executable statements
- **Branches**: All conditional branches
- **Functions**: All function definitions
- **Lines**: All lines of code

## Writing New Tests

### Test Template

```javascript
describe("Module Name", () => {
  beforeEach(() => {
    // Setup before each test
    // Reset localStorage, clear DOM, etc.
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test("should do something", () => {
    // Arrange: Set up test data
    const input = { /* ... */ };

    // Act: Call the function
    const result = functionUnderTest(input);

    // Assert: Verify the result
    expect(result).toBe(expectedValue);
  });

  describe("Nested describe for related tests", () => {
    test("specific case 1", () => { /* ... */ });
    test("specific case 2", () => { /* ... });
  });
});
```

### Jest Matchers Reference

```javascript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).toStrictEqual(expected);  // Strict deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();

// Numbers
expect(value).toBeGreaterThan(5);
expect(value).toBeCloseTo(0.3, 1);      // Approximately equal

// Strings
expect(string).toMatch(/pattern/);
expect(string).toContain("substring");

// Arrays/Objects
expect(array).toContain(item);
expect(array).toEqual([1, 2, 3]);
expect(object).toHaveProperty("key");

// Exceptions
expect(() => functionCall()).toThrow();
expect(() => functionCall()).toThrow(ErrorType);
```

## Mocking localStorage

```javascript
// Clear localStorage before each test
beforeEach(() => {
  localStorage.clear();
});

// Mock specific values
localStorage.setItem("key", JSON.stringify(data));

// Check stored values
const stored = JSON.parse(localStorage.getItem("key"));
```

## Debugging Tests

```bash
# Run single test file
npm test -- app.test.js

# Run tests with debugging output
node --inspect-brk node_modules/.bin/jest --runInBand

# Interactive watch mode (press options)
npm test -- --watch
# Options: p = filter by filename, t = filter by test name, q = quit
```

## Common Issues & Solutions

### Issue: localStorage is not defined
**Solution**: Jest automatically mocks localStorage, but ensure tests run in jsdom environment:
```json
{
  "jest": {
    "testEnvironment": "jsdom"
  }
}
```

### Issue: DOM elements not found
**Solution**: Set up HTML before test:
```javascript
beforeEach(() => {
  document.body.innerHTML = `<input id="myInput" />`;
});
```

### Issue: Async test hangs
**Solution**: Return promise or use async/await:
```javascript
test("async test", async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});
```

### Issue: Tests pass locally but fail in CI
**Solution**: Ensure tests don't depend on:
- Current time/date
- Random values
- External API calls
- Browser-specific features

## Continuous Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Test Maintenance

### Regular Checklist
- [ ] Update tests when adding new features
- [ ] Review coverage report monthly
- [ ] Fix flaky tests immediately
- [ ] Keep test data realistic
- [ ] Document complex test logic
- [ ] Remove obsolete tests

### Coverage Monitoring
Monitor coverage trends over time:
```bash
npm test -- --coverage --coverageReporters=json
```

## Next Steps

1. **Install Jest**: `npm install --save-dev jest`
2. **Run tests**: `npm test`
3. **Review failures**: Fix any test issues
4. **Check coverage**: `npm test -- --coverage`
5. **Integrate with CI/CD**: Add GitHub Actions workflow
6. **Set coverage threshold**: Require 90%+ coverage before merging

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Jest API Reference](https://jestjs.io/docs/api)
- [Testing Library](https://testing-library.com/)
- [CommonJS vs ES6 Modules](https://www.freecodecamp.org/news/javascript-modules-explained-with-examples/)
