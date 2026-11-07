# CoinJar

[![CI](https://github.com/grzeg/coinjar/actions/workflows/ci.yml/badge.svg)](https://github.com/grzeg/coinjar/actions/workflows/ci.yml)

**EN** A personal home-finance toolbox, built as an Nx monorepo where each business area is a separate module. The first module is a **household budget** that replaces a budget spreadsheet: income and expenses by category, a monthly plan compared with actuals, and monthly and yearly summaries. It is a **personal project in progress**: the foundations (Nx workspace with enforced module boundaries, domain model, money and date utilities, monthly summary logic, CI) are in place, and the feature views are still placeholders. The UI is in Polish. The app is meant to run locally, with data stored on the user's own machine.

**PL** Osobisty zestaw narzędzi do domowych finansów, zbudowany jako monorepo Nx, w którym każdy obszar biznesowy to osobny moduł. Pierwszy moduł to **budżet domowy**, który zastępuje arkusz kalkulacyjny: przychody i wydatki w kategoriach, miesięczny plan porównywany z wykonaniem oraz podsumowania miesięczne i roczne. To **projekt osobisty w trakcie budowy**: fundamenty (workspace Nx z wymuszonymi granicami modułów, model domeny, narzędzia do pieniędzy i dat, logika podsumowania miesiąca, CI) są gotowe, a widoki funkcjonalne to na razie szkielety. Interfejs jest po polsku. Aplikacja ma działać lokalnie, a dane zostają na komputerze użytkownika.

## Modules / Moduły

**EN** Work goes one module at a time. **Module 1, household budget (`scope:budget`):** in progress, see Status below. **Next modules:** not started and not yet specified. Each one will get its own `scope:*` tag and talk to the others only through public APIs. Ideas under consideration, with no commitment: a helper for preparing a monthly VAT declaration (JPK). Nothing beyond the budget is implemented today.

**PL** Prace idą po jednym module. **Moduł 1, budżet domowy (`scope:budget`):** w toku, patrz Status poniżej. **Kolejne moduły:** jeszcze nierozpoczęte i niedoprecyzowane. Każdy dostanie własny tag `scope:*` i będzie komunikował się z pozostałymi tylko przez publiczne API. Rozważany pomysł, bez zobowiązań: pomocnik do przygotowania miesięcznej deklaracji VAT (JPK). Poza budżetem nic nie jest dziś zaimplementowane.

## Status

**EN**

- **Done:** Nx workspace (pnpm, Vite, strict TypeScript, React Compiler), module boundaries enforced by ESLint, Zod domain schemas, money (integer grosze) and date utilities, pure monthly summary calculation checked against a reference fixture, routing shell with all seven routes, env validation, CI and Vercel deployment config.
- **Next:** design system and Storybook, mock API (MSW) with TanStack Query, categories, transactions, plan and dashboard, daily grid, yearly summary, E2E scenarios, monitoring.
- **Placeholder today:** every feature page (dashboard, transactions, grid, plan, yearly, categories) renders only a title and a "coming here" note.

**PL**

- **Gotowe:** workspace Nx (pnpm, Vite, strict TypeScript, React Compiler), granice modułów wymuszane przez ESLint, schematy domeny w Zod, narzędzia do pieniędzy (całkowite grosze) i dat, czysta funkcja podsumowania miesiąca sprawdzona na wzorcowych danych, szkielet routingu z siedmioma ścieżkami, walidacja zmiennych środowiskowych, CI i konfiguracja wdrożenia na Vercel.
- **Dalej:** design system i Storybook, mock API (MSW) z TanStack Query, kategorie, transakcje, plan i pulpit, siatka dzienna, podsumowanie roczne, scenariusze E2E, monitoring.
- **Na razie szkielety:** każda strona funkcjonalna (pulpit, transakcje, siatka, plan, rok, kategorie) wyświetla tylko tytuł i notkę, że treść pojawi się później.

## Stack

**EN** In use today: React 19 with React Compiler, TypeScript (`strict`, `noUncheckedIndexedAccess`), Nx, Vite, MUI with Emotion, React Router, Zod, Vitest, Playwright, ESLint (flat config), Prettier, Husky with lint-staged, Commitizen and commitlint. Planned: TanStack Query, Zustand, React Hook Form, MSW, Storybook, CloudWatch RUM.

**PL** Używane dziś: React 19 z React Compiler, TypeScript (`strict`, `noUncheckedIndexedAccess`), Nx, Vite, MUI z Emotion, React Router, Zod, Vitest, Playwright, ESLint (flat config), Prettier, Husky z lint-staged, Commitizen i commitlint. W planach: TanStack Query, Zustand, React Hook Form, MSW, Storybook, CloudWatch RUM.

## Decisions / Decyzje

**Modular monolith with enforced boundaries / Modularny monolit z wymuszonymi granicami**

**EN** One deployable app, many Nx libraries. Every library has a `scope:*` and a `type:*` tag, and `@nx/enforce-module-boundaries` fails lint on a forbidden import: a feature never imports another feature, UI stays independent of the domain, and code is reached only through a library's `index.ts`. The rules live in `eslint.config.mjs`.

**PL** Jedna aplikacja do wdrożenia, wiele bibliotek Nx. Każda biblioteka ma tagi `scope:*` i `type:*`, a `@nx/enforce-module-boundaries` przerywa lint przy zabronionym imporcie: feature nigdy nie importuje innego feature'a, UI jest niezależne od domeny, a do kodu wchodzi się tylko przez `index.ts` biblioteki. Reguły są w `eslint.config.mjs`.

**Money as integer grosze / Pieniądze jako całkowite grosze**

**EN** Amounts are stored as integers in grosze, never as floating-point złoty. Conversion and formatting go only through `libs/shared/util` (`toGrosze`, `fromGrosze`, `formatPLN`), and `toGrosze` parses user input with either a comma or a dot.

**PL** Kwoty są przechowywane jako liczby całkowite w groszach, nigdy jako zmiennoprzecinkowe złote. Konwersja i formatowanie odbywają się wyłącznie przez `libs/shared/util` (`toGrosze`, `fromGrosze`, `formatPLN`), a `toGrosze` parsuje wpisaną kwotę z przecinkiem lub kropką.

**Summary logic as pure functions / Podsumowanie jako czyste funkcje**

**EN** `computeMonthlySummary` in `libs/shared/domain` is a pure function with no UI or network dependency. It is tested against a fixed reference month (September 2026), so the dashboard will only have to display its result.

**PL** `computeMonthlySummary` w `libs/shared/domain` to czysta funkcja bez zależności od UI i sieci. Jest testowana na stałym miesiącu referencyjnym (wrzesień 2026), więc pulpit będzie tylko wyświetlał jej wynik.

**Types from schemas / Typy ze schematów**

**EN** Domain types come from Zod schemas through `z.infer`, with no duplicated hand-written interfaces. Environment variables are validated by a Zod schema at startup, so a misconfigured deployment fails loudly.

**PL** Typy domeny pochodzą ze schematów Zod przez `z.infer`, bez dublowania ich ręcznymi interfejsami. Zmienne środowiskowe są walidowane schematem Zod przy starcie, więc źle skonfigurowane wdrożenie zawodzi od razu i wyraźnie.

**No flash on redirect / Przekierowanie bez migotania**

**EN** `/` redirects to the current month from a route loader, so the redirect happens before rendering instead of flashing an empty page.

**PL** `/` przekierowuje na bieżący miesiąc z loadera trasy, więc przekierowanie następuje przed renderowaniem, a nie po mignięciu pustej strony.

**CI and deployment / CI i wdrożenie**

**EN** GitHub Actions runs the format check and `nx affected` for lint, typecheck, test and build, validates the PR title and commit messages as Conventional Commits, and runs the Playwright suite. Vercel builds from the same repo, skips deployments that do not affect the app (`nx-ignore`) and rewrites deep links to `index.html`.

**PL** GitHub Actions uruchamia sprawdzenie formatowania i `nx affected` dla lintu, typów, testów i buildu, waliduje tytuł PR i komunikaty commitów jako Conventional Commits oraz uruchamia testy Playwright. Vercel buduje z tego samego repo, pomija wdrożenia niedotyczące aplikacji (`nx-ignore`) i przekierowuje linki bezpośrednie na `index.html`.

## Getting started / Uruchomienie

**EN** Requires Node 24 (see `.nvmrc`; `fnm use` or `nvm use`) and pnpm through Corepack (the version is pinned in `package.json`).

**PL** Wymaga Node 24 (patrz `.nvmrc`; `fnm use` lub `nvm use`) i pnpm przez Corepack (wersja jest przypięta w `package.json`).

```bash
pnpm install
cp .env.example .env.local
pnpm nx serve coinjar-web            # http://localhost:4200
```

## Common commands / Najczęstsze komendy

```bash
pnpm nx run-many -t lint typecheck test build   # everything
pnpm nx affected -t lint typecheck test build   # changed projects only
pnpm nx e2e coinjar-web-e2e                     # Playwright (builds + vite preview)
pnpm nx graph                                   # dependency graph
pnpm commit                                     # Conventional Commit via Commitizen
```

## Structure / Struktura

```
apps/coinjar-web        app shell: routing, providers, layout
apps/coinjar-web-e2e    Playwright tests (Page Objects in src/pages)
libs/shared/{ui,util,domain}
libs/budget/{data-access,state,feature-*}
```

**EN** The project guide (architecture, domain model, business rules, conventions) is in [CLAUDE.md](CLAUDE.md). The project is developed with an AI coding agent that follows it.

**PL** Przewodnik po projekcie (architektura, model domeny, reguły biznesowe, konwencje) jest w [CLAUDE.md](CLAUDE.md). Projekt powstaje z użyciem agenta AI do kodowania, który się nim kieruje.
