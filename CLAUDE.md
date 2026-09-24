# CLAUDE.md — CoinJar

**CoinJar** is a household budget app built as a practice project.

This file describes the project for Claude Code: goals, stack, architecture, domain model, business rules and conventions.
Read it before every task. If something in the code contradicts this file, ask before changing either of them.

## 1. Project goals

CoinJar replaces a household budget spreadsheet (Excel). It lets the user:

- record income and expenses for a specific day, assigned to categories and subcategories,
- plan a monthly budget (a planned amount for each subcategory),
- compare the plan with actuals (amounts, difference, % of plan used, progress bars),
- view monthly and yearly summaries and a "day by day" grid,
- define their own categories and subcategories.

**Primary goal: learning.** The project is used to practise the stack before a job interview.
Readability, good practices and tests matter more than the number of features. See section 11 "Working with Claude".

**Interview focus.** The target role expects a senior with deep Nx knowledge, modular monolith architecture, Nx generators and agile work with AI tools. Every milestone should make these visible; see section 16.

## 2. Stack (mandatory — do not swap anything without asking)

| Area | Tool |
|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Framework | React (latest stable) + **React Compiler** |
| Package manager | pnpm (workspaces) |
| Monorepo / build system | Nx |
| Bundler | Vite |
| UI | MUI + Emotion |
| Component docs and tests | Storybook (+ addons: a11y, vitest, docs) |
| Forms | React Hook Form |
| Schemas and validation | Zod |
| DX | Prettier, ESLint (flat config), Husky, lint-staged, Commitizen, commitlint |
| Unit + integration tests | Vitest |
| Testing utilities | @testing-library/react, @testing-library/user-event, @testing-library/jest-dom |
| E2E | Playwright |
| Server state | TanStack Query |
| Client state | Zustand |
| Monitoring | CloudWatch RUM (aws-rum-web) |

**Allowed extras** (outside the list, justified by need):
`react-router` (routing), `msw` (mock API in dev and tests), `@mui/icons-material`, `@mui/x-date-pickers` + `date-fns`, optionally `@mui/x-charts`.
Propose and justify any other dependency first. Do not install it on your own.

## 3. Backend: a deliberate decision

The project is frontend-only. Instead of a real backend:

- the API layer (`libs/budget/data-access`) exposes async functions (`getTransactions`, `createTransaction`, etc.) that call `fetch` on `/api/...`,
- in dev and tests, requests are handled by **MSW**; handlers keep data in memory and persist it to `localStorage` so it survives a page reload,
- MSW adds an artificial delay (200–600 ms) and optionally random errors (flag `VITE_API_CHAOS=true`) to practise loading states, error states and optimistic updates for real.

Application code does not know the backend is a mock. Switching to a real API must require changes in `data-access` only.

**MSW also runs in the deployed app** (Vercel, section 15) until the Supabase stage. It is enabled by `VITE_ENABLE_MSW=true`, and `mockServiceWorker.js` must be in the app's `public/` folder. Each visitor gets their own data in their browser's `localStorage`, which is fine for a demo. Show a small, unobtrusive "Demo mode: data is stored only in this browser" notice when MSW is active.

The target backend is Supabase (section 14), but **this stage is deferred**: it will be done only after interview preparation is finished.

## 4. Nx structure

```
apps/
  coinjar-web/           # the app (routing, providers, layout, RUM and MSW bootstrap)
  coinjar-web-e2e/       # Playwright
libs/
  shared/
    ui/                  # MUI-based atoms and molecules (Storybook)  tags: scope:shared, type:ui
    util/                # money, dates, formatting — pure functions  tags: scope:shared, type:util
    domain/              # Zod schemas + domain types                 tags: scope:shared, type:domain
  budget/
    data-access/         # API client, query keys, Query hooks, MSW    tags: scope:budget, type:data-access
    state/               # Zustand stores (UI state)                   tags: scope:budget, type:state
    feature-dashboard/   # monthly summary (KPIs)                      tags: scope:budget, type:feature
    feature-transactions/# list + transaction form
    feature-daily-grid/  # categories × days grid (like the spreadsheet)
    feature-plan/        # monthly budget planning
    feature-yearly/      # yearly summary
    feature-categories/  # category management
```

**Module boundaries** enforced by the `@nx/enforce-module-boundaries` rule:

