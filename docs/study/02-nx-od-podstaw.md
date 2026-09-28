# 02. Nx od podstaw: graf projektów, zadania, pluginy (porównanie z Turborepo)

## TL;DR

- Nx i Turborepo rozwiązują ten sam problem (cache + `affected` w monorepo), ale **Nx dodatkowo zna strukturę Twojego kodu**: graf projektów, zależności, tagi, granice modułów, generatory. Turborepo zna tylko graf **zadań** zdefiniowany ręcznie w `turbo.json`.
- **Graf projektów** to model repo: węzły to projekty (`apps/*`, `libs/*`), krawędzie to zależności (kto kogo importuje). Nx buduje go automatycznie, analizując kod i `package.json`.
- **Target** (zadanie) to coś, co można uruchomić na projekcie: `build`, `test`, `lint`. W CoinJar targety są w większości **wywnioskowane** przez pluginy (`@nx/vite/plugin`, `@nx/vitest`, `@nx/eslint/plugin`) z plików konfiguracyjnych, które i tak już masz (`vite.config.ts`, `eslint.config.mjs`) — nie trzeba ich ręcznie definiować.
- **Task pipeline** (`dependsOn`, `targetDefaults`) mówi, w jakiej kolejności i z jakimi zależnościami uruchamiać targety, np. „test” najpierw zbuduj wszystkie zależności (`^build`).
- Ty znasz Turborepo — dobra wiadomość: **pnpm workspaces, filtrowanie po zmianie, lokalny i zdalny cache to te same idee**. Nowe rzeczy do nauczenia: graf projektów jako pierwszoklasowy obiekt (`nx graph`), wywnioskowane targety zamiast `turbo.json`, tagi + `enforce-module-boundaries`, generatory.

---

## 1. Punkt odniesienia: co już umiesz z Turborepo

W Turborepo:

```jsonc
// turbo.json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
  },
}
```

Uruchamiasz `turbo run test --filter=...[origin/main]`, Turborepo liczy, które paczki się zmieniły (przez `git diff` + graf zależności z `package.json`), i puszcza tylko ich zadania, z cache na wynik.

Nx robi dokładnie to samo pod spodem: **graf zależności + hash inputów + cache + selektywne uruchamianie**. Różnice zaczynają się w tym, **skąd biorą się zadania i granice modułów** — o tym ten rozdział.

Szybka mapa pojęć, żeby nic nie brzmiało obco:

| Turborepo                                      | Nx                                                      |
| ---------------------------------------------- | ------------------------------------------------------- |
| paczka w `apps/*` / `packages/*`               | **projekt** (`apps/*` / `libs/*`)                       |
| `turbo.json` → `tasks`                         | **target** (per projekt, ręczny lub wywnioskowany)      |
| `dependsOn: ["^build"]`                        | `dependsOn: ["^build"]` — ta sama składnia i sens       |
| `--filter=...[origin/main]`                    | `nx affected -t test`                                   |
| Remote Cache (Vercel)                          | **Nx Cloud** (albo własny remote cache)                 |
| graf paczek (niejawny, z `package.json`)       | **graf projektów** (`nx graph`), jawny, przeglądalny    |
| brak wbudowanego pojęcia granic modułów        | **tagi** + `@nx/enforce-module-boundaries`              |
| brak wbudowanego scaffoldingu                  | **generatory** (`nx g ...`)                             |
| `turbo.json` (jeden plik, ręczna konfiguracja) | **pluginy** wnioskujące targety z istniejących configów |

---

## 2. Graf projektów: pierwszoklasowy obiekt, nie efekt uboczny

W Turborepo graf paczek to w praktyce szczegół implementacyjny — liczysz się z nim tylko przez `dependsOn` i filtry. W Nx **graf projektów jest widoczny i przeglądalny**:

```bash
pnpm nx graph
```

Otwiera interaktywną wizualizację: węzły to projekty, strzałki to zależności (import jednego projektu przez drugi). To realne narzędzie do rozmowy o architekturze, nie ciekawostka — w CoinJar `nx graph` **jest** diagramem architektury z CLAUDE.md sekcja 16.1.

