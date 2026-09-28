# 04. Granice modułów w Nx: tagi, `depConstraints`, publiczne API

## TL;DR

- **Tag** to etykieta na projekcie (`nx.tags` w `package.json`), np. `scope:budget`, `type:feature`. Same tagi nic nie egzekwują — to tylko dane.
- **`depConstraints`** w regule `@nx/enforce-module-boundaries` (ESLint) to zestaw zdań „projekt z tagiem X może importować tylko projekty z tagami Y”. To one faktycznie failują lint, gdy ktoś złamie architekturę.
- W CoinJar są **dwie niezależne rodziny tagów** naraz: `type:*` (warstwa: `feature → data-access/state/ui → domain → util`) i `scope:*` (moduł biznesowy: `shared`, `budget`, `app`). Import musi przejść **obie** reguły, nie jedną.
- **Druga, niezależna warstwa egzekwowania** (często pomijana w rozmowach o Nx): `package.json` każdej biblioteki ma pole `exports` z tylko `"."` i `"./package.json"`. Przy `moduleResolution: "nodenext"` deep import do wnętrza biblioteki **nie tylko jest błędem lintera — on się w ogóle nie rozwiąże jako moduł**. Publiczne API jest wymuszone przez sam TypeScript/Node, zanim ESLint w ogóle wejdzie do gry.
- To, co jeszcze **nie jest** skonfigurowane w CoinJar (świadomie odłożone do milestone 3, CLAUDE.md sekcja 16.2): `bannedExternalImports`, generator pilnujący tagów automatycznie, ADR 0001. Dobry temat do pokazania, że rozróżniasz „mamy podstawy” od „mamy pełny system”.

---

## 1. Tag to tylko dane — reguła robi robotę

Realny tag na projekcie (`libs/shared/util/package.json`):

```json
"nx": {
  "name": "shared-util",
  "tags": ["scope:shared", "type:util"]
}
```

Sam ten wpis **nic nie blokuje**. Gdyby w repo nie było reguły ESLint, która czyta tagi, `shared-util` mógłby zaimportować cokolwiek i nic by nie zaprotestowało — tag byłby czystą dokumentacją, dokładnie tak samo bezsilną jak komentarz albo nazwa folderu (rozdział 01, sekcja 6, przykład „zwykłe repo z folderami”). Tagi zaczynają coś znaczyć dopiero w połączeniu z `depConstraints`.

**Skąd biorą się tagi w CoinJar:** ręcznie, w `package.json` każdej biblioteki, przy jej tworzeniu. W milestone 3 (generator `library`, rozdział 05) ten krok ma się zautomatyzować — generator sam wpisze poprawne tagi na podstawie ścieżki i typu, żeby nikt nie mógł o tym zapomnieć ani pomylić się w nazwie.

---

## 2. Dwie niezależne rodziny tagów

CLAUDE.md (sekcja 16.1) nazywa to wprost: „moduł = scope, warstwa = type”. W CoinJar, realnie:

| Tag                | Znaczenie                                          | Projekty (realne)                                        |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| `scope:shared`     | kod współdzielony, niezależny od domeny biznesowej | `shared-util`, `shared-domain`, `shared-ui`              |
| `scope:budget`     | moduł biznesowy „budżet”                           | `budget-data-access`, `budget-state`, `budget-feature-*` |
| `scope:app`        | sama aplikacja (powłoka)                           | `coinjar-web`                                            |
| `type:util`        | funkcje czyste, zero zależności od reszty          | `shared-util`                                            |
| `type:domain`      | schematy Zod + typy domenowe                       | `shared-domain`                                          |
| `type:ui`          | komponenty MUI, bez wiedzy o domenie               | `shared-ui`                                              |
| `type:data-access` | klient API, query hooki                            | `budget-data-access`                                     |
| `type:state`       | store'y Zustand (stan UI)                          | `budget-state`                                           |
| `type:feature`     | widok/funkcjonalność                               | `budget-feature-dashboard` i pozostałe                   |
| `type:app`         | aplikacja composująca wszystko                     | `coinjar-web`                                            |

`scope:*` to **pion** (który obszar biznesowy), `type:*` to **poziom** (która warstwa wewnątrz obszaru). Jeden projekt ma zawsze **po jednym tagu z każdej rodziny** (potwierdzone w każdym realnym `package.json` z tabeli powyżej — zawsze dokładnie dwa tagi).

---

## 3. `depConstraints`: pełna, realna reguła z CoinJar

Cały `depConstraints` z `eslint.config.mjs` (bez skrótów):