- `type:feature` may import: `ui`, `util`, `domain`, `data-access`, `state`
- `type:data-access` may import: `domain`, `util`
- `type:state` may import: `domain`, `util`
- `type:ui` may import: `util` (not `domain`; UI components are domain-agnostic)
- `type:domain` may import: `util`
- `type:util`: nothing from the workspace
- a feature never imports another feature; shared code moves down a layer.

Import only through a library's public API (`index.ts`), e.g. `@coinjar/shared-ui`. Never via a relative path into another library's `src/`.

## 5. Domain model

All schemas live in `libs/shared/domain` as Zod schemas. Types only via `z.infer`, no hand-written duplicate interfaces.

```ts
CategoryType = 'income' | 'expense'

Category {
  id: string            // uuid
  name: string          // 1–60 characters, unique within its parent
  type: CategoryType
  parentId: string | null   // null = top-level category; max 2 levels
  order: number
  archived: boolean
  color?: string        // optional, for top-level categories
}

Transaction {
  id: string
  date: string          // 'YYYY-MM-DD', local date, NO time zone
  amount: number        // in GROSZE (1/100 PLN), integer > 0
  categoryId: string    // must point to a leaf category (no children)
  note?: string         // max 200 characters
  memberId?: string     // optional: the household member it relates to
}

BudgetPlanEntry {
  month: string         // 'YYYY-MM'
  categoryId: string    // leaf category
  planned: number       // in grosze, >= 0
}

Member { id: string; name: string }   // household members (optional)
```

The transaction type (income or expense) is derived from its category and is not stored separately.

## 6. Business rules

### Money

- Amounts are always stored in **grosze as integers**. Never calculate with floating-point złoty values.
- Conversion and formatting only through `libs/shared/util/money` (`toGrosze`, `fromGrosze`, `formatPLN`).
- Display format: `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })`, e.g. `1 234,56 zł`.
  Note: the thousands separator is a **non-breaking space** (U+00A0). In tests, compare through a whitespace-normalising helper or build the expected value with `formatPLN`.
- The amount field in forms accepts both comma and dot (`12,50` and `12.50`).
- The spreadsheet allowed entering `=10+5,20` into a single cell. The app instead stores **separate transactions** and aggregation does the summing.

### Categories

- Two levels: top-level category → subcategory. Transactions and plan entries are assigned to leaves.
- A top-level category without subcategories is a leaf (typical for income, e.g. "800+").
- A category used in transactions or plan entries is **never deleted, only archived**. Archived categories do not appear in forms but remain in history and summaries. Deleting rows in the spreadsheet caused `#REF!` errors; we avoid that.
- Category order is set by the user (`order`).

### Monthly indicators (dashboard)

For month M and "today" D (if M is the current month; for past months D = the last day of the month):

| Indicator | Formula |
|---|---|
| Planned income / expenses | sum of `planned` over leaves of that type |
| Left to allocate | planned income − planned expenses (goal: 0, zero-based budgeting) |
| Actual income / expenses | sum of transactions of that type in M |
| Still available to spend | actual income − actual expenses |
| Days left in month | days in M − day(D) + 1 (including today) |
| Average available per day | "still available to spend" / "days left" |
| % of income spent | actual expenses / actual income |
| % of month elapsed | day(D) / days in M |
| Category realisation | actual / planned; when planned = 0, no % (display "—") |
| Difference | planned − actual (negative = overspent, highlight with the error colour) |

**Reference fixture for tests** (September 2026, D = 24 Sept):
planned income 20 100,00; planned expenses 8 450,00 → left to allocate 11 650,00;
actual income 20 589,26; actual expenses 7 352,44 → still available 13 236,82;
days left 7 → average 1 890,97 per day; % of income spent 36%; month elapsed 80%.

Rounding: round derived amounts to a whole grosz (`Math.round`); round percentages to integers only for display.

Calculations are **pure functions** in `libs/budget/data-access/src/lib/summary` (or in `domain`), covered by unit tests. Components only display the result.

### Yearly summary

Table: rows are top-level categories (expandable to subcategories), columns are 12 months plus the yearly total and the monthly average. Income, expenses and the monthly balance are shown separately.

## 7. Views and routing

