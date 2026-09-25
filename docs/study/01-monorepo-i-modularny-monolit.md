# 01. Monorepo i modularny monolit: po co to wszystko

## TL;DR

- **Monorepo** mówi, **gdzie leży kod**: wiele projektów w jednym repozytorium git.
- **Monolit** mówi, **jak aplikacja jest wdrażana**: jako jedna całość.
- **Modularny** mówi, **jak kod jest podzielony w środku**: na moduły z twardymi granicami.
- To są trzy **niezależne** osie. „Modularny monolit w monorepo” to jedna konkretna kombinacja: jedna aplikacja wdrażana jako całość, zbudowana z wielu bibliotek, które pilnują swoich granic, i to wszystko w jednym repo.

---

## 1. Punkt wyjścia: problem, który monorepo rozwiązuje

Wyobraź sobie firmę z trzema aplikacjami frontendowymi (panel klienta, panel admina, landing), które korzystają ze wspólnego design systemu i wspólnego klienta API.

### Wariant A: polyrepo (każdy projekt w osobnym repo)

```
repo: design-system    → publikowany na npm jako @firma/ui@3.2.0
repo: api-client       → @firma/api@1.8.0
repo: panel-klienta    → zależy od @firma/ui@3.1.0, @firma/api@1.8.0
repo: panel-admina     → zależy od @firma/ui@2.9.0 (!), @firma/api@1.7.0
repo: landing          → zależy od @firma/ui@3.2.0
```

Co boli:

1. **Zmiana przekrojowa to kilka PR-ów w kilku repo.** Zmieniasz API przycisku w `design-system`: PR, review, publikacja wersji, potem PR w każdej aplikacji. Nie da się tego zrobić atomowo, więc przez jakiś czas część aplikacji jest zepsuta albo na starej wersji.
2. **Rozjazd wersji („dependency hell”).** Panel admina utknął na `ui@2.9.0`, bo nikt nie miał czasu na migrację. Po roku masz trzy wersje design systemu w produkcji.
3. **Duplikacja konfiguracji.** Każde repo ma własny ESLint, TS, CI, Prettier i każde po czasie wygląda trochę inaczej.
4. **Niewidoczny wpływ zmian.** Autor biblioteki nie widzi, kto jej używa i jak. Nie może uruchomić testów konsumentów przed publikacją.
5. **Narzut procesu publikacji**: wersjonowanie semantyczne, changelogi, rejestr npm, tokeny. Wszystko po to, żeby podzielić się kodem wewnątrz jednej firmy.

### Wariant B: monorepo (wszystko w jednym repo)

```
repo: firma/
  apps/panel-klienta
  apps/panel-admina
  apps/landing
  libs/ui
  libs/api-client
```

- Zmiana API przycisku i poprawki we **wszystkich** aplikacjach idą w **jednym PR**. CI testuje wszystko razem, więc zmiana jest atomowa.
- Biblioteki nie mają wersji. Wszyscy zawsze używają **aktualnego kodu z tego samego commita** („single version policy”).
- Jedna konfiguracja ESLint, TS i CI dla wszystkich.
- Widzisz wszystkich konsumentów biblioteki: wyszukiwanie w repo, graf zależności.
- Wspólny kod bez publikowania na npm.

### Anatomia jednej zmiany przekrojowej, krok po kroku

Zadanie: w komponencie `Button` z design systemu zmieniamy prop `type="primary"` na `variant="primary"`. To zmiana łamiąca (breaking change), bo stary prop przestaje działać. Przycisku używają trzy aplikacje.

#### W polyrepo