Nx liczy graf z dwóch źródeł:

1. **Zależności jawne** — `package.json` każdego projektu (`dependencies`, dla CoinJar głównie puste, bo importy idą przez `workspace:*` w aplikacji, nie między libami).
2. **Zależności wywnioskowane ze statycznej analizy kodu** — Nx parsuje importy (`import { X } from '@coinjar/shared-util'`) i mapuje nazwę paczki na projekt, który ją eksportuje.

Efekt: graf jest **zawsze zgodny z rzeczywistym kodem**, nie z tym, co ktoś zadeklarował ręcznie. Stąd biorą się realne komendy z rozdziału 01:

```bash
pnpm nx show projects --affected --files=libs/shared/util/src/lib/dates/month.ts
# shared-util, shared-domain, coinjar-web, coinjar-web-e2e
```

Turborepo tego nie policzy z samej analizy kodu — opiera się na grafie `package.json` (kto ma kogo w `dependencies`), więc jeśli dwie paczki importują się nawzajem bez wpisu w `package.json` (w praktyce rzadkie przy `workspace:*`, ale możliwe przy złej konfiguracji), graf i tak by to złapał tylko przez zależność w manifeście. Nx dokłada analizę importów jako dodatkową warstwę pewności.

---

## 3. Projekt i target: z czego się składają

**Projekt** = folder z `package.json` wewnątrz `apps/*` lub `libs/*/*` (ścieżki z `pnpm-workspace.yaml`). Realny przykład z CoinJar (`libs/shared/util/package.json`):

```json
{
  "name": "@coinjar/shared-util",
  "nx": {
    "name": "shared-util",
    "tags": ["scope:shared", "type:util"]
  }
}
```

Klucz `nx.tags` to właśnie granice modułów z rozdziału 01 (sekcja 4 tamtego rozdziału). Zwróć uwagę: **nie ma tu `project.json`** — w starszych wersjach Nx każdy projekt miał osobny plik z listą targetów. CoinJar tego nie ma, bo targety są **wywnioskowane**.

**Target** = zadanie uruchamialne na projekcie: `build`, `test`, `lint`, `typecheck`, `e2e`. W Turborepo każdy target definiujesz raz, globalnie, w `turbo.json`. W Nx target może:

- być **zdefiniowany ręcznie** w `project.json` (stary styl, wciąż spotykany w starszych repo),
- albo być **wywnioskowany przez plugin** z pliku konfiguracyjnego, który i tak istnieje.

CoinJar używa drugiego stylu. Realny `nx.json` (fragment):

```json
"plugins": [
  { "plugin": "@nx/js/typescript", "options": { "typecheck": { "targetName": "typecheck" } } },
  { "plugin": "@nx/vite/plugin", "options": { "buildTargetName": "build", "serveTargetName": "serve" } },
  { "plugin": "@nx/vitest", "options": { "testTargetName": "test", "ciTargetName": "test-ci" } },
  { "plugin": "@nx/eslint/plugin", "options": { "targetName": "lint" } },
  { "plugin": "@nx/playwright/plugin", "options": { "targetName": "e2e" } }
]
```

Czyta się to tak: „jeśli projekt ma `vite.config.ts`, dostaje target `build`/`serve`/`preview` — Nx sam wie, jak go uruchomić, bo przeczytał configu Vite. Jeśli ma `eslint.config.mjs`, dostaje target `lint`.” **Nie trzeba nic z tego pisać ręcznie ani utrzymywać w dwóch miejscach** (raz w Vite, raz w `turbo.json`).

Dowód — realny wynik `pnpm nx show project shared-util --json` (skrócony):