| Path | View | Description |
|---|---|---|
| `/` | redirect | → `/month/<current YYYY-MM>` |
| `/month/:month` | Dashboard | KPIs from section 6, category list with realisation bars (`LinearProgress`) |
| `/month/:month/transactions` | Transactions | table with filters (type, category, text), add, edit, delete |
| `/month/:month/grid` | Daily grid | rows: categories/subcategories, columns: days 1–31 with weekday names, row and column totals; clicking a cell opens that cell's transactions with an option to add one |
| `/month/:month/plan` | Plan | edit planned amounts, "copy plan from previous month" action |
| `/year/:year` | Year | yearly summary |
| `/categories` | Categories | tree, add, edit, archive, reorder |

Month navigation (previous / next / picker) in the header. The selected month comes from the URL, not from a store.

## 8. Code conventions

### React and React Compiler

- Function components, named exports, one component per file (small helper components may stay in the same file).
- **Do not use `useMemo`, `useCallback` or `React.memo` "just in case"**; React Compiler handles memoisation. An exception is allowed only with a comment explaining why it is needed.
- Follow the Rules of React: no mutation of props or state, no conditional hooks, no side effects during render. ESLint (`eslint-plugin-react-hooks` with the compiler rules) must pass with no errors.
- Avoid `useEffect` for syncing derived state. Compute it during render. Effects are only for syncing with external systems.
- Pass `ref` as a regular prop (no `forwardRef`).

### TanStack Query

- Query keys only from the factory in `data-access` (e.g. `budgetKeys.transactions(month)`); query definitions via `queryOptions()`.
- Features use hooks from `data-access` (`useTransactions(month)`, `useCreateTransaction()`), never `fetch` directly.
- After a mutation: `invalidateQueries` on the relevant keys. Adding and deleting a transaction use an **optimistic update** with rollback in `onError`.
- Every view handles these states: `isPending` (skeleton), error (Alert + "Try again"), empty (clear message with a call to action).
- Server data **never goes into Zustand**.

### Zustand

- UI state only: light/dark mode, collapsed/expanded categories, transaction list filters, last used category in the form.
- Always use selectors (`useUiStore(s => s.themeMode)`); use `useShallow` when returning objects.
- Persistent preferences via the `persist` middleware; `devtools` enabled in dev.

### Forms (RHF + Zod)

- Form schema in Zod, `zodResolver`, types via `z.infer`. The form schema (e.g. amount as a string with a comma) may differ from the domain schema; convert in `onSubmit`.
- Connect MUI components through **`Controller`** (or a shared wrapper in `shared/ui`, e.g. `FormTextField`, `FormSelect`).
- Use **`useWatch`** instead of `watch()` to observe values; `watch()` does not play well with React Compiler.
- Validation messages in Polish, shown next to the field (`helperText`).
- Transaction form: default date is today; default category is the last used one; after saving, reset while keeping the date (fast entry of many expenses from the same day).

### MUI and styling

- One theme in `shared/ui` (`createTheme`), light and dark mode support, Polish MUI locale.
- Custom tokens (e.g. income/expense colours) via module augmentation of the theme types.
- Styling priority: `theme.components` (global overrides) → `styled()` (reusable components) → `sx` (small one-off tweaks). In large tables (daily grid) avoid `sx` on every cell.
- Amounts right-aligned with tabular figures (`font-variant-numeric: tabular-nums`).

### Storybook

- Every component in `shared/ui` has a `*.stories.tsx` file (CSF3, `satisfies Meta<typeof X>`) with autodocs.
- Variants: default, edge cases (empty, very long text, negative value), dark mode.
- Interactions tested with `play` functions. The a11y addon reports no errors.
- Atomic design split: `atoms/` (e.g. `MoneyText`, `ProgressBar`), `molecules/` (e.g. `KpiCard`, `CategoryProgressRow`, `MonthSwitcher`), `organisms/` live in features.

### Naming and files

- Component files: `PascalCase.tsx`; hooks: `useSomething.ts`; everything else: `kebab-case.ts`.
- Code, identifiers and technical comments in English; **UI text in Polish** (kept in one place per feature, e.g. `messages.ts`, ready for i18n).
- No `any`. No `as` except justified cases with a comment.

## 9. Testing

- **Vitest unit**: all functions in `util` and the summary calculations (including the fixture from section 6), Zod schemas (valid and invalid data).
- **Vitest + Testing Library (integration)**: feature views with MSW as the backend. A test wrapper with a fresh `QueryClient` (`retry: false`) per test, ThemeProvider and the router.
- Query priority: `getByRole` → `getByLabelText` → `getByText` → `getByTestId` (last resort).
- Interactions via `userEvent.setup()`, not `fireEvent`. Async via `findBy*` and `waitFor`, never artificial timeouts.
- **Playwright E2E**: critical paths: adding an expense and seeing it on the dashboard; planning a budget and seeing the % realisation; adding a subcategory and using it in the form; navigating between months. Role-based locators, web-first assertions, Page Objects in `coinjar-web-e2e/src/pages`.
- Every new feature or bug fix comes with a test. For bugs, write the test before the fix.