```js
depConstraints: [
  // --- warstwy (type:*) ---
  {
    sourceTag: 'type:app',
    onlyDependOnLibsWithTags: [
      'type:feature', 'type:ui', 'type:util',
      'type:domain', 'type:data-access', 'type:state',
    ],
  },
  {
    // A feature never imports another feature.
    sourceTag: 'type:feature',
    onlyDependOnLibsWithTags: [
      'type:ui', 'type:util', 'type:domain', 'type:data-access', 'type:state',
    ],
  },
  { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  { sourceTag: 'type:state', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  {
    // UI components are domain-agnostic.
    sourceTag: 'type:ui',
    onlyDependOnLibsWithTags: ['type:util'],
  },
  { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:util'] },
  { sourceTag: 'type:util', onlyDependOnLibsWithTags: [] },

  // --- moduły biznesowe (scope:*) ---
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:budget', onlyDependOnLibsWithTags: ['scope:budget', 'scope:shared'] },
],
```

Czytaj to jako **dwie osobne tabele reguł, sprawdzane niezależnie**:

- **Warstwy:** `type:util` nie może zależeć od niczego z workspace'u (liście grafu). `type:domain` tylko od `util`. `type:ui` tylko od `util` (nie od `domain` — komponenty są domenowo-agnostyczne, komentarz w kodzie to potwierdza). `type:data-access`/`type:state` od `domain`+`util`. `type:feature` od wszystkiego poniżej, **ale nigdy od innego feature'a** — stąd komentarz `// A feature never imports another feature`. `type:app` (czyli `coinjar-web`) od wszystkiego.
- **Scope'y:** `scope:shared` **tylko od `scope:shared`** — to jest reguła, która pilnuje, żeby `shared-ui` czy `shared-util` nigdy nie uzależniły się od konkretnego modułu biznesowego. `scope:budget` może od siebie i od `scope:shared` (bo budget ma prawo korzystać ze wspólnego kodu), ale nie ma tu wpisu dla `scope:app` — więc **nic** nie może zależeć od `scope:app` (aplikacja jest zawsze liściem grafu, nikt jej nie importuje, co ma sens: to jednostka wdrożenia, nie biblioteka).

**Ważne, bo często mylone na rozmowie:** import musi przejść **obie** tabele naraz. `budget-feature-dashboard` (tagi: `scope:budget`, `type:feature`) importujący `shared-ui` (tagi: `scope:shared`, `type:ui`) — sprawdzane są **dwie** pary reguł: `type:feature → type:ui` (OK, dozwolone) **i** `scope:budget → scope:shared` (OK, dozwolone). Gdyby choć jedna z dwóch tabel powiedziała „nie”, import by nie przeszedł.

---

## 4. Anatomia błędu: dwie reguły naraz

Rozdział 01 (sekcja 6) pokazał jeden błąd (`type:ui` importujące `type:feature`). Tu ten sam przykład, ale pokazany pod kątem **obu rodzin tagów naraz**, żeby było widać, że to dwa niezależne mechanizmy:

```ts
// libs/shared/ui/src/Bad.tsx  (tagi: scope:shared, type:ui)
import { DashboardPage } from '@coinjar/budget-feature-dashboard'; // tagi: scope:budget, type:feature
```

Ten jeden import łamie **dwie oddzielne reguły `depConstraints`** jednocześnie:

1. `type:ui` → `onlyDependOnLibsWithTags: ['type:util']`, a `budget-feature-dashboard` ma `type:feature` → naruszenie warstwy.
2. `scope:shared` → `onlyDependOnLibsWithTags: ['scope:shared']`, a `budget-feature-dashboard` ma `scope:budget` → naruszenie modułu biznesowego.

ESLint zgłasza **oba** naruszenia osobno (jeden import, dwa błędy), bo `depConstraints` jest listą sprawdzaną w całości, nie „pierwsze pasujące wygrywa”. To dobry dowód na rozmowę, że rozumiesz, iż `type:*` i `scope:*` to **dwie ortogonalne osie kontroli**, nie jeden system z dwoma rodzajami etykiet.

---

## 5. Inne opcje reguły: `enforceBuildableLibDependency` i `allow`

Poza `depConstraints`, realna konfiguracja ma:

```js
'@nx/enforce-module-boundaries': [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
    depConstraints: [ /* ... */ ],
  },
],
```

- **`enforceBuildableLibDependency: true`** — gdyby w repo istniały biblioteki „buildowalne” (z własnym krokiem kompilacji, publikowane niezależnie) obok zwykłych, ta opcja pilnuje, żeby buildowalna biblioteka nie zależała od niebuildowalnej (bo wtedy jej build by się wysypał). W CoinJar wszystkie biblioteki są kompilowane razem z aplikacją (rozdział 01, sekcja 7 — „monolit: biblioteki wkompilowane w jedną aplikację”), więc to głównie zabezpieczenie na przyszłość.
- **`allow`** — lista wzorców ścieżek **zwolnionych** z reguły. Wzorzec `^.*/eslint(\.base)?\.config\.[cm]?[jt]s$` dopuszcza, żeby pliki `eslint.config.mjs` per-projekt mogły importować bazowy config spoza swoich granic — to plik narzędziowy, nie kod aplikacji, więc nie powinien podlegać `depConstraints`.

