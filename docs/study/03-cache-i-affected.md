# 03. Cache i `affected`: jak Nx przyspiesza CI

## TL;DR

- **Problem:** bez tego mechanizmu CI musiałoby przy każdym PR budować, lintować i testować **cały** monorepo, nawet jeśli zmieniła się jedna linijka w jednej bibliotece. W dużym repo to minuty albo godziny zmarnowane na niezmieniony kod.
- **`affected`** = policz, które projekty **realnie dotyka** zmiana (przez graf zależności z rozdziału 02), i uruchom zadania tylko na nich.
- **Cache** = jeśli target już był policzony na dokładnie tym samym wejściu (kod + config + wersje zależności), **nie uruchamiaj go ponownie** — oddaj zapisany wynik. Działa niezależnie od `affected`: nawet bez zmian, powtórne `nx test` w tym samym repo trafia w cache.
- Oba mechanizmy razem: **`affected` ogranicza, CO uruchomić; cache ogranicza, jak CZĘSTO to faktycznie liczyć.** Turborepo robi to samo — algorytm (hash → cache hit/miss, `git diff` → dotknięte paczki) jest koncepcyjnie identyczny, różni się źródło grafu (rozdział 02, sekcja 2) i to, gdzie żyje zdalny cache (Nx Cloud vs Vercel Remote Cache).
- W CoinJar to działa naprawdę: realny CI (`.github/workflows/ci.yml`) uruchamia `pnpm nx affected -t lint typecheck test build`, z `nx-set-shas` do wyliczenia bazy porównania. **Zdalny cache (Nx Cloud) jest podłączony przez `nxCloudId`, ale CI nie ma jeszcze skonfigurowanego tokenu** — realny, praktyczny przykład niedokończonej optymalizacji, dobry temat na rozmowę (sekcja 6).

---

## 1. Problem: CI bez `affected` i bez cache

Wyobraź sobie najgłupszy możliwy CI dla monorepo:

```bash
pnpm nx run-many -t lint typecheck test build --all
```

Zmieniasz jeden plik w `libs/shared/util`. CI i tak uruchamia lint/typecheck/test/build na **wszystkich** projektach: `shared-util`, `shared-domain`, `shared-ui`, `budget-data-access`, `budget-state`, sześciu feature'ach, `coinjar-web`, `coinjar-web-e2e`. W CoinJar to kilkanaście projektów przy jednej zmienionej linijce. W repo o rozmiarze produkcyjnym (setki bibliotek) to bywa nie do przyjęcia — CI trwa dłużej niż warto czekać na feedback.

Dwa niezależne pytania, które trzeba rozdzielić:

1. **Co w ogóle trzeba sprawdzić?** (odpowiedź: `affected`)
2. **Co z tego było już policzone i się nie zmieniło?** (odpowiedź: cache)