## 10. Commands

```bash
pnpm install
pnpm nx serve coinjar-web            # dev server
pnpm nx build coinjar-web
pnpm nx test <project>               # Vitest
pnpm nx lint <project>
pnpm nx e2e coinjar-web-e2e          # Playwright
pnpm nx storybook shared-ui
pnpm nx affected -t lint test build  # changed projects only
pnpm nx graph                        # dependency graph
pnpm commit                          # Commitizen (Conventional Commits)
```

Create new libraries with Nx generators (`pnpm nx g @nx/react:library ...`) with the proper tags, not by hand.

Before considering a task done: `lint`, `test` and `build` pass for affected projects (`nx affected`).

### Git

- Conventional Commits: `feat(transactions): ...`, `fix(plan): ...`, `test(...)`, `chore(...)`, `docs(...)`. Scope = feature or library name.
- Husky: `pre-commit` runs lint-staged (ESLint + Prettier on changed files), `commit-msg` runs commitlint.
- Never commit real financial data. The seed uses sample data.
- Branching, pull requests and CI rules: see section 15.

## 11. Working with Claude

This is a learning project, so:

- Communicate with the user in Polish unless they write in English. This file, code and commits stay in English.
- For every non-trivial decision (structure, library API choice, pattern), **briefly explain "why"** and name an alternative. These questions come up in interviews.
- When the user writes "**practice mode**" (or "**tryb ćwiczeń**"): do not write the finished solution. Prepare a skeleton (types, signatures, tests that must pass) and wait for the user to implement the rest; then do a code review.
- After finishing a milestone, suggest 3–5 interview questions related to what was built. Always include at least one on Nx, modular monolith architecture, generators or AI-assisted work (section 16).
- Work in small steps, one milestone at a time. Do not jump ahead of the plan without approval.
- **Do not start any Supabase work** (section 14) until the user explicitly says the interview preparation stage is finished. Until then, do not install `@supabase/supabase-js`, do not create the `supabase/` folder or login screens. You may and should follow the rules in section 14.1, since they cost little and make the later migration easier.

## 12. Milestones

1. **Foundation**: Nx workspace (pnpm, Vite, React, React Compiler), ESLint flat config, Prettier, Husky, lint-staged, Commitizen, commitlint, tags and module boundaries, empty layout with routing. First push to the GitHub repo, basic CI workflow (lint, test, build) and the Vercel project connected, so the app is deployed from day one (section 15).
2. **Domain and util**: Zod schemas, `money`, dates, summary calculations with tests (fixture from section 6).
3. **Nx plugin and generators** (section 16): local plugin `tools/coinjar-plugin`, generators `library`, `ui-component` and `feature-view` with tests, `bannedExternalImports` in module boundaries, ADR 0001 "Modular monolith", a Claude Code command that drives the generators.
4. **Design system**: theme (light/dark), atoms and molecules in Storybook with `play` functions and a11y (components created with the `ui-component` generator).
5. **Data access**: MSW with persistence and delay, API client, query keys, Query hooks, seed data.
6. **Categories**: tree, CRUD, archiving, ordering.
7. **Transactions**: list with filters (filters in Zustand), RHF + Zod + MUI form, optimistic updates.
8. **Plan and dashboard**: plan editing, copy from previous month, KPIs and realisation bars.
9. **Daily grid**: categories × days table with totals, cell details.
10. **Yearly summary**: 12-month table (optionally a chart).
11. **E2E and quality**: Playwright scenarios, the E2E job in CI, required status checks on `main`, optionally E2E smoke tests against Vercel preview deployments (section 15).
12. **Monitoring**: CloudWatch RUM (configured from env, enabled in production only), an Error Boundary that reports errors, a custom "transaction_created" event, with no personal data or amounts in events.

**End of the interview preparation stage.** Further steps only on the user's explicit instruction:

13. **(Deferred) Supabase backend**: sub-stages S1–S7 from section 14.6.

## 13. Seed data

