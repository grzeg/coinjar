# CoinJar

Household budget app that replaces a budget spreadsheet. A practice project:
React + React Compiler, Nx, Vite, MUI, TanStack Query, Zustand, Zod, Vitest,
Storybook and Playwright.

The project guide (architecture, business rules, conventions) lives in
[CLAUDE.md](CLAUDE.md).

## Requirements

- Node 24 (see `.nvmrc`; `fnm use` or `nvm use`)
- pnpm through Corepack (version pinned in `package.json` → `packageManager`)

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm nx serve coinjar-web            # http://localhost:4200
```

## Common commands

```bash
pnpm nx run-many -t lint typecheck test build   # everything
pnpm nx affected -t lint typecheck test build   # changed projects only
pnpm nx e2e coinjar-web-e2e                     # Playwright (builds + vite preview)
pnpm nx graph                                   # dependency graph
pnpm commit                                     # Conventional Commit via Commitizen
```

## Structure

```
apps/coinjar-web        app shell: routing, providers, layout
apps/coinjar-web-e2e    Playwright tests (Page Objects in src/pages)
libs/shared/{ui,util,domain}
libs/budget/{data-access,state,feature-*}
```

Module boundaries are enforced by `@nx/enforce-module-boundaries`
(tags `scope:*` and `type:*`, see `eslint.config.mjs`).
