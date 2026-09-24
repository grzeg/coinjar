import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

// BASE_URL lets the same suite run against a deployed preview (section 15.6).
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Tests run against the production build served by `vite preview`,
  // the same artifact that gets deployed.
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: 'pnpm exec nx run coinjar-web:preview',
        url: 'http://localhost:4300',
        reuseExistingServer: !process.env['CI'],
        cwd: workspaceRoot,
      },
  // Chromium only for now; more browsers in milestone 10.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
