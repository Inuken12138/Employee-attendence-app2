# Playwright E2E Testing Workflow

This guide explains how to use Playwright for browser-based testing and debugging of the Employee Attendance App frontend.

## Overview

Playwright enables us to:
- **Test user flows** (navigation, form submission, search)
- **Verify visual changes** (products appear, links are clickable)
- **Catch regressions** (previous bugs don't reappear)
- **Debug in real browsers** (Chromium, Firefox, Safari)
- **Capture failure artifacts** (screenshots, videos, DOM traces)

## When to Use Playwright

### ✅ Use Playwright When:
- Testing **user interactions**: clicks, form submissions, navigation
- Verifying **dynamic content**: data loaded from API, conditional rendering
- Testing **authenticated workflows**: login, session state
- Checking **responsive design**: mobile vs. desktop behavior
- **Creating regression tests**: block previous bugs from returning

### ❌ Use Screenshots When:
- Only checking **visual styling** (colors, spacing, fonts)
- Debugging **layout issues** (alignment, overflow)
- Reviewing **design changes** (not behavior)

## Quick Start

### Prerequisites
- Node.js installed
- Django backend running on `http://localhost:8000`
- Frontend dependencies installed

### Install & Configure
Playwright is already installed as a dev dependency. Configuration is in `nextjs_frontend/songfei/playwright.config.ts`.

### Run Tests

Open a terminal in `nextjs_frontend/songfei/`:

```bash
# Run all e2e tests (headless)
npm run test:e2e

# Run specific test file
npm run test:e2e -- tests/e2e/category-navigation.spec.ts

# Run with visible browser (useful for debugging)
npm run test:e2e:headed

# Run with visible browser + debogging specific test
npm run test:e2e:headed -- tests/e2e/category-navigation.spec.ts
```

## Typical Workflow

### Step 1: User Reports a Bug

Example: *"When I navigate to test_sub → test_subsub, I don't see product G01."*

### Step 2: Describe the Expected Behavior

What should happen:
- Navigate to category "test_sub"
- Click link to "test_subsub"
- See product "G01" displayed on the page

What actually happens:
- Page shows empty state or other products

### Step 3: I Write a Playwright Test

Test file location: `nextjs_frontend/songfei/tests/e2e/`

Example test structure:
```typescript
import { test, expect } from '@playwright/test';

test('leaf category pages display products assigned to that category', async ({ page }) => {
  // 1. Navigate to parent category
  await page.goto('/cat/test_sub');
  
  // 2. Interact with UI (click, fill forms, etc.)
  await page.getByRole('link', { name: 'test_subsub' }).click();
  
  // 3. Assert expected outcomes
  await expect(page).toHaveURL(/\/cat\/test_subsub$/);
  await expect(page.getByText('G01')).toBeVisible();
  await expect(page.getByRole('link', { name: /\/p\/g01-G01/ })).toBeVisible();
});
```

**Key Playwright methods:**
- `page.goto(url)` - Navigate to URL
- `page.getByRole(type, options)` - Find element by accessibility role
- `page.getByText(text)` - Find element by text content
- `getByPlaceholder()`, `getByLabel()` - Other locator methods
- `expect(page).toHaveURL(regex)` - Assert page URL
- `expect(element).toBeVisible()` - Assert element visibility
- `await page.waitForLoadState('networkidle')` - Wait for API calls

### Step 4: Run the Test

```bash
npm run test:e2e -- tests/e2e/category-navigation.spec.ts
```

**First run will likely fail:**
- Error message shows what's missing
- Screenshot captured at `test-results/` shows what page looked like
- Video captured shows the exact interaction sequence

### Step 5: Inspect Failure Artifacts

When a test fails, Playwright automatically captures:

1. **Screenshot** (`test-results/artifact.png`)
   - Shows page state at moment of failure
   - Can reveal missing elements, error popups, wrong data

2. **Video** (`test-results/video.webm`)
   - Records entire test execution
   - Shows interaction sequence, timing of async events

3. **DOM Trace** (`.zip` file)
   - Detailed DOM state, network calls, console logs
   - Use for complex debugging

**Example failure scenario:**
```
Error: Timed out waiting for getByText('G01') to be visible
```
→ Check screenshot: Is the page showing error popup? Wrong category? Empty products?

### Step 6: Fix the Bug

Based on failure artifacts, identify and fix the issue:
- **Wrong rendering logic**: Fix component condition
- **Missing API data**: Check backend API response
- **CORS/network error**: Verify backend is running
- **Wrong URL/routing**: Check page params

### Step 7: Re-run Test

After fix, re-run to confirm:
```bash
npm run test:e2e:headed -- tests/e2e/category-navigation.spec.ts
```

✅ **Test passes** → Bug is fixed + regression test is now in place

## Common Playwright Patterns

### Navigate and Wait

```typescript
// Simple navigation
await page.goto('/cat/test_sub');

// Navigate and wait for network to settle
await page.goto('/cat/test_sub');
await page.waitForLoadState('networkidle');

// Wait for specific element to appear
await page.goto('/products');
await page.getByText('Electronics').waitFor();
```

### Find and Click Elements

```typescript
// By accessibility role (most reliable)
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByRole('link', { name: 'Product Name' }).click();

// By text
await page.getByText('Next Page').click();

// By placeholder (for inputs)
await page.getByPlaceholder('Search products').fill('laptop');
```

### Fill Forms

```typescript
// Fill input fields
await page.getByLabel('Username').fill('testuser');
await page.getByLabel('Password').fill('password123');
await page.getByRole('button', { name: 'Login' }).click();

// Select dropdown
await page.getByLabel('Category').selectOption('Electronics');
```

### Check Results

```typescript
// Element is visible
await expect(page.getByText('Product Name')).toBeVisible();

// Element has specific text
await expect(page.getByRole('heading')).toContainText('Products');

// URL matches pattern
await expect(page).toHaveURL(/\/products\/\d+$/);

// Multiple assertions
await expect(page).toHaveTitle('Product Details');
await expect(page.getByRole('link', { name: 'Add to Cart' })).toBeEnabled();
```

## Troubleshooting

### Test hangs or times out

**Problem**: Test runs longer than expected

**Solutions**:
```typescript
// Increase timeout for specific assertion
await expect(page.getByText('Data')).toBeVisible({ timeout: 10000 });

// Skip waiting for full page load (if API is slow)
await page.goto('/page', { waitUntil: 'domcontentloaded' });
```

### "Category not found" error in browser

**Problem**: API returns 404, page shows error popup

**Causes**:
1. Backend not running on `http://localhost:8000`
2. Frontend not running on `http://localhost:3000`
3. Test data doesn't exist in database

**Fix**:
```bash
# Ensure backend is running
cd django_backend && python manage.py runserver

# Ensure frontend dependencies are installed
cd nextjs_frontend/songfei && npm install
```

### CORS errors in browser console

**Problem**: Browser blocks API requests from frontend

**Cause**: Playwright origin (`127.0.0.1`) doesn't match Django CORS whitelist (`localhost`)

**Fix**: Already handled in `playwright.config.ts` - uses `localhost:3000` as baseURL

### Test passes locally but fails in CI

**Common causes**:
1. Hardcoded localhost URLs (should use relative paths)
2. Test depends on specific database state
3. Timing issues (need more `waitFor` calls)

**Solutions**:
```typescript
// ❌ Bad: hardcoded origin
await page.goto('http://localhost:3000/products');

// ✅ Good: relative URL (respects baseURL in config)
await page.goto('/products');

// ❌ Bad: no waiting for data
const text = await page.textContent('h1');

// ✅ Good: wait for element first
await page.getByRole('heading').waitFor();
const text = await page.getByRole('heading').textContent();
```

## Creating New Tests

### File Structure

```
nextjs_frontend/songfei/
├── tests/
│   └── e2e/
│       ├── category-navigation.spec.ts
│       ├── product-search.spec.ts     (to be created)
│       └── checkout.spec.ts           (to be created)
├── playwright.config.ts
└── package.json
```

### Template for New Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('description of what should happen', async ({ page }) => {
    // Arrange: Set up initial state
    await page.goto('/path');
    
    // Act: Perform user actions
    await page.getByRole('button', { name: 'Click me' }).click();
    
    // Assert: Verify results
    await expect(page.getByText('Expected text')).toBeVisible();
  });
  
  test('another scenario', async ({ page }) => {
    // ...
  });
});
```

### Naming Convention

- File name: `feature-name.spec.ts` (kebab-case)
- Test description: Clear, human-readable action (what the user does)

Examples:
- ✅ `category-navigation.spec.ts` → "leaf category pages display products"
- ✅ `product-search.spec.ts` → "search finds products by name"
- ❌ `test1.spec.ts` → unclear
- ❌ "test passes" → doesn't describe user action

## Configuration Details

### playwright.config.ts

Key settings:
```typescript
export default defineConfig({
  // Where tests run
  testDir: './tests/e2e',
  
  // Browser to use
  use: {
    baseURL: 'http://localhost:3000',
  },
  
  // Auto-launch frontend during tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true, // Don't rebuild if already running
  },
  
  // Capture artifacts on failure
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
});
```

## Performance Tips

### Speed up test execution

```typescript
// Skip animations for faster tests
await page.addInitScript(() => {
  document.documentElement.style.scrollBehavior = 'auto';
});