Structure based on the original spreadsheet (no personal data; household members' names replaced by the `Member` entity).
Category names stay in Polish because they are shown in the UI.

**Income** (leaves): Wynagrodzenie, Nadgodziny, Świadczenia socjalne, Odsetki bankowe, Sprzedaż (Allegro itp.), 800+, Premie bankowe, Prezenty, Inne przychody.

**Expenses** (category → subcategories):

- Jedzenie → Jedzenie dom, Jedzenie na mieście, Słodycze, Alkohol, Kawa
- Dom → Prąd, Woda, Śmieci, Gaz, Konserwacja i naprawy, Wyposażenie domu, Ubezpieczenie nieruchomości, Narzędzia, Ogród, Inne
- Transport → Paliwo, Przeglądy i naprawy, Części, Ubezpieczenie auta, Wysyłki paczek, Bilety komunikacji, Autostrada, Parking, Myjnia, Inne
- Telekomunikacja → Telefon, Internet, Serwisy streamingowe, Inne
- Opieka zdrowotna → Lekarz, Badania, Lekarstwa, Inne
- Ubranie → Dorośli, Dzieci
- Higiena → Kosmetyki, Środki czystości, Fryzjer, Kosmetyczka, Soczewki kontaktowe, Inne
- Dzieci → Pampersy, Kosmetyki, Prezenty, Zabawki / gry, Przedszkole — wyżywienie, Zajęcia dodatkowe, Wycieczki, Inne
- Rozrywka / Hobby → Akwarium, Zwierzęta, Książki, Kino / koncerty, Szycie, Paznokcie, Wakacje / turystyka, Inne
- Inne wydatki → Dobroczynność, Prezenty, Sprzęt RTV, Oprogramowanie, Edukacja / szkolenia, Usługi, Artykuły biurowe, Inne
- Spłata długów → Kredyt / pożyczka
- Budowanie oszczędności → PPK, Obligacje, Złoto, Poduszka finansowa, Lokaty, Inne
- Wydatki służbowe → Wydatki służbowe
- Kościół → Ofiara, Opłaty okolicznościowe, Fundusz remontowy, Inne
- Podatki → Podatek od nieruchomości, Inne

The seed also generates a plan and ~40 sample transactions for the current and previous month, so the dashboard, grid and yearly summary have something to show right away. The seed is deterministic (fixed generator) so tests and screenshots are repeatable.

## 14. Supabase backend (DEFERRED STAGE)

> **Status: DO NOT IMPLEMENT.** Start only after interview preparation is finished and on the user's explicit instruction (section 11).
> Until then, this section is a plan and a set of rules that keep the code "Supabase-ready".

### 14.1. Rules that apply now (MSW version)

- Features never call `fetch` or any HTTP client directly. Only hooks from `data-access`.
- API functions are async and **throw** on failure. The contract (`getTransactions(month): Promise<Transaction[]>`, etc.) does not depend on the data source.
- Network data is validated with Zod at the `data-access` boundary before it reaches the app.
- Mapping between the "wire" shape and the domain model lives in one place (mappers in `data-access`), never in components.
- Summary calculations stay pure functions, independent of where transactions came from.

### 14.2. Stage goals

- Persistent storage in Postgres (Supabase) instead of `localStorage`.
- User sign-in (Supabase Auth, magic link to start with).
- **Shared household budget**: several users access the same data. The `Member` entity stays as "the household member an expense relates to" and is independent of user accounts.
- Security through Row Level Security.

### 14.3. Structure and environment

- A `supabase/` folder at the repo root (the Supabase CLI default layout: `migrations/`, `seed.sql`, `config.toml`), wrapped as an Nx project `supabase` with `start`, `stop`, `reset`, `gen-types`, `migration-new` targets.
- Locally: `supabase start` (Docker). Production: a Supabase cloud project with the same migrations.
- Deployment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in Vercel per environment (Preview may point to a separate Supabase project or branch); `VITE_ENABLE_MSW` turned off in Production. Migrations are applied by a GitHub Actions job (`supabase db push`) on merge to `main`, before or together with the Vercel production deployment — never manually.
- **The schema changes only through migrations in the repo**, never by clicking in the dashboard.
- App environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the "anon" key in older projects).
  **The `service_role` / secret key never goes into the frontend or into `VITE_*` variables**, because those end up in the bundle.
- Database types: `supabase gen types typescript --local > libs/budget/data-access/src/lib/supabase/database.types.ts`. Generated file, never edited by hand; regenerate after every migration.

