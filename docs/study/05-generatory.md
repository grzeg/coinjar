# 05. Generatory: `Tree`, szablony, testy, sync generators, migracje

> **Status w CoinJar: milestone 3 jeszcze nie zaimplementowany.** `tools/coinjar-plugin` nie istnieje, `docs/adr/` nie istnieje, pakiet `@nx/plugin` nie jest zainstalowany (sprawdzone: `package.json` ma tylko `@nx/devkit`, potrzebne do pisania generatorów, ale nie samo rusztowanie pluginu). Ten rozdział jest więc **przygotowaniem teoretycznym do milestone'u**, nie opisem gotowego kodu. Przykłady kodu są ogólnymi, kanonicznymi wzorcami Nx (identycznymi jak w oficjalnej dokumentacji i w generatorach `@nx/react`), nie cytatami z CoinJar — to jest jasno odróżnione poniżej.

## TL;DR

- **Generator** = program, który tworzy/modyfikuje pliki w repo według szablonu i parametrów, zamiast żeby robił to człowiek (albo AI) ręcznie za każdym razem.
- Generator operuje na **`Tree`** — wirtualnym systemie plików w pamięci. Wszystkie zmiany (nowe pliki, edycje `package.json`, itd.) trafiają najpierw do `Tree`; nic nie dotyka dysku, dopóki Nx nie „spłucze" (`flush`) zmian na koniec — stąd `--dry-run` jest praktycznie darmowy: uruchamiasz cały generator, oglądasz diff, i nic się nie zapisuje.
- **Generatory testuje się jak zwykłe funkcje** — `createTreeWithEmptyWorkspace()` daje pusty `Tree` w pamięci, generator się na nim uruchamia, test sprawdza zawartość `Tree` (`tree.read(...)`) bez tworzenia żadnych plików na dysku i bez uruchamiania procesów.
- **Sync generator** to inny byt niż zwykły generator: uruchamia się **automatycznie** przed innymi targetami (np. `build`), żeby trzymać jakiś wyliczony plik w zgodzie z resztą repo (np. rejestr tras). `nx sync:check` w CI failuje, jeśli ktoś zapomniał odświeżyć taki plik.
- **Migracja** (`nx migrate`) to generator specjalnego rodzaju: uruchamia się **raz, automatycznie, przy podbijaniu wersji paczki**, żeby przepisać kod pod nowe API tej paczki. To nie jest coś, co piszesz Ty — to coś, co dostajesz od autorów bibliotek (Nx, React, itd.), gdy oni zmieniają API.
- W CoinJar plan (CLAUDE.md sekcja 16.2) to lokalny plugin `tools/coinjar-plugin` z generatorami `library`, `ui-component`, `feature-view` — **jeszcze nieistniejący**, ten rozdział przygotowuje wiedzę, żeby go świadomie zbudować.

---

## 1. Problem, który generatory rozwiązują