```json
{
  "name": "shared-util",
  "tags": ["npm:private", "scope:shared", "type:util"],
  "targets": {
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --build tsconfig.json --emitDeclarationOnly"
      },
      "dependsOn": ["^typecheck"],
      "cache": true
    },
    "test": {
      "executor": "nx:run-commands",
      "options": { "command": "vitest" },
      "dependsOn": ["^build"],
      "cache": true,
      "outputs": ["{projectRoot}/test-output/vitest/coverage"]
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "eslint ." },
      "cache": true
    }
  }
}
```

Ten JSON nie jest zapisany nigdzie w repo — Nx wylicza go za każdym razem z pluginów + configów. To jest odpowiednik `turbo.json` w Turborepo, tylko że **rozproszony po configach narzędzi i generowany**, zamiast scentralizowany i ręczny.

**Kompromis, o którym warto wspomnieć na rozmowie:** wywnioskowane targety to mniej boilerplate'u, ale mniej „widać na pierwszy rzut oka”, co się uruchomi. `nx show project <nazwa>` jest wtedy narzędziem, po które sięgasz zamiast czytać plik.

---

## 4. Task pipeline: `dependsOn` i `targetDefaults`

Ta część jest **najbardziej znajoma z Turborepo** — składnia i znaczenie `dependsOn` są praktycznie identyczne.

`nx.json` w CoinJar:

```json
"targetDefaults": {
  "test": {
    "dependsOn": ["^build"]
  }
}
```

Czytaj: „zanim uruchomisz `test` na projekcie X, uruchom `build` na wszystkich projektach, od których X zależy (`^` = zależności, nie sam projekt)”. Dokładnie ten sam mechanizm co w `turbo.json`:

```jsonc
{ "test": { "dependsOn": ["^build"] } }
```

Różnica: w Nx **domyślne targety poszczególnych pluginów już mają sensowne `dependsOn` wpisane same** (np. `typecheck` ma `dependsOn: ["^typecheck"]` wywnioskowane przez `@nx/js/typescript` — widać to w wyniku z sekcji 3), a `targetDefaults` w `nx.json` **dopisuje albo nadpisuje** to dla całego workspace'u. Nadpisanie per-projekt wciąż można zrobić w `project.json`, jeśli komuś naprawdę potrzeba wyjątku.

Efekt praktyczny — polecenie z CLAUDE.md:

```bash
pnpm nx affected -t lint test build
```

liczy graf zadań (kto od kogo zależy przez `dependsOn`), przecina go z grafem projektów dotkniętych zmianą (`affected`), i wykonuje **tylko potrzebne zadania, w poprawnej kolejności, równolegle tam gdzie się da**. To jest dokładnie to, co robi `turbo run lint test build --filter=...[HEAD^]`, tym samym algorytmem (topological sort + cache + równoległość).

---

## 5. Cache: inputs, outputs, hash

Nx cache'uje wynik targetu, licząc hash z:

- **inputs**: co wpływa na wynik — pliki źródłowe, configi, zmienne środowiskowe, **outputy zależności** (`^production` itd.),
- **executor/komenda** i jej opcje,
- **wersje zależności zewnętrznych** (`externalDependencies`, np. `vitest`).

Jeśli hash się zgadza z poprzednim uruchomieniem — Nx **nie uruchamia komendy**, tylko odtwarza zapisane `outputs` i logi. To jest ten sam mechanizm co cache Turborepo (hash → cache hit/miss), różni się głównie domyślną granulacją inputów (`namedInputs` w `nx.json`, sekcja 6) i tym, że część inputów Nx wnioskuje automatycznie z configów pluginów (np. `test` w `shared-util` ma w inputach `{"externalDependencies":["vitest"]}` — zmiana wersji Vitest unieważnia cache, bez ręcznego wpisywania tego w konfiguracji).

Głębiej: `affected`, granulacja cache i zdalny cache (Nx Cloud vs Vercel Remote Cache) — rozdział 03.

---

## 6. `namedInputs`: co realnie wpływa na cache

Realny fragment `nx.json`:

```json
"namedInputs": {
  "default": ["{projectRoot}/**/*", "sharedGlobals"],
  "production": [
    "default",
    "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
    "!{projectRoot}/tsconfig.spec.json",
    "!{projectRoot}/.eslintrc.json",
    "!{projectRoot}/eslint.config.mjs"
  ],
  "sharedGlobals": []
}
```

- `default` = wszystkie pliki projektu — jeśli cokolwiek się zmieni, cache targetu tego projektu pada.
- `production` = `default` **minus** pliki, które nie wpływają na zbudowany kod (testy, configi testowe, configi lintera). Po co: gdy `feature-dashboard` zależy od `shared-util`, a ktoś zmienia tylko test w `shared-util`, to `build`/`typecheck` w `feature-dashboard` **nie musi się przeliczać** — bo wejście `^production` (zależności liczone jako `production`, nie `default`) się nie zmieniło.

To jest odpowiednik ręcznego `outputs`/`inputs` w `turbo.json`, ale zdefiniowany **raz, jako nazwane zestawy globów**, wielokrotnego użytku między targetami (`test` używa `^production` w inputach właśnie dlatego, żeby zmiana testu w zależności nie inwalidowała cache zależnych projektów).

---

## 7. Pluginy: skąd Nx wie, jak coś zbudować

„Plugin” w Nx robi dwie rzeczy:

1. **Wnioskuje targety** z istniejącego configu (opisane w sekcji 3) — `@nx/vite/plugin` widzi `vite.config.ts` i dodaje `build`/`serve`/`preview`.
2. Może dorzucić **generatory** (rozdział 05) i **executory** (gotowe, przetestowane sposoby odpalania narzędzi, np. `@nx/eslint:lint`).

Lista pluginów w CoinJar (`nx.json`) i co robią:

| Plugin                  | Wnioskuje                                                |
| ----------------------- | -------------------------------------------------------- |
| `@nx/js/typescript`     | target `typecheck` z `tsconfig.json`/`tsconfig.lib.json` |
| `@nx/vite/plugin`       | `build`, `serve`, `preview` z `vite.config.ts`           |
| `@nx/vitest`            | `test`, `test-ci` z `vitest.config.ts`                   |
| `@nx/eslint/plugin`     | `lint` z `eslint.config.mjs`                             |
| `@nx/playwright/plugin` | `e2e` z `playwright.config.ts`                           |

Różnica filozofii vs Turborepo: Turborepo **nie ma** koncepcji pluginu wnioskującego zadania — `turbo.json` jest jedynym źródłem prawdy o tym, jakie zadania istnieją, i to Ty je tam wpisujesz (nawet jeśli komenda w środku to i tak `vite build`). W Nx **konfiguracja narzędzia (Vite, Vitest, ESLint) jest jedynym źródłem prawdy**, a target to tylko „uchwyt", żeby to uruchomić przez wspólny task-runner z cache. Mniej duplikacji, ale trzeba pamiętać, że target „ukrywa się” w configu narzędzia, a nie w jednym centralnym pliku.

---

## 8. Executory: `nx:run-commands` kontra dedykowany executor

W przykładzie z sekcji 3 każdy target ma `"executor": "nx:run-commands"` — to najprostszy executor, po prostu odpala shellową komendę (`vitest`, `eslint .`) w katalogu projektu, z cache i inputami/outputami doklejonymi przez plugin. To, co w Turborepo byłoby wpisane wprost jako `"test": "vitest"` w `package.json` scripts, w Nx jest tym samym poleceniem, tylko opakowanym tak, żeby task-runner Nx wiedział o nim wszystko (cache, zależności, równoległość).

Bardziej zaawansowane executory (np. `@nx/eslint:lint`) potrafią dodatkowo np. inteligentnie budować listę plików do zlintowania albo integrować się głębiej z narzędziem — w CoinJar na razie nieużywane, bo wystarcza wywnioskowany `run-commands`.

---

## 9. Porównanie Nx vs Turborepo: tabela do rozmowy

