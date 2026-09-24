/// <reference types='vitest' />
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/coinjar-web',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    react(),
    // React Compiler through Babel (the stable implementation). It also runs on
    // workspace libraries, because Vite resolves them to their source files.
    babel({ presets: [reactCompilerPreset()] }),
  ],
  define: {
    // Links RUM errors with a deployment (CLAUDE.md section 15.5).
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env['VITE_APP_VERSION'] ??
        process.env['VERCEL_GIT_COMMIT_SHA'] ??
        'dev',
    ),
  },
  build: {
    outDir: '../../dist/apps/coinjar-web',
    emptyOutDir: true,
    reportCompressedSize: true,
  },
  test: {
    name: 'coinjar-web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