1. **Repo `design-system`:** zmieniasz `Button`, podbijasz wersję w `package.json` z `3.2.0` na `4.0.0`. Major, bo zmiana łamie API (semver). Piszesz changelog z instrukcją migracji. PR, review, merge.
2. **Publikacja:** CI albo ręcznie `npm publish` wypycha `@firma/ui@4.0.0` do rejestru npm (publicznego albo firmowego: GitHub Packages, Artifactory, Verdaccio).
3. **Repo `panel-klienta`:** osobny branch. Zmieniasz w `package.json` `"@firma/ui": "^3.1.0"` na `"^4.0.0"`, robisz `pnpm install` (zmienia się lockfile), poprawiasz wszystkie użycia `type=` na `variant=`. PR, review, CI, merge, deploy.
4. **Repo `panel-admina` i repo `landing`:** to samo jeszcze dwa razy. Często robią to inne zespoły, w innym sprincie albo wcale.

Kto podbija wersję w aplikacjach? Człowiek ręcznie albo bot (Renovate, Dependabot), który sam otwiera PR z podbiciem. **Bot podbija tylko numer.** Przy zmianie łamiącej CI aplikacji zrobi się czerwone i ktoś i tak musi ręcznie poprawić kod.

Skutki: 1 + 3 = 4 PR-y, 4 review, 1 publikacja. Przez dni albo tygodnie aplikacje działają na różnych wersjach design systemu. Autor zmiany w kroku 1 **nie wiedział**, czy nie zepsuje czegoś w aplikacjach, bo nie mógł uruchomić ich testów.

#### W monorepo

1. **Jeden branch:** zmieniasz `libs/ui/src/Button.tsx`.
2. **`pnpm nx affected -t typecheck`** od razu pokazuje wszystkie miejsca w trzech aplikacjach, gdzie jest jeszcze `type=`, bo TypeScript widzi kod całego repo. Poprawiasz je w tym samym branchu.
3. **Jeden PR** zawiera zmianę w bibliotece i poprawki we wszystkich konsumentach. CI (`nx affected -t lint test build e2e`) testuje bibliotekę i **wszystkie trzy aplikacje** na tym samym commicie.
4. **Merge.** Każda aplikacja, której dotyczy zmiana, jest wdrażana z tego samego commita.

**Numeru wersji biblioteki nikt nie podbija, bo biblioteka wersji nie ma.** Aplikacja zależy od niej przez `workspace:*`, czyli „zawsze kod z tego samego repo, z tego samego commita”. W CoinJar wygląda to tak (`apps/coinjar-web/package.json`):

```json
"dependencies": {
  "@coinjar/budget-feature-dashboard": "workspace:*",
  "@coinjar/shared-util": "workspace:*"
}
```

pnpm tworzy dowiązanie (symlink) z `node_modules/@coinjar/shared-util` do `libs/shared/util`. Nic nie jest publikowane ani pobierane z rejestru. Pole `"version": "0.0.1"` w `package.json` biblioteki jest wymagane przez format pliku, ale nie ma znaczenia i nikt go nie zmienia.

**A wersja samej aplikacji?** Aplikacji webowej zwykle nie numeruje się ręcznie. Jej wersją jest **commit SHA**, z którego została zbudowana. W CoinJar `VITE_APP_VERSION` bierze się z `VERCEL_GIT_COMMIT_SHA` i trafi do monitoringu, żeby błąd powiązać z konkretnym wdrożeniem. Jeśli ktoś potrzebuje wersji semver (np. aplikacja mobilna w sklepie albo biblioteka publikowana dla klientów spoza repo), robi to automatycznie narzędzie, a nie człowiek: w Nx `nx release`, w świecie Turborepo zwykle Changesets. Wersję wylicza się wtedy z Conventional Commits (`feat:` podbija minor, `fix:` patch, `BREAKING CHANGE` major) i generuje changelog.

#### Skąd wiadomo, kogo dotyczy zmiana

Nx liczy to z grafu. Prawdziwy wynik z CoinJar:

```bash
pnpm nx show projects --affected --files=libs/shared/util/src/lib/dates/month.ts
# shared-util, shared-domain, coinjar-web, coinjar-web-e2e

pnpm nx show projects --affected --files=libs/budget/feature-plan/src/lib/PlanPage.tsx
# budget-feature-plan, coinjar-web, coinjar-web-e2e
```

