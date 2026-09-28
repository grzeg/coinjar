# 07. Nx w dużej organizacji: `nx migrate`, CODEOWNERS, zdalny cache, migracja z Turborepo

> **Uwaga o skali:** CoinJar to jednoosobowy projekt nauki, bez CODEOWNERS, bez Renovate/Dependabot, bez wielu zespołów (sprawdzone: żaden z tych plików nie istnieje w repo — i słusznie, na tę skalę są zbędne). Ten rozdział opisuje, co zmienia się, gdy to samo repo rośnie do wielu zespołów — wiedza pod rozmowę, nie coś do wdrożenia w CoinJar. Rozdział 01 (sekcja 1, „druga strona medalu") i sekcja 8 już zasygnalizowały część tych tematów; tu je rozwijamy.

## TL;DR

- **`nx migrate`** automatyzuje bolesną część podbijania wspólnej zależności w monorepo (rozdział 01, sekcja 8: „single version policy boli"): nie tylko `package.json`, ale też **codemod na Twoim kodzie**, dostarczony przez autorów paczki.
- **CODEOWNERS** to mechanizm GitHuba (nie Nx), który w połączeniu z tagami z rozdziału 04 rozwiązuje realny problem: kto musi zaakceptować PR, gdy zmiana dotyka wielu bibliotek naraz.
- **Zdalny cache w dużej skali** to nie tylko „pobierz gotowy wynik" (rozdział 03) — Nx Cloud potrafi też **rozproszyć** wykonanie zadań affected na wiele maszyn naraz (dystrybucja, nie tylko cache). To różne mechanizmy, często mylone.
- **Migracja z Turborepo na Nx w dużym repo** nie jest operacją „wszystko albo nic". Robi się ją przyrostowo: oba narzędzia działają obok siebie przez jakiś czas, `pnpm-workspace.yaml` w ogóle się nie zmienia (rozdział 02, sekcja 9 — to jest tylko warstwa orkiestracji zadań).

---

## 1. Co realnie zmienia się przy skali

CoinJar ma dwunastu-kilkanaście projektów, jednego autora, jeden zespół (jedną osobę). Duża organizacja z tym samym stackiem różni się w praktyce w czterech miejscach:

1. **Wiele zespołów, jeden graf.** Zmiana w bibliotece może dotknąć kodu, którego autor zmiany nigdy nie widział na oczy — i którego zespół nie wie, że jego kod się zmienił, dopóki CI nie da czerwonego światła.
2. **CI kosztuje realne pieniądze i czas w większej skali.** Setki projektów × kilka targetów = tysiące zadań na jeden PR bez dobrego cache/dystrybucji.
3. **Aktualizacje frameworków dotyczą wszystkich naraz** (rozdział 01, sekcja 8) — nie da się „zaktualizować Reacta tylko dla mojego zespołu".
4. **Migracja narzędzi (np. z Turborepo na Nx) dzieje się na żywym organizmie** — nie ma okna czasowego, w którym cała organizacja przestaje commitować.

Każdy z tych punktów ma konkretny mechanizm odpowiedzi, opisany niżej.

---

## 2. `nx migrate`: mechanika krok po kroku

Rozdział 05 (sekcja 8) wprowadził różnicę generator/migracja. Tu mechanika:

```bash
pnpm nx migrate latest
```

Ta komenda **nie zmienia jeszcze Twojego kodu**. Robi dwie rzeczy:

1. Podbija wersje paczek `@nx/*`/`nx` w `package.json` do najnowszych (albo do wskazanej wersji: `nx migrate 23.5.0`).
2. Generuje plik `migrations.json` w katalogu roota — listę migracji do wykonania, zebranych z `migrations.json` **każdej** paczki `@nx/*`, która deklaruje migrację dla przedziału wersji, przez który właśnie przechodzisz.

Przykładowy (ilustracyjny) wpis w wygenerowanym `migrations.json`:

```json
{
  "migrations": [
    {
      "version": "23.4.0",
      "description": "Update vite config to new plugin API",
      "package": "@nx/vite",
      "name": "update-vite-plugin-config"
    }
  ]
}
```

Następnie:

```bash
pnpm install                       # zainstaluj nowe wersje z package.json
pnpm nx migrate --run-migrations   # uruchom zebrane migracje po kolei
```

Każda migracja to **generator** w rozumieniu rozdziału 05 — dostaje `Tree`, czyta istniejące pliki (np. `vite.config.ts` każdego projektu), i **przepisuje je** pod nowe API. Po przebiegnięciu wszystkich migracji `migrations.json` można usunąć (zrobił swoje) — commitujesz wynik jak każdą inną zmianę, z code review.

**Dlaczego to nie jest to samo co Renovate/Dependabot.** Bot podbija tylko numer w `package.json` (rozdział 01, sekcja 1). Jeśli nowa wersja ma breaking change w API, bot da czerwone CI i tyle — ktoś musi ręcznie poprawić kod. `nx migrate` **dostarcza kod, który to naprawia**, bo autorzy paczki napisali migrację razem ze zmianą API. To działa tylko dla paczek, które **same** publikują migracje (ekosystem `@nx/*`, część innych narzędzi) — zwykłej zależności npm bez migracji `nx migrate` nie naprawi.

**W dużej organizacji** to jest różnica między „aktualizacja frameworka to tygodniowy projekt każdego zespołu z osobna" a „aktualizacja to jeden PR, który przechodzi CI, bo automatyczny codemod już zrobił 90% roboty, a 10% (przypadki niestandardowe) poprawia się ręcznie."

---

## 3. CODEOWNERS: kto musi zatwierdzić zmianę

CODEOWNERS to plik `.github/CODEOWNERS` — mechanizm **GitHuba**, nie Nx. Mapuje ścieżki na osoby/zespoły, które muszą zatwierdzić PR dotykający tych ścieżek (przy włączonym „Require review from Code Owners" w ustawieniach ochrony brancha).

Naturalne powiązanie z tagami z rozdziału 04: struktura katalogów **już** odzwierciedla `scope:*`, więc CODEOWNERS pisze się niemal automatycznie z tej samej struktury:

```
# .github/CODEOWNERS (ilustracyjne, nie ma tego pliku w CoinJar)
/libs/shared/          @platform-team
/libs/budget/          @budget-team
/apps/coinjar-web/     @budget-team @platform-team
```

**Problem, który to rozwiązuje**, wprost z rozdziału 01 (sekcja 1, „druga strona medalu"): w monorepo autor zmiany łamiącej poprawia wszystkich konsumentów w swoim PR-cie. Przy 3 aplikacjach jednego zespołu to zaleta. Przy 40 bibliotekach należących do 8 zespołów — PR dotykający wspólnej biblioteki **automatycznie wymaga zatwierdzenia od każdego zespołu, którego kod PR modyfikuje**. CODEOWNERS sprawia, że to wymaganie jest **wymuszone przez GitHuba**, a nie zależy od tego, czy ktoś pamiętał, żeby kogoś dodać do review.

**Kompromis, o którym warto wspomnieć:** to samo mechanizm, który chroni, może zablokować pracę — PR, który dotyka 6 bibliotek, potrzebuje 6 zatwierdzeń, zanim cokolwiek się zmerguje. Techniki łagodzące to te same z rozdziału 01 (sekcja 1): **expand and contract** (mniejsze, osobne PR-y zamiast jednego dużego) i **migracja automatyczna przez generator** (rozdział 05), która robi mechaniczną część zmiany bez angażowania człowieka z każdego zespołu do review samego przepisania importu.

---

## 4. Zdalny cache w skali: cache to nie to samo co dystrybucja

Rozdział 03 opisał zdalny cache jako „pobierz gotowy wynik zamiast go liczyć". To rozwiązuje problem **powtarzalności** (ktoś już to policzył). Nie rozwiązuje problemu **równoległości w jednym uruchomieniu CI**: jeśli `affected` zwraca 200 projektów do przetestowania, a masz jeden runner CI, i tak czekasz, aż przejdzie 200 zadań po kolei (czy sekwencyjnie, czy z ograniczoną równoległością na jednej maszynie).

**Dystrybucja zadań** (Nx Cloud określa to jako agenty / distributed task execution) to inny mechanizm: zamiast jednego runnera CI wykonującego wszystkie affected zadania, **wiele runnerów CI** (agentów) dostaje **fragment** grafu zadań do wykonania równolegle, a Nx Cloud spina wyniki w jeden raport. To jest odpowiedź na pytanie „mam 200 affected zadań i chcę wynik w 3 minuty, nie w 40" — cache tego nie da, jeśli nic wcześniej nie było policzone (np. pierwszy PR po dużym refaktorze, gdzie prawie wszystko jest „affected" i nic nie trafia w cache).

**Rozróżnienie, które warto umieć nazwać na rozmowie:**

| Mechanizm              | Pytanie, na które odpowiada                       | Pomaga, gdy                                                          |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Cache (lokalny/zdalny) | „czy to już było policzone?"                      | dużo powtarzalności między uruchomieniami                            |
| Dystrybucja (agenty)   | „jak podzielić dużo pracy na wiele maszyn naraz?" | dużo affected zadań w jednym przebiegu, mało wspólnego z poprzednimi |

CoinJar dziś nie potrzebuje dystrybucji (kilkanaście projektów, jeden runner wystarcza z zapasem) — to mechanizm, który zaczyna się opłacać przy setkach projektów i CI trwającym kwadranse. Ten obszar narzędzi zmienia się szybko (nazwy funkcji, sposób konfiguracji) — przed rozmową warto sprawdzić aktualną dokumentację Nx Cloud, żeby nie operować nazwami z przestarzałej wersji.

---

## 5. Migracja z Turborepo na Nx w dużym, żywym repo

To dokładnie punkt z rozdziału 02 (tabela porównawcza), rozwinięty pod kątem „jak to zrobić bez zatrzymywania pracy zespołów".

### Krok 0: workspace się nie rusza

`pnpm-workspace.yaml` (albo `npm`/`yarn` workspaces) zostaje **identyczny**. To jest ta sama warstwa co przed migracją — Nx i Turborepo to dwie różne nakładki orkiestracji na ten sam, niezmieniony sposób trzymania paczek w repo (rozdział 02, sekcja 9, ostatni wiersz tabeli).

### Krok 1: `nx init` obok istniejącego `turbo.json`

```bash
npx nx@latest init
```

Dodaje `nx.json` i podstawowe pluginy (analogiczne do `@nx/vite`, `@nx/eslint` z rozdziału 02), **nie usuwając** `turbo.json`. Przez pewien czas oba narzędzia współistnieją: część zespołów/CI woła `turbo run ...`, część eksperymentuje z `nx ...` na tych samych projektach. To jest bezpieczne, bo obie komendy tylko **czytają** graf i uruchamiają te same, niezmienione skrypty (`vite build`, `vitest`, `eslint`) — żadne z narzędzi nie modyfikuje kodu aplikacji.

### Krok 2: przenoszenie targetów po jednym

Zamiast przepisywać cały `turbo.json` naraz, sprawdza się (per projekt albo per typ projektu), czy inferowany target Nx (rozdział 02, sekcja 3) daje ten sam efekt co wpis w `turbo.json`. Jeśli tak — `dependsOn`/`inputs`/`outputs` można świadomie przenieść do `targetDefaults` w `nx.json`, żeby zachować identyczne zachowanie cache co poprzednio.

### Krok 3: migracja CI

CI (podobnie jak realny workflow CoinJar z rozdziału 03) przełącza się z `turbo run ... --filter=...[ref]` na `nx affected -t ...` **projekt po projekcie albo pipeline po pipeline**, nie w jednym wielkim PR-cie. Dopóki oba istnieją, warto porównywać wyniki (ten sam commit, oba narzędzia, ten sam zestaw affected projektów) — rozjazd oznacza, że graf/`inputs` nie są jeszcze poprawnie odwzorowane w Nx.

### Krok 4: kontraktowanie (`turbo.json` znika)

Gdy wszystkie zespoły i cały CI korzystają z Nx, `turbo.json` i zależność `turbo` w `package.json` usuwa się w jednym, małym PR-cie — to jest moment „contract" z wzorca expand-and-contract (rozdział 01, sekcja 1).

**Dlaczego to działa bez przestoju:** cała migracja polega na **dodaniu nowej warstwy obok starej**, nigdy na jednoczesnej zmianie obu na raz. To jest ten sam wzorzec co migracja API biblioteki (rozdział 01) i przenoszenie konsumentów breaking change'u — tylko zastosowany do samego narzędzia budowania, nie do kodu aplikacji.

---

## 6. Jak to powiedzieć na rozmowie (gotowe zdania)

- „`nx migrate` to nie to samo co Renovate — bot podbija tylko numer wersji, `nx migrate --run-migrations` faktycznie przepisuje kod pod nowe API, bo migrację dostarcza autor paczki razem ze zmianą.”
- „CODEOWNERS to mechanizm GitHuba, nie Nx, ale naturalnie mapuje się na tagi `scope:*` — struktura katalogów, którą już mam z modularnego monolitu, staje się od razu mapą właścicieli kodu.”
- „Cache i dystrybucja zadań to różne mechanizmy: cache odpowiada „czy to już liczono", dystrybucja odpowiada „jak podzielić dużo affected pracy na wiele maszyn w jednym przebiegu CI". Mylenie ich to częsty błąd.”
- „Migracja z Turborepo na Nx w dużym repo to expand-and-contract zastosowany do samego narzędzia: oba działają obok siebie, przenosisz projekt po projekcie, porównujesz wyniki, dopiero na końcu usuwasz stare.”
- „`pnpm-workspace.yaml` nie zmienia się w żadnym z tych scenariuszy — to jest warstwa, której Nx i Turborepo w ogóle nie dotykają, obie nakładki tylko orkiestrują zadania na tym samym workspace.”

---

## Pytania kontrolne

1. Czym różni się `nx migrate` od bota typu Renovate/Dependabot? Dla jakich paczek `nx migrate` w ogóle zadziała?
2. Opisz krok po kroku, co robi `nx migrate latest` a co dopiero `nx migrate --run-migrations`.
3. Do czego służy CODEOWNERS i dlaczego naturalnie mapuje się na tagi `scope:*` z rozdziału 04?
4. Jaki problem z rozdziału 01 (sekcja 1) rozwiązuje CODEOWNERS, a jaki kompromis wprowadza?
5. Czym różni się cache zdalny od dystrybucji zadań (agentów)? Podaj sytuację, w której tylko dystrybucja pomoże, a cache nie.
6. Dlaczego migracja z Turborepo na Nx nie wymaga zmiany `pnpm-workspace.yaml`?
7. Opisz wzorzec „oba narzędzia działają obok siebie", zastosowany do migracji Turborepo → Nx. Do jakiego wzorca z rozdziału 01 to nawiązuje?
8. Jak sprawdzić w trakcie migracji, że Nx daje ten sam wynik `affected` co dotychczasowy `turbo --filter`?
9. Dlaczego w CoinJar (skala: kilkanaście projektów, jeden autor) CODEOWNERS i dystrybucja zadań nie są dziś potrzebne?
10. Co się dzieje z `turbo.json` na końcu migracji i dlaczego to jest „contract", a nie „expand"?