// Directly navigate without waiting for full page load (if safe)
await page.goto('/page', { waitUntil: 'domcontentloaded' });

// Parallel test execution (in config)
fullyParallel: true // default, runs tests concurrently
```

### Debug slow tests

```bash
# Run with debugging UI
npx playwright test --debug tests/e2e/my-test.spec.ts

# Run single test with visible browser
npm run test:e2e:headed -- tests/e2e/my-test.spec.ts --headed
```

## Integration with CI/CD (Future)

When setting up GitHub Actions or other CI:

```yaml
- name: Run Playwright tests
  run: npm run test:e2e
  working-directory: nextjs_frontend/songfei
  
- name: Upload test artifacts on failure
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: nextjs_frontend/songfei/playwright-report/
```

## Questions & Support

### How do I debug a failing test?
```bash
# Run with visible browser
npm run test:e2e:headed -- <test-file>

# Check screenshots in test-results/ folder
# Check video in test-results/ folder
```

### How do I test authenticated flows?
```typescript
test('user can logout', async ({ page }) => {
  // 1. Login first
  await page.goto('/login');
  await page.getByLabel('Username').fill('testuser');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // 2. Wait for dashboard
  await expect(page).toHaveURL('/dashboard');
  
  // 3. Now test logout
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL('/login');
});
```

### How do I run only one test?
```bash
npm run test:e2e -- tests/e2e/my-test.spec.ts
```

### How do I run tests with multiple browsers?
Edit `playwright.config.ts` to add projects:
```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
],
```

Then run:
```bash
npm run test:e2e  # Runs all browsers
```

---

**Last updated**: March 2026
**Playwright version**: ^1.58.2
**Related files**: `nextjs_frontend/songfei/playwright.config.ts`, `nextjs_frontend/songfei/tests/e2e/`