### 14.4. Database schema (draft of the first migration)

```sql
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('income', 'expense')),
  parent_id uuid references public.categories on delete restrict,
  sort_order int not null default 0,
  archived boolean not null default false,
  color text,
  unique nulls not distinct (household_id, parent_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  date date not null,                                   -- no time zone
  amount bigint not null check (amount > 0),            -- grosze
  category_id uuid not null references public.categories on delete restrict,
  note text check (char_length(note) <= 200),
  member_id uuid references public.members on delete set null,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.transactions (household_id, date);

create table public.budget_plan_entries (
  household_id uuid not null references public.households on delete cascade,
  month date not null check (extract(day from month) = 1), -- first day of the month
  category_id uuid not null references public.categories on delete restrict,
  planned bigint not null check (planned >= 0),
  primary key (household_id, month, category_id)
);
```

Notes:

- `on delete restrict` on categories enforces the "archive, don't delete" rule at the database level.
- `order` is a reserved word in SQL, hence `sort_order`; the mapper translates it to `order` in the domain model.
- `month` is stored as a `date` (e.g. `2026-09-01`); the mapper converts it to `'YYYY-MM'`.
- Rules that are harder to express as constraints (max 2 category levels, transactions only on leaves, subcategory type matching its parent) are checked by Zod in the app and eventually also by a database trigger. The app must not assume the database will accept arbitrary data.
- Plan entries are saved with `upsert` on the primary key.

### 14.5. Row Level Security

Every table has RLS enabled. Only members of the household have access:

```sql
create function public.is_household_member(hid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = (select auth.uid())
  );
$$;

alter table public.transactions enable row level security;

create policy "household members manage transactions"
  on public.transactions for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
-- same for: categories, members, budget_plan_entries, households (select)
```

- `household_members`: a user sees only their own memberships.
- A household is created through an RPC function `create_household(name)` that, in a single transaction, creates the household and adds the creator as `owner`; it also inserts the default categories (seed from section 13).
- Inviting other users is out of scope for the first version.
- RLS policies have tests (pgTAP via `supabase test db`) verifying that a user outside the household can neither read nor modify its data.

### 14.6. App changes and sub-stages

**S1. Infrastructure**: Supabase CLI, Nx project `supabase`, first migration, `seed.sql` with test data, type generation.

**S2. RLS**: policies, `is_household_member` function, `create_household` RPC, pgTAP tests.

**S3. Client and data-access**:
- a client singleton in `libs/budget/data-access/src/lib/supabase/client.ts`, typed with `Database`,
- API functions keep the contract from 14.1; every call checks `error` and throws it (Supabase returns `{ data, error }` instead of throwing),
- `fromDbRow` / `toDbRow` mappers (`snake_case` ↔ `camelCase`, `sort_order` ↔ `order`, `month` date ↔ `'YYYY-MM'`) and Zod validation,
- a data source switch for the migration period (`VITE_DATA_SOURCE=msw | supabase`), removed once the migration is complete.

**S4. Auth**:
- a new library `libs/budget/feature-auth` (magic link sign-in screen, callback handling),
- a `useSession()` hook based on `supabase.auth.onAuthStateChange`; the session lives in the Supabase client, **do not duplicate it in Zustand**,
- protected routes: no session → redirect to `/login`; first sign-in without a household → household creation screen,
- the current household as a `useCurrentHousehold()` query; `householdId` passed to write functions,
- **call `queryClient.clear()` on sign-out** so the previous user's data does not stay in the cache.

**S5. Yearly summary in the database**: an RPC function `yearly_summary(household_id, year)` returning totals per (month, category, type). The monthly summary stays calculated in TypeScript. Comparing the two approaches is good material for a discussion about trade-offs.

**S6. Tests**:
- Vitest and Storybook stay on MSW; handlers mimic PostgREST endpoints (`/rest/v1/...`) and auth,
- Playwright against local Supabase: `supabase db reset` before the run, a test user from the seed, sign in once via `storageState`,
- an E2E scenario verifying data isolation between two households.

**S7. (Optional) Realtime**: subscribe to changes in `transactions` for the current household; in the callback call `invalidateQueries(budgetKeys.transactions(month))` rather than editing the cache by hand.

Monitoring (CloudWatch RUM) after connecting the backend: report Supabase request errors without data content, amounts or email addresses.

## 15. Repository, CI/CD and deployment

