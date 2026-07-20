import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

// Launches the BUILT Electron app (run `npm run build` first) and drives the
// real UI + IPC. Verifies the Admin PIN login reaches the dashboard and that
// the AI Analysis nav entry is present for the Admin role. Adjust the PIN if
// your local ireport_admin_pin differs from the 1234 default.
test('admin PIN login reaches dashboard and shows AI Analysis nav', async () => {
  const app = await electron.launch({ args: [path.join(__dirname, '..', 'dist', 'main', 'index.js')] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Role selection -> System Admin
  await win.getByText('System Admin', { exact: false }).click();
  // Enter PIN (default 1234)
  await win.getByPlaceholder('••••').fill('1234');
  await win.getByRole('button', { name: /sign in/i }).click();

  // Dashboard visible
  await expect(win.getByText(/dashboard/i).first()).toBeVisible();
  // Admin sees the AI Analysis nav link (gated to Admin role)
  await expect(win.getByRole('link', { name: /AI Analysis/i })).toBeVisible();

  await app.close();
});