To są **różne mechanizmy**. `affected` działa nawet bez cache (po prostu nie odpala zadań na niedotkniętych projektach). Cache działa nawet bez `affected` (`nx run-many --all` z cache'em i tak pominie policzone wcześniej targety). W CI używa się obu naraz, bo się uzupełniają.

---

## 2. `affected`: jak Nx wie, co sprawdzić

### Krok 1 — baza porównania

`affected` potrzebuje punktu odniesienia: „zmiana względem czego?”. W lokalnej pracy to zwykle `main`:

```bash
pnpm nx affected -t test --base=main
```

W CI jest to subtelniejsze — `main` na Twoim laptopie i `main` widziane przez runnera GitHub Actions to nie zawsze ten sam commit (main mógł pojechać dalej między checkoutem a teraz), a przy pull requeście chcesz porównać **head PR-a** względem **ostatniego zielonego commita na main**, nie względem najnowszego (który mógł jeszcze nie przejść CI). Do tego służy `nrwl/nx-set-shas` w realnym workflow CoinJar:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0 # nx affected compares against main
- uses: nrwl/nx-set-shas@v5
- run: pnpm nx affected -t lint typecheck test build
```

`fetch-depth: 0` pobiera pełną historię (domyślny płytki checkout ma tylko 1 commit — `affected` nie miałby z czym porównać). `nx-set-shas` ustawia zmienne środowiskowe `NX_BASE` i `NX_HEAD`: na pull requeście `NX_BASE` to SHA ostatniego **udanego** przebiegu CI na `main` (odpytuje GitHub Actions API — stąd `permissions: actions: read` w workflow), a `NX_HEAD` to bieżący commit. `nx affected` czyta te zmienne automatycznie, bez żadnej flagi.

### Krok 2 — zmienione pliki → zmienione projekty

Nx robi `git diff NX_BASE...NX_HEAD --name-only`, dostaje listę plików, i mapuje każdy plik na projekt, do którego należy (po prostu: który `apps/*`/`libs/*/*` go zawiera).

### Krok 3 — zmienione projekty → dotknięte projekty

To jest właściwa robota grafu z rozdziału 02: jeśli `shared-util` się zmienił, **każdy projekt, który go (bezpośrednio albo pośrednio) importuje, jest „affected”**, nawet jeśli sam nie ma ani jednej zmienionej linijki. Realny przykład z CoinJar (rozdział 01, potwierdzony w repo):

```bash
pnpm nx show projects --affected --files=libs/shared/util/src/lib/dates/month.ts
# shared-util, shared-domain, coinjar-web, coinjar-web-e2e
```

`shared-domain` jest affected, bo importuje `shared-util`. `coinjar-web` jest affected, bo (pośrednio, przez feature'y) zależy od obu. `budget-feature-plan` **nie jest** affected, bo nic w łańcuchu jego zależności się nie zmieniło.

### Krok 4 — dotknięte projekty → zadania

`nx affected -t lint typecheck test build` bierze tę listę projektów i na każdym z nich próbuje uruchomić każdy z podanych targetów (jeśli target istnieje na danym projekcie — nie każdy projekt ma np. `e2e`). Kolejność i równoległość ustala task pipeline z rozdziału 02 (`dependsOn`), więc `build` zależności zawsze wykona się przed `test`/`build` zależnego projektu.

**Turborepo, ten sam pomysł:** `turbo run test --filter=...[origin/main]` robi identyczny `git diff` + mapowanie na paczki przez graf `package.json`. Różnica: Nx dorzuca analizę importów w kodzie do budowy grafu (rozdział 02, sekcja 2), więc `affected` bywa dokładniejszy, gdy graf zależności nie jest w 100% odzwierciedlony w `package.json`.

---

## 3. Cache: z czego liczony jest hash

Dla **każdego** targetu na **każdym** projekcie Nx liczy hash z (fragmenty realne z `nx show project shared-util --json`, rozdział 02, sekcja 3):

1. **Plików wejściowych** (`inputs`) — treść plików źródłowych projektu wg `namedInputs` (rozdział 02, sekcja 6): `default` albo węższy `production`.
2. **Outputów zależności** — jeśli `shared-util` się zmienia, hash `test` w `shared-domain` (który od niego zależy) też się zmienia, mimo że żaden plik `shared-domain` nie ruszony.
3. **Komendy i jej opcji** — `executor` + `options.command` (np. `"vitest"`, `"eslint ."`). Zmiana komendy = inny hash.
4. **Zewnętrznych zależności** (`externalDependencies`) — realny przykład: target `test` w `shared-util` ma w inputach `{"externalDependencies":["vitest"]}`. Podbicie wersji Vitest w `package.json` unieważnia cache tego targetu, mimo że kod testu się nie zmienił — bo wynik testu **mógł się zmienić** przez inną wersję runnera.
5. **Zadeklarowanych zmiennych środowiskowych** (`{"env":"CI"}` w przykładzie z rozdziału 02) — jeśli zachowanie zależy od `CI=true/false`, to musi być częścią hasha, inaczej cache skłamie.

Jeśli **wszystkie** te elementy są identyczne jak przy poprzednim uruchomieniu — Nx **nie wykonuje komendy**. Zamiast tego kopiuje zapisane `outputs` (np. `test-output/vitest/coverage`) na swoje miejsce i wypisuje zapisane logi z terminala, z adnotacją w output, że to wynik z cache.

**Kluczowa zasada, którą trzeba umieć wytłumaczyć:** cache jest tak dobry, jak dobrze zadeklarowane `inputs`/`outputs`. Jeśli target czyta coś, czego nie ma w `inputs` (np. plik `.env` spoza `namedInputs`, albo wynik wywołania sieciowego), Nx odda **stary, nieaktualny wynik** i będzie przekonany, że jest poprawny. To jest realny koszt tego mechanizmu, nie tylko korzyść.

---

## 4. Lokalny cache: gdzie leży i jak go zobaczyć

```bash
pnpm nx test shared-util   # pierwsze uruchomienie: liczy, zapisuje
pnpm nx test shared-util   # drugie: "[existing outputs match the cache, left as is]"
```

Cache leży w `.nx/cache` (potwierdzone w `.gitignore` CoinJar — katalog jest ignorowany, bo to lokalny artefakt, nie coś do commitowania). Obok jest `.nx/workspace-data` — to nie cache zadań, tylko cache **samego grafu projektów** (żeby Nx nie musiał za każdym razem od zera analizować wszystkich importów w repo).

Przydatne komendy:

```bash
pnpm nx test shared-util --skip-nx-cache   # wymuś ponowne uruchomienie, ignoruj cache
pnpm nx reset                              # wyczyść cache i workspace-data (gdy coś "dziwnie się zachowuje")
```

`nx reset` to odpowiednik „wyłącz i włącz”, gdy podejrzewasz zepsuty/nieaktualny cache, a nie chcesz debugować dlaczego.

---

## 5. Zdalny cache: Nx Cloud

Lokalny cache pomaga jednej osobie na jednej maszynie między uruchomieniami. **Nie pomaga między różnymi maszynami** — a każdy runner CI to świeża maszyna. Bez zdalnego cache, CI zawsze liczy wszystko od zera (chyba że `affected` już to ograniczył).

**Nx Cloud** to zdalny magazyn par (hash → wynik), współdzielony między wszystkimi, którzy pracują na repo — Twoim laptopem, kolegami, CI. Mechanizm:

1. Przed uruchomieniem targetu Nx liczy hash (sekcja 3).
2. Pyta Nx Cloud: „czy ktoś już to policzył?”
3. Jeśli tak — pobiera `outputs` i logi zamiast uruchamiać komendę.
4. Jeśli nie — uruchamia lokalnie i **wysyła wynik do Nx Cloud**, żeby następny (Ty, kolega, CI) mógł go odebrać.

Efekt praktyczny: **ktoś inny w zespole (albo CI na poprzednim PR-cie) już zbudował dokładnie ten sam kod → Ty go w ogóle nie budujesz, tylko pobierasz wynik.** To jest dokładny odpowiednik Vercel Remote Cache w Turborepo — ten sam algorytm, inny dostawca.

### Stan w CoinJar (realny, warty wspomnienia na rozmowie)

`nx.json` ma:

```json
"nxCloudId": "6ab681f368c05edb61fcc34a"
```

To znaczy: **workspace jest zarejestrowany w Nx Cloud i połączony z repo GitHub** (commit `aa5ec53 fix(repo): point nxCloudId to the workspace linked with GitHub`). Ale w `.github/workflows/ci.yml` **nie ma** kroku logującego CI do Nx Cloud (nie ma `NX_CLOUD_ACCESS_TOKEN` jako secret ani w env). Efekt: **CI aktualnie korzysta tylko z lokalnego cache w obrębie jednego przebiegu joba**, nie z globalnego zdalnego cache między przebiegami. Każdy nowy PR startuje z zimnym cache na runnerze.

To dobry, konkretny przykład na rozmowę: **znam różnicę między „podłączony do Nx Cloud” a „faktycznie używający zdalnego cache w CI”**, i wiem, co brakuje, żeby to domknąć — dodać `NX_CLOUD_ACCESS_TOKEN` jako sekret repo i użyć go w workflow (albo polegać na natywnej integracji Nx Cloud z GitHub Appem, jeśli tak jest skonfigurowana; do zweryfikowania w ustawieniach Nx Cloud). CLAUDE.md (sekcja 15.3) wprost nazywa to „opcjonalne” — czyli świadomy dług, nie przeoczenie.

---

## 6. Pułapki cache: co go psuje

- **Niedeklarowane wejście.** Target czyta zmienną środowiskową albo plik spoza `inputs` → cache może zwrócić wynik nieaktualny względem rzeczywistego stanu. Naprawa: dodać brakujące wejście do `namedInputs`/targetu.
- **Efekt uboczny poza `outputs`.** Jeśli komenda zapisuje coś poza zadeklarowanymi `outputs` (np. plik w innym katalogu), przy cache hit ten plik **nie zostanie odtworzony** — bo Nx przywraca tylko to, co zadeklarowane.
- **Niedeterminizm.** Test, który czasem przechodzi, czasem nie (flaky), przy cache hit zawsze odda **ten sam** wynik co poprzednio — dobre i złe zarazem: raz zapisany fałszywy sukces będzie się powtarzał, dopóki coś nie zmieni hasha.
- **Cache jako fałszywe poczucie bezpieczeństwa.** Zielony `nx affected -t test` na PR-cie nie znaczy „cała aplikacja działa”, tylko „projekty dotknięte tą zmianą przechodzą testy”. Bug w nieinteraktywnej części grafu (np. literówka w danych seedowych niepowiązana importami) może przejść niezauważony — dlatego E2E (rozdział `coinjar-web-e2e`) i tak biegnie względem realnie zbudowanej aplikacji, nie tylko `affected`.

---

## 7. Jak to powiedzieć na rozmowie (gotowe zdania)

- „`affected` i cache to dwa różne pytania: co trzeba sprawdzić, i co z tego było już policzone. W CI używam obu, bo się uzupełniają.”
- „Hash targetu liczy się z plików wejściowych, outputów zależności, samej komendy i wersji zależności zewnętrznych — jeśli coś wpływa na wynik, a nie jest w tym zestawie, cache będzie kłamał.”
- „W CI porównuję nie względem najnowszego `main`, tylko względem ostatniego **zielonego** commita — `nx-set-shas` robi to automatycznie przez GitHub Actions API.”
- „Zdalny cache (Nx Cloud, odpowiednik Vercel Remote Cache w Turborepo) daje to, czego lokalny cache nie może: współdzielenie wyników między maszynami, więc CI może w ogóle nie uruchamiać czegoś, co kolega już zbudował na swoim PR-cie.”
- „W CoinJar `nxCloudId` jest podłączony, ale CI nie ma jeszcze tokenu do zdalnego cache — to świadomy, nazwany w dokumentacji dług, nie przeoczenie. Umiem powiedzieć, co dokładnie brakuje, żeby to domknąć.”

---

## Pytania kontrolne

1. Czym różni się `affected` od cache? Podaj przykład sytuacji, w której działa jeden mechanizm bez drugiego.
2. Opisz krok po kroku, jak Nx ustala listę projektów dotkniętych zmianą, od `git diff` do „affected”.
3. Co robi `nx-set-shas` i dlaczego w CI nie porównujemy po prostu z najnowszym `main`?
4. Z jakich elementów liczony jest hash targetu? Podaj przykład, kiedy zmiana wersji zależności zewnętrznej powinna unieważnić cache.
5. Co się stanie, jeśli target zapisuje plik poza zadeklarowanym `outputs`, a wynik trafi do cache?
6. Gdzie fizycznie leży lokalny cache Nx w CoinJar i czym różni się od `.nx/workspace-data`?
7. Czym różni się lokalny cache od zdalnego (Nx Cloud)? Dlaczego lokalny nie wystarcza w CI?
8. Jaki jest realny stan integracji z Nx Cloud w CoinJar i czego brakuje, żeby CI korzystało ze zdalnego cache?
9. Podaj dwie pułapki, które sprawiają, że cache zwróci nieaktualny/błędny wynik.
10. Czym `nx run-many --all` różni się od `nx affected` w kontekście cache — który mechanizm z którego korzysta?