### 15.1. Repository

- GitHub: `https://github.com/grzeg/coinjar` (created empty; the first push happens in milestone 1).
- Default branch `main`, protected: changes only through pull requests, required status checks from 15.3 must pass, linear history.
- Merge strategy: **squash merge**; the PR title must be a Conventional Commit (it becomes the commit message on `main`), checked in CI.
- Short-lived branches named `feat/...`, `fix/...`, `chore/...`, `test/...`, `docs/...`.
- `package.json` declares `packageManager` (pnpm with an exact version) so local machines, GitHub Actions and Vercel all use the same pnpm through Corepack. The Node version is pinned in `.nvmrc` and `engines`.
- Optional later: Renovate or Dependabot for dependency updates.

### 15.2. Split of responsibilities

- **GitHub Actions = CI** (quality gates): lint, typecheck, unit/integration tests, build, E2E. Vercel only runs the build command and does not replace a test pipeline.
- **Vercel = CD** (deployments) through the Vercel GitHub integration:
  - every pull request gets a **Preview Deployment** with its own URL (Vercel comments it on the PR),
  - merge to `main` creates the **Production Deployment**.
- Because `main` is protected by required checks, only code that passed CI reaches production.

### 15.3. CI workflow (`.github/workflows/ci.yml`)

Triggers: `pull_request` and `push` to `main`.

- Checkout with full history (`fetch-depth: 0`) so `nx affected` can compare against `main`; use `nrwl/nx-set-shas` to set the base and head SHAs.
- `pnpm/action-setup` + `actions/setup-node` with pnpm cache; `pnpm install --frozen-lockfile`.
- Job `quality`: `pnpm nx affected -t lint typecheck test build`.
- Job `commitlint`: validates the PR title (and commit messages) against Conventional Commits.
- Job `e2e`: installs Playwright browsers (cached), builds the app, serves it locally (`vite preview`) and runs `pnpm nx e2e coinjar-web-e2e`; uploads the Playwright HTML report and traces as artifacts on failure.
- Optional: Storybook build as a check (`nx build-storybook shared-ui`) so broken stories fail the PR.
- Optional: Nx Cloud remote cache to speed up CI (`NX_CLOUD_ACCESS_TOKEN` as a GitHub secret).

Required status checks on `main`: `quality`, `commitlint`, `e2e`.

### 15.4. Vercel project settings