Rozdział 01 (sekcja 6) pokazał, że granice modułów bez narzędzia to tylko konwencja. Ten sam problem dotyczy **struktury nowego kodu**: jeśli każdą nową bibliotekę czy komponent tworzy się ręcznie (albo przez AI „na oko"), po dziesiątej bibliotece różnice się kumulują — inny układ folderów, ktoś zapomniał `*.stories.tsx`, ktoś wpisał zły tag, ktoś nie dodał eksportu w `index.ts`.

CLAUDE.md (sekcja 16.4) nazywa to wprost: **„deterministyczny szkielet, AI do logiki"**. Generator gwarantuje, że _struktura_ jest zawsze taka sama — nazwa, foldery, tagi, testy, stories — a człowiek (albo agent AI) dopisuje tylko _logikę_ w środku wygenerowanego szkieletu. To jest różnica między „AI generuje dziesięć wariantów tej samej rzeczy" a „AI uruchamia generator i pisze tylko to, czego generator nie może wiedzieć".

---

## 2. Anatomia generatora

Generator Nx to zwykła funkcja TypeScript + plik `schema.json` opisujący jej parametry. Kanoniczny szkielet (wzorzec z `@nx/devkit`, identyczny w każdym generatorze Nx):

```ts
// generators/ui-component/generator.ts
import {
  Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
} from '@nx/devkit';

interface UiComponentGeneratorSchema {
  name: string;
  directory: string; // np. "atoms" albo "molecules"
}

export async function uiComponentGenerator(
  tree: Tree,
  options: UiComponentGeneratorSchema,
) {
  const projectRoot = 'libs/shared/ui';

  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'), // katalog z szablonami
    joinPathFragments(projectRoot, 'src/lib', options.directory, options.name),
    { ...options, tmpl: '' },
  );

  await formatFiles(tree);
}

export default uiComponentGenerator;
```

```json
// generators/ui-component/schema.json
{
  "$schema": "https://json-schema.org/draft-07/schema",
  "$id": "UiComponent",
  "title": "Generate an atom or molecule in shared/ui",
  "type": "object",
  "properties": {
    "name": { "type": "string", "$default": { "$source": "argv", "index": 0 } },
    "directory": {
      "type": "string",
      "enum": ["atoms", "molecules"],
      "default": "atoms"
    }
  },
  "required": ["name"]
}
```

Uruchamia się to jako `nx g <plugin>:ui-component MoneyText --directory=atoms`, dokładnie tak samo jak wbudowane generatory (`nx g @nx/react:library ...`) — z perspektywy CLI **nie ma różnicy** między generatorem od Nx a generatorem własnym.

---

## 3. `Tree`: wirtualny system plików

To jest najważniejsza koncepcja tego rozdziału. `Tree` udostępnia API podobne do `fs`, ale **nic nie zapisuje na dysk od razu**:

| Metoda                      | Co robi                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tree.write(path, content)` | zapisuje plik (nowy albo nadpisuje istniejący) w wirtualnym drzewie                                               |
| `tree.read(path)`           | czyta aktualną zawartość (uwzględnia zmiany z tej samej sesji generatora, nawet jeśli plik na dysku jeszcze inny) |
| `tree.exists(path)`         | sprawdza istnienie w wirtualnym stanie                                                                            |
| `tree.delete(path)`         | usuwa (wirtualnie)                                                                                                |
| `tree.rename(from, to)`     | zmienia nazwę/ścieżkę                                                                                             |
| `tree.children(dir)`        | listuje zawartość katalogu                                                                                        |

Dopiero gdy CLI Nx kończy uruchamianie generatora, **flushuje** wszystkie operacje z `Tree` na prawdziwy dysk naraz. Stąd:

```bash
nx g coinjar-plugin:ui-component MoneyText --dry-run
```

`--dry-run` uruchamia **cały** generator (cała logika się wykonuje, `Tree` wypełnia się zmianami), tylko pomija ostatni krok (flush). CLI wypisuje listę plików, które by powstały/zmieniły się, i różnicę w treści — bez dotykania dysku. To jest dokładnie ten „przejrzany `--dry-run` przed pierwszym użyciem", o którym mówi CLAUDE.md (sekcja 16.2).

**Dlaczego to ważne:** dzięki `Tree` generator jest **czystą funkcją względem systemu plików** (wejście: stan repo + opcje, wyjście: nowy stan repo, wszystko w pamięci) — więc da się go testować bez efektów ubocznych (sekcja 5) i bezpiecznie podglądać przed wykonaniem.

---

## 4. Szablony: `generateFiles`

`generateFiles(tree, srcFolder, targetFolder, substitutions)` kopiuje cały katalog szablonów, podstawiając zmienne w **nazwach plików** i **treści**. Konwencja Nx (identyczna w każdym oficjalnym generatorze):

```
generators/ui-component/files/
  __name__.tsx.template
  __name__.stories.tsx.template
  __name__.spec.tsx.template
```

- `__name__` w nazwie pliku → podstawiane wartością `options.name` (np. `MoneyText.tsx.template` → `MoneyText.tsx`).
- Wewnątrz pliku, składnia EJS: `<%= name %>` podstawia wartość, `<% if (...) { %> ... <% } %>` pozwala na warunkowe fragmenty (np. inny import dla wariantu dark mode).

Przykładowy szablon (`__name__.stories.tsx.template`, wzorzec identyczny z tym, co opisuje CLAUDE.md sekcja 08 dla Storybooka):

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { <%= name %> } from './<%= name %>';

const meta = {
  component: <%= name %>,
  tags: ['autodocs'],
} satisfies Meta<typeof <%= name %>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

Po `generateFiles` generator dopisuje jeszcze export w `libs/shared/ui/src/index.ts` (przez `tree.write` z odczytanej i zmodyfikowanej treści, albo helper `updateJson`/`applyChangesToString` z `@nx/devkit`) — żeby nowy komponent od razu wszedł do publicznego API biblioteki (rozdział 04, sekcja 6), bez ręcznego kroku, o którym łatwo zapomnieć.

---

## 5. Testowanie generatorów

Kanoniczny wzorzec (ten sam, którego używają testy generatorów w `@nx/react` — sprawdzalne w ich repo open source):

```ts
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import { uiComponentGenerator } from './generator';

describe('uiComponentGenerator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('creates component, stories and test files', async () => {
    await uiComponentGenerator(tree, { name: 'MoneyText', directory: 'atoms' });

    expect(
      tree.exists('libs/shared/ui/src/lib/atoms/MoneyText/MoneyText.tsx'),
    ).toBe(true);
    expect(
      tree.exists(
        'libs/shared/ui/src/lib/atoms/MoneyText/MoneyText.stories.tsx',
      ),
    ).toBe(true);

    const content = tree.read(
      'libs/shared/ui/src/lib/atoms/MoneyText/MoneyText.tsx',
      'utf-8',
    );
    expect(content).toContain('export function MoneyText');
  });

  it('exports the component from the public index.ts', async () => {
    await uiComponentGenerator(tree, { name: 'MoneyText', directory: 'atoms' });

    const indexContent = tree.read('libs/shared/ui/src/index.ts', 'utf-8');
    expect(indexContent).toContain(
      "export * from './lib/atoms/MoneyText/MoneyText'",
    );
  });
});
```

Zero prawdziwych plików na dysku, zero procesów potomnych, zero czekania na I/O — test trwa milisekundy, tak jak zwykły test jednostkowy. To jest odpowiedź na pytanie „jak testować coś, co generuje pliki": **nie testujesz efektu na dysku, testujesz zawartość `Tree` po wywołaniu funkcji**.

---

## 6. Owijanie generatorów Nx: `library` jako przykład

CLAUDE.md (sekcja 16.2) planuje, żeby generator `library` **owijał** `@nx/react:library`/`@nx/js:library`, dokładając wymuszenie ścieżki, nazwy, import path i tagów z rozdziału 4 — żeby nikt nie musiał (ani nie mógł) wpisać tagów ręcznie i się pomylić. Kanoniczny wzorzec „generator wywołujący inny generator":

```ts
import { Tree, formatFiles } from '@nx/devkit';
import { libraryGenerator } from '@nx/js';

