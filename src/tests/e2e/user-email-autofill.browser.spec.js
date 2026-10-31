const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch {}

test('Add User derives a sign-in username from first name and preserves manual edits', { skip: !chromium }, async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_BROWSER ? { executablePath: process.env.CRM_TEST_BROWSER } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<form id="user-create-form"><div class="form-field"><label>Email</label><input name="email" type="email"></div><input name="fullName"></form>');
  await page.addScriptTag({ path: path.resolve(__dirname, '../../../frontend/features/users/utils/user-email-utils.js') });
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/team-chat-reports-agents.js'), 'utf8');
  const start = source.indexOf('function userEmailSuggestion');
  const end = source.indexOf('function ensureUsersEvents');
  await page.addScriptTag({ content: `const state = {}; ${source.slice(start, end)}` });
  await page.evaluate(() => ensureUserEmailAutofill());

  await page.locator('input[name="fullName"]').fill('Asma Mehar');
  assert.equal(await page.locator('input[name="email"]').inputValue(), 'asma@aureum.com');
  await page.locator('input[name="email"]').fill('asma.sales@aureum.com');
  await page.locator('input[name="fullName"]').fill('Asma Khan');
  assert.equal(await page.locator('input[name="email"]').inputValue(), 'asma.sales@aureum.com');
});