---

## 6. Druga warstwa: publiczne API wymuszone przez `exports`, nie tylko przez lint

To jest szczegół, który odróżnia „znam Nx z dokumentacji” od „czytałem realny config”. Każda biblioteka ma w `package.json`:

```json
{
  "name": "@coinjar/shared-domain",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./package.json": "./package.json"
  }
}
```

Pole `exports` to standard Node.js (nie coś specyficznego dla Nx): **jedyne ścieżki, które wolno zaimportować z tego pakietu, to `.` (czyli `@coinjar/shared-domain`) i `./package.json`.** Nic więcej. W połączeniu z `tsconfig.base.json`:

```json
{ "module": "nodenext", "moduleResolution": "nodenext" }
```

TypeScript **rozwiązuje moduły dokładnie tak, jak zrobiłby to Node.js w runtime** — czyta `exports` i, jeśli ścieżka nie jest tam wymieniona, **traktuje ją jako nieistniejącą**, niezależnie od tego, czy plik fizycznie istnieje na dysku. Efekt praktyczny:

```ts
// Nie przejdzie ESLint (enforce-module-boundaries — import musi zaczynać się od npm scope, nie ścieżki względnej).
import { toGrosze } from '../../../shared/util/src/lib/money/money';

// Przejdzie ESLint (import przez publiczne API)... ale i tak nie zadziała,
// jeśli funkcja nie jest wyeksportowana z libs/shared/util/src/index.ts —
// TypeScript zgłosi błąd kompilacji "has no exported member", bo modul
// resolution w ogóle nie widzi niczego poza tym, co jest w polu "exports".
import { toGrosze } from '@coinjar/shared-util';
```

**Dlaczego to ważne na rozmowie:** granica modułu w CoinJar nie stoi na jednej nodze. Nawet gdyby ktoś wyłączył albo obszedł regułę ESLint (np. `eslint-disable` w PR-cie, które prześlizgnie się przez review), **sama konfiguracja TypeScript/Node nadal nie pozwoli zaimportować niczego spoza `index.ts`** biblioteki. To dwie niezależne bariery: lint (`enforce-module-boundaries`, łapie zły _kierunek_ zależności między tagami) i module resolution (`exports`, łapie _głębokie_ importy do wnętrza dozwolonej zależności).

---

## 7. Czego jeszcze nie ma (świadomy stan, nie przeoczenie)

CLAUDE.md (sekcja 16.2, milestone 3) wprost planuje, a CoinJar **jeszcze nie ma**:

- **`bannedExternalImports`** — opcja `enforce-module-boundaries` blokująca importy konkretnych paczek npm z określonych warstw (np. „`type:ui` nie może zaimportować `@tanstack/react-query` bezpośrednio, bo server state ma iść przez `data-access`”). Dziś tej reguły nie ma — nic nie stoi na przeszkodzie, żeby `shared-ui` zaimportowało dowolną paczkę zewnętrzną.
- **Generator `library`** pilnujący tagów automatycznie, żeby nikt nie założył biblioteki z błędnym albo brakującym tagiem ręcznie (rozdział 05).
- **ADR 0001** („modularny monolit z Nx”) — decyzja architektoniczna jest w CLAUDE.md, ale nie ma jeszcze sformalizowanego zapisu w `docs/adr/`.

To dobry wzorzec odpowiedzi na rozmowie: „mechanizm bazowy (tagi + `depConstraints` + publiczne API przez `exports`) już egzekwuje architekturę realnie, w CI. To, co dokładam później, to węższe reguły (`bannedExternalImports`) i automatyzację tworzenia zgodnych z konwencją bibliotek (generator), nie fundament.”

---

## 8. Jak to powiedzieć na rozmowie (gotowe zdania)

- „Tagi same w sobie nic nie robią — to `depConstraints` w `@nx/enforce-module-boundaries` faktycznie failuje lint. Tag bez reguły to komentarz.”
- „W CoinJar są dwie niezależne osie: `type:*` (warstwa) i `scope:*` (moduł biznesowy). Import musi przejść obie tabele reguł naraz — złamanie jednej wystarczy, żeby lint failował.”
- „Granica modułu w CoinJar nie stoi tylko na ESLint. Pole `exports` w `package.json` biblioteki, razem z `moduleResolution: nodenext`, sprawia, że deep import do wnętrza biblioteki nie rozwiąże się jako moduł na poziomie TypeScript/Node — to druga, niezależna bariera.”
- „Zawsze rozróżniam mechanizm bazowy od pełnego systemu: dziś mamy `depConstraints` i publiczne API wymuszone przez `exports`; `bannedExternalImports` i generator pilnujący tagów są zaplanowane, ale jeszcze nie zaimplementowane — to świadomy, nazwany stan, nie dziura, o której nie wiem.”