interface LibraryGeneratorSchema {
  scope: 'shared' | 'budget';
  type: 'ui' | 'util' | 'domain' | 'data-access' | 'state' | 'feature';
  name: string;
}

export async function libraryGenerator(
  tree: Tree,
  options: LibraryGeneratorSchema,
) {
  const directory = `libs/${options.scope}/${options.type === 'feature' ? `feature-${options.name}` : options.type}`;

  await libraryGenerator(tree, {
    directory,
    name: `${options.scope}-${options.type}`,
    tags: [`scope:${options.scope}`, `type:${options.type}`].join(','),
    // ... reszta opcji zgodnych z konwencją repo (bundler, linter, unitTestRunner)
  });

  await formatFiles(tree);
}
```

Sam `@nx/js:library` (albo `@nx/react:library`) robi ciężką robotę (struktura projektu, `package.json`, `tsconfig`, konfiguracja Vitest), a generator owijający **dokłada reguły specyficzne dla CoinJar** (jaka ścieżka, jaki tag, wymuszony import path z npm scope `@coinjar/*`) tak, żeby nikt nie mógł ich pominąć czy przekręcić. To jest praktyczna realizacja zasady z CLAUDE.md sekcja 16.2: „Nikt nie przekazuje tagów ręcznie."

---

## 7. Sync generators: inny mechanizm, inny cel

Zwykły generator uruchamia człowiek (albo agent AI), na żądanie, żeby **stworzyć** coś nowego. **Sync generator** to coś innego: uruchamia się **automatycznie**, przy okazji innych targetów, żeby trzymać jakiś **wyliczony plik** w zgodzie z aktualnym stanem repo.

Przykład z CLAUDE.md (sekcja 16.2, opcjonalne): generator, który skanuje wszystkie `type:feature` i generuje z tego rejestr tras albo dokumentację tagów. Mechanizm:

1. Sync generator jest zarejestrowany w `nx.json` (np. jako `syncGenerators` na targecie `build` — realny przykład tego mechanizmu widzieliśmy już w rozdziale 02: target `typecheck` w `shared-util` miał pole `"syncGenerators": ["@nx/js:typescript-sync"]`, to wbudowany sync generator, który synchronizuje `tsconfig.json` — referencje projektów TS z grafem zależności Nx).
2. Przed uruchomieniem targetu (`nx build`, `nx typecheck`) Nx **sam** sprawdza, czy sync generator zgłasza rozbieżność (np. `tsconfig.json` nie ma referencji do zależności, która realnie istnieje w grafie).
3. Jeśli tak — Nx **sam uruchamia generator i aplikuje zmianę** (albo pyta o potwierdzenie, zależnie od trybu), zanim target ruszy.
4. `nx sync:check` (używane w CI zamiast interaktywnego trybu) **failuje**, jeśli plik wygenerowany byłby inny niż to, co jest w repo — czyli ktoś zmienił coś ręcznie i zapomniał odświeżyć plik pochodny, albo zmiana w kodzie wymaga aktualizacji pliku, a nikt tego nie zrobił lokalnie przed commitem.

Różnica kluczowa: **zwykły generator to narzędzie, sync generator to strażnik spójności uruchamiany bez pytania, wpięty w pipeline zadań.**

---

## 8. Migracje: `nx migrate` to nie generator, który piszesz Ty

Łatwa pomyłka na rozmowie: migracja (`nx migrate`) **wygląda** jak generator (ta sama technologia — `Tree`, `generateFiles`, `updateJson`), ale ma inny cykl życia:

|                  | Generator                              | Migracja                                                                                            |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Kto go pisze     | Ty (albo autor pluginu)                | autor pluginu/frameworka (Nx, `@nx/react`, itd.)                                                    |
| Kto go uruchamia | Ty, na żądanie, kiedy chcesz           | `nx migrate` automatycznie, raz, przy podbijaniu wersji                                             |
| Po co            | stworzyć nową rzecz zgodną z konwencją | **przepisać istniejący kod**, żeby pasował do nowego API po aktualizacji paczki                     |
| Rejestr          | wywoływany po nazwie z CLI             | zapisany w `migrations.json` pluginu, z warunkiem wersji („uruchom to, jeśli migrujesz z < 18.0.0") |

Przykład z życia (koncepcyjny, nie z CoinJar): Nx w wersji 19 zmienia domyślny format `project.json`. Autorzy Nx piszą migrację, która **dla każdego projektu w Twoim repo** automatycznie przepisuje stary format na nowy. Ty odpalasz:

```bash
pnpm nx migrate latest      # aktualizuje package.json, generuje migrations.json z listą do wykonania
pnpm nx migrate --run-migrations   # faktycznie uruchamia zapisane migracje na Twoim kodzie
```

To jest odpowiedź na koszt „single version policy" z rozdziału 01 (sekcja 8): podbicie wspólnej zależności dotyczy wszystkich naraz, ale **migracje automatyzują bolesną część** (mechaniczne przepisanie kodu), zamiast zostawiać to każdemu zespołowi osobno. Głębiej: rozdział 07.

---

## 9. Plan dla CoinJar: co dokładnie ma powstać

Z CLAUDE.md, milestone 3 (jeszcze nie zrealizowany):

- **`tools/coinjar-plugin`** — lokalny plugin Nx, stworzony przez `pnpm nx g @nx/plugin:plugin tools/coinjar-plugin` (pierwszy krok: rusztowanie samego pluginu, zanim cokolwiek w nim napiszemy).
- **Generator `library`** — owija `@nx/react:library`/`@nx/js:library`, wymusza ścieżkę/nazwę/import path/tagi z rozdziału 4.
- **Generator `ui-component`** — atom/molekuła w `shared/ui`: komponent + `*.stories.tsx` (CSF3, autodocs, wariant dark mode) + test + eksport w `index.ts`.
- **Generator `feature-view`** — widok w bibliotece feature: `messages.ts`, stany loading/error/empty, szkielet testu integracyjnego.
- **`bannedExternalImports`** w regule granic modułów (rozdział 04, sekcja 7 — zaznaczone tam jako brakujące).
- **ADR 0001** „modularny monolit" w `docs/adr/0001-modularny-monolit.md`.
- **Komenda Claude Code** (`.claude/commands/`), która odpala te generatory zamiast pisania boilerplate'u ręcznie — realizacja zasady z sekcji 16.4 CLAUDE.md.

Żadne z powyższych jeszcze nie istnieje w repo (zweryfikowane na początku tego rozdziału). To jest naturalny następny krok pracy nad CoinJar, nie coś do udawania, że już jest zrobione.

---

## 10. Jak to powiedzieć na rozmowie (gotowe zdania)

- „Generator operuje na `Tree`, wirtualnym systemie plików w pamięci — nic nie dotyka dysku, dopóki CLI nie spłucze zmian na końcu. Dzięki temu `--dry-run` jest praktycznie darmowy i generatory testuje się jak czyste funkcje.”
- „Testowanie generatora to `createTreeWithEmptyWorkspace()` plus asercje na `tree.read(...)` — zero plików na dysku, zero procesów, milisekundy.”
- „Własny generator zwykle nie zaczyna od zera — owija wbudowany (`@nx/react:library`) i dokłada reguły specyficzne dla repo, np. wymuszone tagi, żeby nikt nie mógł ich pominąć ani wpisać źle.”
- „Sync generator to co innego niż zwykły generator: uruchamia się automatycznie przed targetem, żeby pilnować spójności pochodnego pliku — `nx sync:check` w CI failuje, jeśli ktoś zapomniał go odświeżyć.”
- „Migracja nie jest czymś, co piszę ja — to generator dostarczany przez autorów paczki, uruchamiany raz przy `nx migrate`, żeby zaktualizować mój kod pod nowe API. To odpowiedź na koszt single version policy z monorepo.”
- „W CoinJar to milestone jeszcze przede mną — plan jest jasny (`tools/coinjar-plugin`, trzy generatory, ADR), ale mówię wprost, że jeszcze nie zaimplementowany, nie udaję gotowego stanu.”

---

## Pytania kontrolne

1. Czym jest `Tree` i dlaczego generator dzięki niemu daje się testować bez efektów ubocznych?
2. Jak działa `--dry-run` w kontekście `Tree` i flushowania zmian na dysk?
3. Do czego służy `generateFiles` i co oznacza `__name__` w nazwie pliku szablonu?
4. Napisz (albo opisz słownie) test generatora sprawdzający, że nowy komponent trafia do publicznego `index.ts` biblioteki.
5. Dlaczego generator `library` w planie CoinJar owija `@nx/react:library`, zamiast pisać scaffolding od zera?
6. Czym różni się sync generator od zwykłego generatora? Podaj realny przykład wbudowanego sync generatora z rozdziału 02.
7. Co robi `nx sync:check` w CI i czego by nie złapało zwykłe `nx build`?
8. Czym różni się migracja od generatora pod względem tego, kto ją pisze i kto ją uruchamia?
9. Jak `nx migrate` łagodzi koszt „single version policy" opisany w rozdziale 01?
10. Wymień trzy konkretne elementy z planu milestone'u 3 CoinJar, które jeszcze nie istnieją w repo.

---

## Odpowiedzi (skrót)

1. `Tree` to wirtualny system plików w pamięci — operacje (`write`, `delete`, `rename`) nie dotykają dysku, dopóki CLI nie „spłucze" zmian na koniec. Dzięki temu generator jest czystą funkcją (stan repo + opcje → nowy stan repo), więc da się go uruchomić w testach bez żadnych efektów ubocznych na prawdziwym systemie plików.
2. Cały generator wykonuje się normalnie (logika, `generateFiles`, edycje `Tree`), tylko pomijany jest ostatni krok — flush na dysk. CLI pokazuje diff tego, co by powstało, bez zapisu — stąd `--dry-run` jest praktycznie darmowy.
3. Kopiuje katalog szablonów, podstawiając zmienne w nazwach plików i treści (składnia EJS). `__name__` w nazwie pliku jest podmieniane na wartość `options.name`, np. `__name__.tsx.template` → `MoneyText.tsx`.
4. Wywołujesz generator na `Tree` z `createTreeWithEmptyWorkspace()`, potem `tree.read('libs/shared/ui/src/index.ts', 'utf-8')` i sprawdzasz, czy zawiera nowy `export * from '...'` — bez tworzenia żadnego pliku na dysku.
5. Bo `@nx/react:library` już robi ciężką robotę (struktura, `package.json`, `tsconfig`, konfiguracja Vitest) — pisanie tego od zera duplikowałoby dobrze przetestowany kod. Generator owijający dokłada tylko to, co specyficzne dla CoinJar: wymuszoną ścieżkę, nazwę i tagi.
6. Sync generator uruchamia się automatycznie przed innym targetem, żeby pilnować spójności pliku pochodnego — nie jest wywoływany ręcznie przez człowieka na żądanie. Realny przykład z rozdziału 02: `@nx/js:typescript-sync` na targecie `typecheck`, synchronizujący referencje projektów w `tsconfig.json` z grafem zależności Nx.
7. Sprawdza, czy plik wygenerowany przez sync generator byłby inny niż to, co jest w repo — failuje, jeśli tak. Zwykłe `nx build` by tego nie złapało, bo nie uruchamia sync generatorów w trybie sprawdzającym, tylko liczyłoby na to, że plik już jest aktualny.
8. Migrację pisze autor pluginu/frameworka (Nx, `@nx/react` itd.), a uruchamia ją `nx migrate` automatycznie, raz, przy podbijaniu wersji. Generator piszesz Ty (albo autor Twojego lokalnego pluginu), a uruchamiasz go ręcznie, kiedy chcesz stworzyć coś nowego.
9. Bo automatyzuje mechaniczną część aktualizacji (codemod przepisujący kod pod nowe API), zamiast zostawiać to każdemu zespołowi/projektowi z osobna — podbicie wspólnej zależności nadal dotyczy wszystkich naraz, ale znaczną część roboty robi za Ciebie.
10. `tools/coinjar-plugin` (nie istnieje), `docs/adr/` (nie istnieje), pakiet `@nx/plugin` (niezainstalowany) — a wraz z nimi generatory `library`/`ui-component`/`feature-view`.