Zmiana w `shared-util` dotyka domeny, aplikacji i testów E2E, bo wszystkie od niej zależą. Zmiana w widoku planu nie dotyka pozostałych feature'ów, więc ich testy się nie uruchomią.

#### Druga strona medalu (argument seniora)

W monorepo **autor zmiany łamiącej musi poprawić wszystkich konsumentów w swoim PR**. Przy 3 aplikacjach to zaleta. Przy 40 bibliotekach należących do 8 zespołów jeden PR staje się ogromny i wymaga zgód od wielu właścicieli kodu (CODEOWNERS). Techniki na to:

- **Expand and contract:** najpierw dodajesz nowy prop `variant` obok starego `type` (oznaczonego jako `@deprecated`) i mergujesz. Potem migrujesz konsumentów w mniejszych PR-ach, a na końcu usuwasz `type`.
- **Migracja automatyczna:** generator Nx (rozdział 05), który sam przepisze `type=` na `variant=` w całym repo.
- **Feature flag**, gdy zmiana dotyczy zachowania, a nie tylko API.

---

## 2. Czym monorepo NIE jest

**Monorepo ≠ monolit.** To najczęstsze nieporozumienie.

- Google trzyma prawie cały kod w jednym repo, a wdraża tysiące niezależnych usług.
- Jedna aplikacja może być monolitem rozłożonym na kilka repo (np. rdzeń plus biblioteki w osobnych repo).

Monorepo to decyzja o **organizacji kodu i pracy zespołu**, a nie o architekturze uruchomieniowej.

---

## 3. Trzy niezależne osie

| Oś                       | Pytanie                           | Możliwe odpowiedzi                                                           |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| **Repozytorium**         | Gdzie leży kod?                   | monorepo / polyrepo                                                          |
| **Wdrożenie**            | Ile rzeczy wdrażam niezależnie?   | monolit (jedna) / rozproszone (mikroserwisy, micro-frontendy)                |
| **Struktura wewnętrzna** | Jak kod jest podzielony w środku? | modularna (twarde granice) / „big ball of mud” (wszystko importuje wszystko) |

Przykładowe kombinacje:

| Repozytorium | Wdrożenie   | Struktura     | Przykład                                                     |
| ------------ | ----------- | ------------- | ------------------------------------------------------------ |
| monorepo     | rozproszone | modularna     | Google, duże firmy z mikroserwisami w jednym repo            |
| polyrepo     | rozproszone | modularna     | klasyczne mikroserwisy, każdy w swoim repo                   |
| jedno repo   | monolit     | spaghetti     | typowa „stara” aplikacja we własnym repo, bez podziału       |
| jedno repo   | monolit     | modularna     | dobrze podzielona aplikacja (moduły pilnowane konwencją)     |
| monorepo     | rozproszone | spaghetti     | mikroserwisy, które importują sobie nawzajem wnętrzności     |
| **monorepo** | **monolit** | **modularna** | **CoinJar**: jedna aplikacja, wiele bibliotek Nx z granicami |

Uwaga: struktura (modularna czy spaghetti) **nie wynika** z repo ani z wdrożenia. Monolit w swoim repo może być porządnie podzielony, a mikroserwisy mogą być splątane (wtedy mówi się o „rozproszonym monolicie”, _distributed monolith_). Jedno repo z jedną aplikacją to nie jest właściwie „polyrepo”, tylko zwykłe repo. Polyrepo zaczyna się, gdy części jednego produktu leżą w wielu repo.

---

## 4. Monolit: dobre i złe słowo

„Monolit” brzmi źle, bo kojarzy się ze starym, splątanym kodem. Trzeba odróżnić dwa znaczenia:

- **Monolit wdrożeniowy**: jedna aplikacja, jeden build, jeden deploy. To **zaleta** przy małym i średnim zespole: prosto, tanio, bez komunikacji sieciowej między częściami, bez wersjonowania kontraktów.
- **„Big ball of mud”**: kod bez struktury, w którym wszystko zależy od wszystkiego. To jest właściwy problem. Każda zmiana grozi zepsuciem czegoś daleko, nikt nie rozumie całości, testy są wolne i kruche.

Branża przez lata leczyła drugi problem przez rozbijanie wdrożenia (mikroserwisy, micro-frontendy). To często było leczenie objawów: niezdyscyplinowany kod stawał się niezdyscyplinowanym systemem rozproszonym, a do tego dochodziły sieć, wersjonowanie i monitoring.

---

## 5. Modularny monolit

**Definicja:** aplikacja wdrażana jako jedna całość, ale podzielona wewnętrznie na moduły, które zachowują się jak osobne usługi:

1. **Wysoka spójność (cohesion):** moduł odpowiada za jeden obszar biznesowy (budżet, kategorie, rozliczenia).
2. **Luźne powiązania (coupling):** moduł zależy od innych tylko przez ich kontrakt.
3. **Publiczne API:** moduł udostępnia tylko to, co jawnie wystawi. Reszta jest prywatna.
4. **Granice wymuszane narzędziem, nie dobrą wolą:** import zza granicy kończy się błędem lintera albo builda, a nie komentarzem w code review.

**Po co:** masz korzyści podziału (zrozumiałość, równoległa praca zespołów, łatwe testy, możliwość wydzielenia modułu później) bez kosztów systemu rozproszonego.

**Najważniejszy argument na rozmowie:**

> „Zaczynam od modularnego monolitu. Jeśli jakiś moduł kiedyś naprawdę musi żyć osobno, bo ma inny zespół, inny cykl wydań albo inne wymagania skalowania, to czyste granice pozwalają go wydzielić bez przepisywania. Odwrotna droga, czyli sklejanie źle podzielonych mikroserwisów, jest dużo droższa.”

---

## 6. „Monolit wewnątrz monorepo”: jak to się łączy

Monorepo daje miejsce, a narzędzie (Nx) daje zasady. W praktyce:

- **Aplikacja** (`apps/coinjar-web`) to cienka warstwa, która składa moduły: routing, providery, layout. To jedyna rzecz, która jest wdrażana.
- **Biblioteki** (`libs/...`) to moduły. Nie są wdrażane osobno. Są kompilowane razem z aplikacją, ale każda jest osobnym projektem Nx z własnymi testami, lintem i tagami.
- **Nx pilnuje granic:** reguła `@nx/enforce-module-boundaries` sprawdza każdy import. W CoinJar `shared-ui` nie może zaimportować feature'a. Sprawdziliśmy to: lint zwraca błąd.

W jednym monorepo może też być **kilka aplikacji**, z których każda jest modularnym monolitem i które dzielą część bibliotek (np. wspólny design system i domena).

### Mapa na CoinJar

```
apps/coinjar-web                  ← jedyna jednostka wdrożenia (monolit)
libs/
  shared/   util, domain, ui      ← moduł współdzielony (scope:shared)
  budget/   data-access, state,   ← moduł biznesowy „budżet” (scope:budget)
            feature-*
```

- **`scope:*` (pion)** to moduły biznesowe. Kolejny obszar, np. `household`, dostałby własny scope.
- **`type:*` (poziom)** to warstwy wewnątrz modułu: `feature → ui / data-access / state → domain → util`.

### Przykład: co znaczy „granice wymuszone lintem”

**Zwykłe repo z folderami.** Masz aplikację z podziałem na foldery:

```
src/
  shared/ui/Button.tsx
  features/plan/PlanPage.tsx
```

Ktoś w pośpiechu potrzebuje w przycisku informacji o planie i dopisuje w `shared/ui/Button.tsx`:

```ts
import { usePlan } from '../../features/plan/usePlan';
```

To działa, kompiluje się i przechodzi testy. Nic tego nie zatrzyma. Podział na foldery jest tylko **konwencją**: „UI nie zależy od feature'ów” istnieje w dokumentacji albo w głowie autora. Po roku `shared/ui` zależy od połowy aplikacji, nie da się go przenieść ani przetestować osobno, a każda zmiana w feature'ach może zepsuć przyciski.

**Nx z tagami.** W CoinJar każda biblioteka ma tagi w `package.json`, np. `shared-ui` ma `type:ui`, a `budget-feature-dashboard` ma `type:feature`. Reguła `@nx/enforce-module-boundaries` w `eslint.config.mjs` zapisuje architekturę jako kod:

```js
{
  // UI components are domain-agnostic.
  sourceTag: 'type:ui',
  onlyDependOnLibsWithTags: ['type:util'],
},
```

Ten sam błąd popełniony w CoinJar:

```ts
// libs/shared/ui/src/Bad.tsx
import { DashboardPage } from '@coinjar/budget-feature-dashboard';
import { toMonthKey } from '../../util/src/lib/dates/month';
```

Prawdziwy wynik `eslint`:

```
1:1  error  A project tagged with "type:ui" can only depend on libs tagged with "type:util"              @nx/enforce-module-boundaries
2:1  error  Projects cannot be imported by a relative or absolute path, and must begin with a npm scope  @nx/enforce-module-boundaries
```

- **Błąd 1:** UI nie może zależeć od feature'a, bo narusza warstwy.
- **Błąd 2:** nawet dozwolonej zależności (`util`) nie wolno importować ścieżką względną do jej wnętrza. Trzeba przez publiczne API: `import { toMonthKey } from '@coinjar/shared-util'`.

Kod z takim importem **nie przejdzie**:

1. hooka `pre-commit` (lint-staged uruchamia ESLint na zmienionych plikach),
2. joba `quality` w CI (`nx affected -t lint`),
3. więc nie da się go zmergować, bo `quality` jest wymaganym checkiem na `main`.

„Wymuszone lintem” znaczy więc: **naruszenie architektury jest błędem kompilacji, a nie uwagą w code review.** Reviewer może być zmęczony albo się spieszyć, a linter nie.

Szczegóły tego mechanizmu są w rozdziale 04.

---

## 7. Monorepo z monolitem a monorepo z mikroserwisami

W obu przypadkach **repo jest takie samo**: jeden git, wspólne narzędzia, biblioteki współdzielone przez `workspace:*`, atomowe commity, `affected`. Różnica jest w tym, **co się dzieje po buildzie**: ile rzeczy powstaje, jak są wdrażane i jak ze sobą rozmawiają.

Najkrócej:

- **Monolit:** biblioteki są **wkompilowane w jedną aplikację**. Moduły rozmawiają przez **wywołanie funkcji** w tym samym procesie.
- **Mikroserwisy:** w repo jest **wiele aplikacji**, każda budowana i wdrażana osobno. Rozmawiają **przez sieć** (HTTP, gRPC, kolejka).

### CoinJar w obu wariantach

**Wariant A: monolit (tak jak teraz)**

```
repo coinjar/
  apps/coinjar-web            → 1 build → 1 bundle JS → 1 deploy (Vercel)
  libs/shared/domain          ─┐
  libs/budget/feature-plan     ├─ wkompilowane w bundle coinjar-web
  libs/budget/feature-dashboard┘
```

Pulpit liczy podsumowanie tak:

```ts
import { computeMonthlySummary } from '@coinjar/shared-domain';

const summary = computeMonthlySummary({
  month,
  today,
  categories,
  transactions,
  planEntries,
});
```

To zwykłe wywołanie funkcji: nanosekundy, zawsze działa, TypeScript sprawdza typy, a zmiana sygnatury od razu świeci się na czerwono we wszystkich miejscach użycia.