---

## Pytania kontrolne

1. Czym różni się tag od reguły `depConstraints`? Co się stanie, jeśli projekt ma tag, ale nie ma żadnej pasującej reguły?
2. Wymień dwie niezależne rodziny tagów w CoinJar i wyjaśnij, dlaczego jeden import musi przejść obie naraz.
3. Pokaż na przykładzie importu `shared-ui → budget-feature-dashboard`, które dwie reguły `depConstraints` łamie ten import i dlaczego.
4. Dlaczego `type:feature` nie może zależeć od innego `type:feature`? Jak to jest wymuszone w konfiguracji?
5. Co robi opcja `enforceBuildableLibDependency` i dlaczego w CoinJar ma dziś ograniczone znaczenie?
6. Do czego służy pole `allow` w konfiguracji `enforce-module-boundaries`? Podaj realny wzorzec z CoinJar i uzasadnij wyjątek.
7. Opisz, jak pole `exports` w `package.json` biblioteki wymusza publiczne API na poziomie TypeScript/Node, niezależnie od ESLint.
8. Podaj przykład importu, który przejdzie regułę ESLint (dobry scope/kierunek), ale mimo to nie skompiluje się z powodu `exports`.
9. Jakie trzy elementy z sekcji 16.2 CLAUDE.md są zaplanowane, ale jeszcze nie zaimplementowane w CoinJar?
10. Dlaczego `scope:shared` może zależeć tylko od `scope:shared`, a nie ma analogicznego wpisu dla `scope:app`? Co to oznacza dla grafu zależności?

---

## Odpowiedzi (skrót)

1. Tag to etykieta bez żadnej mocy sprawczej — czysta dana. Jeśli nie ma reguły `depConstraints` pasującej do jego tagu, projekt może importować cokolwiek bez żadnego ostrzeżenia lintera.
2. `type:*` (warstwa: `feature → data-access/state/ui → domain → util`) i `scope:*` (moduł biznesowy: `shared`, `budget`, `app`). Import musi przejść obie tabele reguł naraz — to dwie niezależne, sprawdzane osobno osie kontroli.
3. Łamie dwie reguły: `type:ui → onlyDependOnLibsWithTags: ['type:util']` (a `budget-feature-dashboard` ma `type:feature` — naruszenie warstwy) i `scope:shared → onlyDependOnLibsWithTags: ['scope:shared']` (a ten projekt ma `scope:budget` — naruszenie modułu biznesowego). ESLint zgłasza oba błędy osobno dla jednego importu.
4. Bo `type:feature` w `onlyDependOnLibsWithTags` nigdy nie zawiera `type:feature` — komentarz w kodzie (`// A feature never imports another feature`) to potwierdza. Wymuszone wprost przez brak tego tagu na liście dozwolonych.
5. Pilnuje, żeby biblioteka „buildowalna" (z własnym krokiem kompilacji, publikowana niezależnie) nie zależała od niebuildowalnej. W CoinJar wszystkie biblioteki są kompilowane razem z aplikacją (jeden monolit wdrożeniowy), więc to głównie zabezpieczenie na przyszłość, nie realnie wykorzystywany dziś mechanizm.
6. Lista wzorców ścieżek zwolnionych z reguły. Realny wzorzec: `^.*/eslint(\.base)?\.config\.[cm]?[jt]s$` — dopuszcza, żeby per-projektowe `eslint.config.mjs` importowały bazowy config spoza swoich granic, bo to plik narzędziowy, nie kod aplikacji.
7. Pole `exports` w `package.json` biblioteki wymienia tylko `.` i `./package.json` jako dostępne ścieżki. Przy `moduleResolution: "nodenext"` TypeScript rozwiązuje moduły tak jak zrobiłby to Node w runtime — ścieżka spoza `exports` jest traktowana jako nieistniejąca, niezależnie od tego, czy plik fizycznie jest na dysku.
8. Import przez `@coinjar/shared-util` (dobry kierunek, przejdzie `enforce-module-boundaries`), ale odwołujący się do funkcji niewyeksportowanej z `libs/shared/util/src/index.ts` — nie skompiluje się, bo TypeScript w ogóle nie widzi niczego poza tym, co jest w `exports`.
9. `bannedExternalImports`, generator `library` pilnujący tagów automatycznie, ADR 0001 w `docs/adr/`.
10. Bo `scope:app` (czyli `coinjar-web`) jest zawsze liściem grafu — jest jednostką wdrożenia, nikt jej nie importuje jako biblioteki. Brak wpisu oznacza: nic nie ma prawa zależeć od `scope:app`, co odzwierciedla, że aplikacja składa moduły, a nie odwrotnie.
