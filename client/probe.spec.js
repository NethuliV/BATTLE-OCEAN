const { test } = require('@playwright/test');

test('probe app', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.toString()));
  page.on('requestfailed', req => console.log('REQUEST_FAILED:', req.url(), req.failure() && req.failure().errorText));
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('TITLE:', await page.title());
  console.log('TEXT:', await page.locator('body').innerText());
});