| Cecha                       | Turborepo                                                           | Nx                                                                                                      |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Graf zależności             | z `package.json` (`dependencies`), niejawny                         | z `package.json` **+ analiza importów w kodzie**, jawny (`nx graph`)                                    |
| Definicja zadań             | ręcznie, jeden plik `turbo.json`                                    | wywnioskowana przez pluginy z configów narzędzi, albo ręcznie w `project.json`                          |
| `affected` / filtr          | `--filter=...[ref]`, liczony z `git diff` + graf paczek             | `nx affected`, ten sam pomysł, dodatkowo mapuje zmienione pliki na projekty przez graf                  |
| Cache lokalny               | tak, hash inputów → outputy                                         | tak, ten sam mechanizm, z `namedInputs`                                                                 |
| Cache zdalny                | Vercel Remote Cache (natywnie), self-hosted możliwy                 | Nx Cloud (natywnie), self-hosted możliwy                                                                |
| Granice modułów             | brak wbudowanych — trzeba `eslint-plugin-boundaries` albo konwencja | wbudowane: tagi + `@nx/enforce-module-boundaries`, failuje lint                                         |
| Generatory kodu             | brak wbudowanych — Plop, Hygen, własne skrypty                      | wbudowane: `nx g`, `Tree` API, testowalne (rozdział 05)                                                 |
| Wizualizacja grafu          | ograniczona (starsze wersje miały prosty graph)                     | `nx graph`, interaktywna, filtrowalna                                                                   |
| Migracje wersji frameworków | brak wbudowanego mechanizmu                                         | `nx migrate` — automatyczne codemody przy podbijaniu wersji (rozdział 07)                               |
| Filozofia configu           | jeden plik, jawny, mały narzut poznawczy                            | rozproszona po configach narzędzi, mniej duplikacji, większy narzut na start                            |
| Baza                        | dowolny package manager + workspaces                                | dowolny package manager + workspaces (**identyczne** — oba stoją na `pnpm workspaces`/`npm workspaces`) |

**Najważniejsza różnica jednym zdaniem:** Turborepo to **task runner z cache** nałożony na Twój istniejący workspace. Nx to **model całego repo** (projekty, graf, tagi, granice, generatory), w którym task runner z cache jest jednym z elementów. Migracja z jednego na drugie nie zmienia workspace'u (`pnpm-workspace.yaml` zostaje), zmienia to, ile struktury narzędzie samo rozumie i wymusza.

---

## 10. Jak to powiedzieć na rozmowie (gotowe zdania)

- „Z Turborepo znam cache i `affected` z grafu `package.json` — w Nx to samo, plus graf jest jawny (`nx graph`) i liczony też z analizy importów w kodzie, nie tylko z manifestów.”
- „W Nx target może być wywnioskowany z configu narzędzia, którego i tak używam — Vite, Vitest, ESLint. Mniej duplikacji niż osobny `turbo.json`, kosztem tego, że lista zadań nie jest w jednym miejscu, tylko `nx show project` mi ją pokazuje.”
- „`dependsOn` i `namedInputs` w Nx to ten sam pomysł co `dependsOn`/`outputs` w `turbo.json` — jeśli ktoś zna jedno, uczy się drugiego w godzinę.”
- „To, czego Turborepo nie ma wbudowanego, a potrzebowałbym w dużym repo: granice modułów wymuszone lintem (tagi + `enforce-module-boundaries`) i generatory kodu (`nx g`). To dokładam ponad to, co już umiem.”
- „Migracja z Turborepo do Nx nie rusza workspace'u pnpm — to wciąż `pnpm-workspace.yaml`. Zmienia się warstwa orkiestracji zadań i to, ile struktury narzędzie rozumie samo.”

---

## Pytania kontrolne