**Wariant B: mikroserwisy w tym samym repo**

```
repo coinjar/
  apps/web                    → build → deploy: Vercel
  apps/budget-api             → build → obraz Docker → deploy: AWS, 3 instancje
  apps/categories-api         → build → obraz Docker → deploy: AWS, 1 instancja
  libs/shared/domain          → wkompilowana osobno w KAŻDĄ z trzech aplikacji
```

Pulpit liczy podsumowanie tak:

```ts
const response = await fetch(
  'https://budget-api.coinjar.pl/summary?month=2026-09',
);
const summary = monthlySummarySchema.parse(await response.json());
```

A `budget-api`, żeby to policzyć, pyta `categories-api` o kategorie, znowu przez sieć.

### Co z tego wynika

|                                  | Monorepo + monolit                      | Monorepo + mikroserwisy                                            |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Ile rzeczy się wdraża            | 1                                       | tyle, ile serwisów                                                 |
| Komunikacja modułów              | wywołanie funkcji w procesie            | sieć: HTTP / gRPC / kolejka                                        |
| Opóźnienie i awarie komunikacji  | brak                                    | timeouty, retry, niedostępny serwis, częściowe awarie              |
| Zmiana kontraktu między modułami | kompilator łapie wszystko, jeden deploy | kompilator łapie typy, ale **wdrożenia nie są atomowe**            |
| Skalowanie                       | całość naraz                            | każdy serwis osobno                                                |
| Niezależność zespołów            | wspólny release                         | każdy zespół wdraża swój serwis, kiedy chce                        |
| Awaria jednego modułu            | może położyć całą aplikację             | reszta może działać dalej                                          |
| Infrastruktura                   | jeden hosting                           | wiele deployów, service discovery, monitoring rozproszony, tracing |
| Transakcje na danych             | jedna baza, zwykła transakcja           | dane rozproszone, sagi, spójność ostateczna                        |

### Najważniejsza rzecz: monorepo usuwa wersjonowanie paczek, ale nie wersjonowanie API

To jest odpowiedź na pytanie „co zostaje trudne w mikroserwisach, skoro są w monorepo”.

Przykład: zmieniamy pole kategorii z `order` na `position`.

- **Monolit:** jeden PR zmienia schemat i wszystkich konsumentów. Merge oznacza jeden deploy i **całość zmienia się w tej samej sekundzie**. Nie ma momentu, w którym stary kod rozmawia z nowym.
- **Mikroserwisy w monorepo:** kod też zmienia się w jednym PR, a CI testuje wszystko razem. Ale po merge'u serwisy wdrażają się **osobno i w różnym czasie**:
  1. `categories-api` jest już nowy i wysyła `position`,
  2. `budget-api` jest jeszcze stary (deploy trwa, 1 z 3 instancji jest już nowa) i szuka `order`,
  3. przez kilka minut produkcja jest zepsuta.

  Dlatego kontrakty między serwisami **muszą być wstecznie kompatybilne** mimo monorepo: najpierw wysyłasz oba pola, potem migrujesz konsumentów, na końcu usuwasz stare (expand and contract). Monorepo pomaga, bo widzisz wszystkich konsumentów i testujesz ich razem, ale **nie zrobi wdrożeń atomowymi**.

### Co monorepo daje w obu przypadkach

- jedno źródło typów i schematów (np. `shared-domain` z Zod) dla frontendu i backendu, więc kontrakt jest w kodzie, a nie w dokumentacji,
- atomowe zmiany **kodu** i testy wszystkich konsumentów w CI,
- `affected`: przy mikroserwisach Nx wie, które serwisy trzeba przebudować i wdrożyć. Zmiana w `categories-api` nie wdraża `budget-api`,
- wspólne narzędzia, konwencje i generatory.

### Odpowiednik na frontendzie: micro-frontendy