- Framework preset: Vite (or "Other"); root directory: repository root.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm nx build coinjar-web`.
- Output directory: `dist/apps/coinjar-web` (verify against the actual Nx output path).
- **Ignored Build Step**: `npx nx-ignore coinjar-web`, so pushes that do not affect the app (e.g. docs only) do not trigger a deployment.
- `vercel.json` in the repo root with an SPA rewrite, otherwise deep links like `/month/2026-09/plan` return 404 on refresh:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- Long-term caching headers for hashed assets in `/assets/*` are fine; `index.html` must not be cached long-term.

### 15.5. Environment variables

Set in Vercel Project Settings separately for **Production** and **Preview** (and in `.env.local` for development; commit only `.env.example`):

| Variable | Production | Preview | Purpose |
|---|---|---|---|
| `VITE_ENABLE_MSW` | `true` (until the Supabase stage) | `true` | mock backend in the browser |
| `VITE_API_CHAOS` | `false` | optional `true` | random API errors for testing |
| `VITE_RUM_APP_MONITOR_ID` | set | empty | CloudWatch RUM app monitor |
| `VITE_RUM_IDENTITY_POOL_ID` | set | empty | Cognito identity pool for RUM |
| `VITE_RUM_REGION` | set | empty | AWS region of the RUM monitor |
| `VITE_APP_VERSION` | commit SHA | commit SHA | reported to RUM to link errors with a deployment |

- Everything prefixed `VITE_` is embedded in the public bundle. **Never put secrets there.**
- Environment access goes through one typed, Zod-validated module (e.g. `apps/coinjar-web/src/env.ts`); the app fails fast with a clear message when a required variable is missing.
- RUM is initialised only when its variables are present, so previews and local dev send no monitoring data. Add the Vercel production domain to the RUM app monitor's allowed domain.
- `VITE_APP_VERSION` can be derived in `vite.config.ts` from Vercel's system variable `VERCEL_GIT_COMMIT_SHA`.

### 15.6. E2E against preview deployments (optional, milestone 11)

- A separate workflow triggered by the `deployment_status` event (state `success`) runs a small Playwright smoke suite against the preview URL (`baseURL` taken from the event).
- If Vercel Deployment Protection is enabled for previews, use the "Protection Bypass for Automation" secret (`VERCEL_AUTOMATION_BYPASS_SECRET` as a GitHub secret, sent as the `x-vercel-protection-bypass` header in Playwright's `extraHTTPHeaders`).
- The full E2E suite still runs in the main CI workflow against a local build; the preview suite only confirms the deployed build works (routing, assets, env).

## 16. Interview focus: Nx, modular monolith, generators, AI-assisted work

The target role: a high-pressure project where the tech lead needs a solid senior who knows Nx in depth, designs modular monoliths, builds generators and works with AI tools in an agile way. CoinJar is small, so these skills are practised deliberately, not only when a feature needs them.

### 16.1. CoinJar as a modular monolith

- **One deployable, many modules.** `coinjar-web` is the only application; modules are Nx libraries. This is a modular monolith, not micro-frontends: one build, one deployment, one version of every dependency, but module boundaries as strict as between services.
- **Module = scope, layer = type.** `scope:*` tags are business modules (today `budget`, plus `shared`), `type:*` tags are layers inside a module (section 4). A new business area (e.g. `household`, `settings`) gets its own scope; it talks to other scopes only through their public API.
- **Public API is a contract.** Only what `index.ts` exports exists for other modules. No deep imports, no re-exporting internals "for convenience". Breaking a public API is a deliberate change.
- **Rules are enforced by tools, not by review.** `@nx/enforce-module-boundaries` (`depConstraints`, `bannedExternalImports`, `notDependOnLibsWithTags`) fails lint. Reviews discuss design, not import paths.
- **Architecture decisions are recorded** as ADRs in `docs/adr/NNNN-title.md` (Context, Decision, Alternatives, Consequences). ADR 0001: modular monolith with Nx. Add an ADR for every decision a new team member would ask "why?" about.
- `pnpm nx graph` is the architecture diagram; keep it readable (no cycles, no "god" libraries).

### 16.2. Generators

- A local Nx plugin `tools/coinjar-plugin` (created with `@nx/plugin`) holds workspace generators:
  - `library`: wraps `@nx/react:library` / `@nx/js:library` and enforces the directory, name, import path and tags from section 4. Nobody passes tags by hand.
  - `ui-component`: an atom or molecule in `shared/ui` with the component, a `*.stories.tsx` file (CSF3, autodocs, dark mode variant), a test and the export in `index.ts`.
  - `feature-view`: a view in a feature library with `messages.ts`, loading/error/empty states and an integration test skeleton.
- Generators have unit tests (`createTreeWithEmptyWorkspace`, snapshot or assertions on generated files) and `--dry-run` output is reviewed before first use.
- New libraries and components are created **only** through generators. If a generator does not fit, extend the generator first, then generate. The same applies to AI: Claude runs the generator instead of writing boilerplate by hand.
- Optional: a sync generator (`nx sync`) that keeps a derived file in sync (e.g. route registry or tags documentation) and a check in CI (`nx sync:check`).

### 16.3. Nx features worth knowing in depth

Project graph and inferred targets (plugins in `nx.json`), task pipeline (`dependsOn`, `targetDefaults`), computation caching (inputs, `namedInputs`, outputs) and remote cache (Nx Cloud), `nx affected` in CI, TS project references and `nx sync`, `nx migrate` for upgrades, module boundaries, generators and executors, `nx release` (for publishable libraries, not used here).

### 16.4. Agile work with AI

- **Context as code.** This file is the single source of truth for AI agents and people. When a rule changes, it changes here first.
- **Deterministic scaffolding, AI for logic.** Generators produce structure; AI writes and reviews behaviour. Custom Claude Code commands in `.claude/commands/` wrap generators (e.g. `/new-ui-component`), so AI output follows the conventions every time.
- **Small, verifiable steps.** One milestone, one PR; tests first for bugs; `lint`, `typecheck`, `test`, `build` before a task is done. AI changes get the same review as human changes: no unreviewed merges.
- **Guardrails, not trust.** Module boundaries, strict TypeScript, ESLint (React Compiler rules), commitlint and CI catch mistakes regardless of who made them.
- **Know when not to use AI.** Security-sensitive code, secrets and irreversible operations (force pushes, data migrations) are done or confirmed by a human.