1. Czym różni się graf zależności w Turborepo od grafu projektów w Nx? Skąd Nx bierze dodatkową informację?
2. Co to jest target i skąd się bierze w CoinJar — pokaż na przykładzie `shared-util`.
3. Czym różni się target zdefiniowany w `project.json` od targetu wywnioskowanego przez plugin? Jaki jest koszt każdego podejścia?
4. Co robi `targetDefaults.test.dependsOn: ["^build"]` w `nx.json`? Jak to się ma do `dependsOn` w `turbo.json`?
5. Do czego służą `namedInputs` i czym różni się `default` od `production`? Podaj przykład, kiedy to oszczędza przeliczanie cache.
6. Wymień trzy pluginy Nx użyte w CoinJar i co każdy z nich wnioskuje.
7. Czym jest executor `nx:run-commands`? Jak to się ma do wpisania komendy wprost w `package.json`?
8. Wymień trzy rzeczy, które Nx ma wbudowane, a Turborepo wymaga dorobić samodzielnie.
9. Czy migracja z Turborepo na Nx wymaga zmiany package managera albo `pnpm-workspace.yaml`? Uzasadnij.
10. Jednym zdaniem: czym różni się filozofia Nx od filozofii Turborepo?

---

## Odpowiedzi (skrót)

1. Turborepo liczy graf tylko z `package.json` (`dependencies`). Nx dokłada analizę importów w kodzie — mapuje `import ... from '@coinjar/x'` na projekt, który to eksportuje — więc graf Nx jest zawsze zgodny z rzeczywistym kodem, nie tylko z manifestami.
2. Target = zadanie uruchamialne na projekcie (`build`, `test`, `lint`). W `shared-util` nic nie jest zdefiniowane ręcznie — `typecheck` bierze się z `@nx/js/typescript` (czyta `tsconfig.json`), `test` z `@nx/vitest` (czyta `vitest.config.ts`), `lint` z `@nx/eslint/plugin` (czyta `eslint.config.mjs`).
3. `project.json` = ręczna, jawna definicja (widać wszystko w jednym pliku, ale trzeba to utrzymywać). Wywnioskowany = zero duplikacji (target bierze się z configu narzędzia, który i tak istnieje), kosztem tego, że lista targetów nie jest w jednym miejscu — trzeba sięgnąć po `nx show project <nazwa>`.
4. Mówi: zanim uruchomisz `test` na projekcie, uruchom najpierw `build` na wszystkich jego zależnościach (`^` = zależności). To dokładnie ten sam mechanizm i składnia co `dependsOn` w `turbo.json`.
5. `namedInputs` to nazwane zestawy globów wielokrotnego użytku w `inputs` targetów. `default` = wszystkie pliki projektu, `production` = `default` minus testy/configi testowe/lintera. Oszczędność: zmiana testu w `shared-util` nie unieważnia cache `build`/`typecheck` w `feature-dashboard`, bo ten używa `^production` (a nie `^default`) jako wejścia zależności.
6. `@nx/vite/plugin` → `build`/`serve`/`preview` z `vite.config.ts`; `@nx/vitest` → `test`/`test-ci` z `vitest.config.ts`; `@nx/eslint/plugin` → `lint` z `eslint.config.mjs` (plus `@nx/js/typescript` → `typecheck`, `@nx/playwright/plugin` → `e2e`).
7. To najprostszy executor Nx — po prostu odpala shellową komendę (np. `vitest`) w katalogu projektu. Różnica względem wpisania komendy w `package.json` scripts: ta sama komenda jest teraz opakowana tak, żeby task-runner Nx wiedział o niej wszystko — cache, `dependsOn`, równoległość.
8. Tagi + `@nx/enforce-module-boundaries` (granice modułów wymuszone lintem), generatory (`nx g`, `Tree` API), `nx migrate` (automatyczne codemody przy aktualizacji wersji).
9. Nie — `pnpm-workspace.yaml` (albo odpowiednik npm/yarn) to warstwa niezmieniana przez żadne z narzędzi. Nx i Turborepo to dwie różne nakładki orkiestracji zadań na ten sam, niezmieniony sposób trzymania paczek w repo.
10. Turborepo to task runner z cache nałożony na istniejący workspace; Nx to model całego repo (graf, tagi, granice, generatory), w którym task runner z cache jest tylko jednym z elementów.