Na frontendzie odpowiednikiem mikroserwisów są **micro-frontendy**. W Nx robi się to przez **Module Federation**: aplikacja `host` (powłoka) ładuje w przeglądarce w czasie działania osobno wdrożone aplikacje `remote`, np. `plan` i `dashboard`, każda z własnym deployem. Problemy są te same: kontrakt w czasie działania, zgodność wersji współdzielonych bibliotek (np. React musi być jeden), niezależne wdrożenia. CoinJar świadomie tego nie robi (CLAUDE.md, sekcja 16.1).

### Kiedy który wariant

- **Monolit (modularny):** jeden zespół albo kilka zespołów przy jednym produkcie, jeden cykl wydań, brak potrzeby osobnego skalowania części. To domyślny wybór na start.
- **Mikroserwisy / micro-frontendy:** wiele zespołów, które muszą wdrażać niezależnie. Części o bardzo różnych wymaganiach skalowania albo niezawodności. Organizacja gotowa zapłacić za infrastrukturę i utrzymanie.

Monorepo pasuje do obu. Dobre granice w modularnym monolicie (tagi, publiczne API) sprawiają, że przejście z wariantu A do B jest możliwe bez przepisywania: moduł, który rozmawia z resztą tylko przez swój kontrakt, da się wyciągnąć do osobnej aplikacji.

## 8. Czy nie mogę po prostu mieć zwykłego repo?

**Szczera odpowiedź: dla samego CoinJar wystarczyłoby zwykłe repo z jedną aplikacją Vite.** Jest jedna aplikacja, jeden autor i nie ma nic do współdzielenia z innymi projektami.

Nx używamy z dwóch powodów:

1. **Nauka.** Klient pracuje na Nx.
2. **Nx to nie tylko „wiele aplikacji”.** To też sposób na **podzielenie jednej aplikacji na moduły z wymuszonymi granicami**. Zwykłe repo może mieć foldery `features/`, `shared/`, ale nic nie zabroni importu z `features/plan` w `shared/ui`. Po roku i pięciu osobach granice istnieją tylko w dokumentacji.

**Kiedy zwykłe repo (jeden projekt) wystarcza:**

- jedna aplikacja, mały zespół, krótki horyzont życia projektu,
- brak kodu współdzielonego z innymi projektami,
- architekturę da się utrzymać konwencją, bo wszyscy siedzą przy jednym stole.

**Kiedy monorepo (i narzędzie typu Nx) się opłaca:**

- kilka aplikacji albo pakietów współdzielących kod,
- kilka zespołów w jednym produkcie,
- częste zmiany przekrojowe (design system, klient API, domena),
- potrzeba wymuszenia architektury w dużym kodzie,
- długi horyzont życia projektu.

### Koszty monorepo (trzeba je znać, żeby brzmieć jak senior)

- **Bez narzędzia CI buduje i testuje wszystko przy każdej zmianie.** Dlatego istnieją Nx i Turborepo: cache i `affected` (rozdział 03).
- **Bez granic monorepo zamienia się w jeden wielki „big ball of mud”**, tylko większy.
- **Kontrola dostępu jest trudniejsza.** Każdy widzi cały kod. Pomaga CODEOWNERS (właściciele katalogów).
- **Rozmiar repo i czas `git clone`** w bardzo dużych organizacjach.
- **Single version policy boli przy aktualizacjach.** Podbicie Reacta dotyczy wszystkich naraz. Pomaga `nx migrate` (rozdział 07).

---

## 9. Co ma na myśli potencjalny klient

Zdanie: „Potrzebujemy sprawdzić wiedzę nt. Nx, bo w projekcie jest duża presja i tech lead potrzebuje solidnego seniora z wiedzą o modularnych monolitach, generatorach i umiejętności zwinnej pracy z AI”.

Moja interpretacja, bo nie znamy ich projektu:

| Fraza                | Co to prawdopodobnie znaczy                                                                     | Co chcą usłyszeć                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| „wiedza nt. Nx”      | Mają duże monorepo Nx: wiele bibliotek, być może kilka aplikacji.                               | Umiesz się w nim poruszać od pierwszego dnia: graf, targety, `affected`, cache, pluginy.                                                           |
| „duża presja”        | Terminy są napięte, a zespół prawdopodobnie rośnie.                                             | Dowieziesz szybko, **nie psując architektury**. Wiesz, kiedy skrót jest akceptowalny, a kiedy stworzy dług, który ich zatopi.                      |
| „solidny senior”     | Nie będzie czasu na prowadzenie za rękę.                                                        | Podejmujesz decyzje sam i uzasadniasz je kompromisami (trade-offs). Pomagasz innym.                                                                |
| „modularne monolity” | Ich frontend to prawdopodobnie jedna albo kilka dużych aplikacji podzielonych na biblioteki Nx. | Umiesz projektować granice modułów i pilnować ich narzędziami. Nie proponujesz odruchowo micro-frontendów. Wiesz, kiedy wydzielić moduł.           |
| „generatory”         | Mają albo chcą mieć własne generatory, żeby zespół pod presją tworzył spójny kod.               | Pisałeś własne generatory Nx, rozumiesz `Tree`, szablony i testy, i widzisz w nich narzędzie do skalowania zespołu.                                |
| „zwinna praca z AI”  | Używają Copilota, Claude'a albo Cursora i liczą na to przyspieszenie.                           | Jesteś produktywny z AI, ale **bezpieczny**: dajesz kontekst (reguły w repo), weryfikujesz wynik (testy, lint, review), łączysz AI z generatorami. |

**Podsumowanie oczekiwań:** szukają osoby, która przy presji czasu utrzyma porządek w dużym repo Nx i podniesie produktywność zespołu przez automatyzację (generatory, AI), a nie tylko przez własne szybkie pisanie kodu.

---

## 10. Jak to powiedzieć na rozmowie (gotowe zdania)

- „Monorepo to decyzja o organizacji kodu, a monolit o wdrożeniu. Są niezależne.”
- „Modularny monolit daje granice jak w mikroserwisach, ale bez kosztów sieci i wersjonowania kontraktów.”
- „Granice muszą być wymuszane narzędziem. W Nx robię to tagami i regułą `enforce-module-boundaries`, więc łamanie architektury failuje CI, a nie czeka na czujność reviewera.”
- „Monorepo bez narzędzia jest wolne i się rozpada. Nx rozwiązuje oba problemy: `affected` i cache na szybkość, granice modułów na porządek.”

---

## Pytania kontrolne

1. Wymień trzy problemy polyrepo, które rozwiązuje monorepo.
2. Czym różni się monorepo od monolitu? Podaj przykład monorepo, które nie jest monolitem.
3. Co to jest „big ball of mud” i czemu mikroserwisy go nie leczą?
4. Wymień cztery cechy modułu w modularnym monolicie.
5. Kiedy zwykłe repo z jedną aplikacją jest lepszym wyborem niż monorepo?
6. Jakie są koszty monorepo i jak Nx je ogranicza?
7. W CoinJar: co jest jednostką wdrożenia, co jest modułem, a co warstwą?
8. Opisz krok po kroku zmianę łamiącą API biblioteki w polyrepo i w monorepo. Kto i kiedy podbija wersje?
9. Co oznacza `workspace:*` i czym jest „wersja” aplikacji webowej w monorepo?
10. Jak przeprowadzić zmianę łamiącą w dużym monorepo z wieloma zespołami (expand and contract)?
11. Czym różni się granica „z konwencji” od granicy „wymuszonej lintem”? Pokaż na przykładzie importu.
12. Czym różni się monorepo z monolitem od monorepo z mikroserwisami? Co zostaje trudne w mikroserwisach mimo monorepo?
13. Dlaczego wdrożenia mikroserwisów nie są atomowe i jak z tym żyć?
