# Plan: moduł importu i kategoryzacji paragonów

> Status: **pomysł, nie wdrażać bez decyzji**. Zapisane 2026-11-26.

## Projekt: Aplikacja do automatyzacji budżetu domowego i kategoryzacji paragonów

## 1. Cel projektu

Chcę zbudować własną aplikację webową do zarządzania budżetem domowym, która automatycznie pobiera lub odczytuje paragony, rozbija je na pojedyncze pozycje, przypisuje im odpowiednie kategorie wydatków przy pomocy AI i zapisuje w bazie danych. Ma to całkowicie wyeliminować ręczne przepisywanie paragonów.

## 2. Stack technologiczny

- **Monorepo:** Nx albo Turborepo (do decyzji).
- **Backend & Frontend:** JavaScript / TypeScript, Node.js (np. Next.js jako fullstack lub Express/Fastify + lekki frontend).
- **Baza danych:** Relacyjna baza danych (preferowany SQLite na start lub PostgreSQL + Prisma / Drizzle ORM).
- **AI / Kategoryzacja:** Integracja z API LLM (np. Gemini API lub OpenAI API) z wykorzystaniem _Structured Outputs_ (wymuszony schemat JSON) oraz obsługa multimodalna (Vision) do odczytu zdjęć/PDF-ów paragonów z innych sklepów.

## 3. Główne funkcjonalności (MVP)

1. **Źródła danych (Input):**
   - **Integracja z Lidl Plus:** Moduł pobierający historię e-paragonów (JSON) z nieoficjalnego API Lidla (obsługa `refresh_token`, rynek `PL`).
   - **Uniwersalny skaner paragonów (OCR + AI):** Możliwość wgrania zdjęcia lub pliku PDF z dowolnego sklepu (Biedronka, Rossmann, Żabka itp.). Zamiast klasycznego OCR, obraz trafia bezpośrednio do modelu Vision LLM, który ekstraktuje listę produktów, ilości, ceny i rabaty.
2. **Inteligentny silnik kategoryzacji (Cache + AI):**
   - Predefiniowana lista kategorii użytkownika: `Żywność`, `Słodycze`, `Kawa/Herbata`, `Alkohol`, `Chemia domowa`, `Kosmetyki`, `Inne`, `Kaucje/Zwroty`.
   - **Optymalizacja kosztów (Słownik w DB):** Aplikacja zapisuje w bazie zmapowane nazwy produktów (np. `MLEKO UHT 3,2%` -> `Żywność`). Przed wysłaniem zapytania do AI system sprawdza lokalną bazę. Do LLM trafiają tylko nieznane dotąd nazwy produktów.
3. **Obsługa logiki paragonów (Ważne przypadki brzegowe):**
   - **Rabaty:** Na paragonach (oraz w JSON z Lidla) zniżki często występują jako osobne pozycje pod produktem (np. `-2.50 PLN`). Parser musi poprawnie odejmować rabat od konkretnego produktu przed zsumowaniem kategorii.
   - **Wielosztuki i waga:** Poprawne przeliczanie `ilość * cena_jednostkowa`.
4. **Panel weryfikacji i analityka (UI):**
   - Widok podglądu wczytanego paragonu przed ostatecznym zatwierdzeniem (możliwość szybkiej ręcznej korekty kategorii przez dropdown, jeśli AI się pomyli – zmiana aktualizuje też słownik w DB).
   - Dashboard z podsumowaniem wydatków w podziale na kategorie, sklepy i miesiące.

## 4. Zadanie na start

Zaproponuj architekturę projektu, schemat bazy danych (tabele: `Receipts`, `ReceiptItems`, `Categories`, `ProductMappings`) oraz wygeneruj szkielet aplikacji z pierwszym działającym endpointem do parsowania i kategoryzacji przykładowego paragonu.

---

## Do uzgodnienia przed startem (dopisane przez Claude, nie część planu)

Plan w kilku miejscach różni się od `CLAUDE.md`:

- **Monorepo:** CoinJar już stoi na Nx, a `CLAUDE.md` (sekcje 2, 4, 16) go wymaga. Turborepo oznaczałoby migrację albo osobne repo; przy decyzji warto spisać ADR.
- **Backend i stack:** CoinJar jest dziś tylko frontendem (MSW), a Supabase jest odłożony (sekcje 3, 11, 14). Next.js/Express, SQLite i Prisma/Drizzle to zmiana stacku.
- **Sekrety:** klucz API LLM i `refresh_token` Lidla nie mogą trafić do frontendu ani zmiennych `VITE_*`, więc potrzebny jest serwer.
- **Kategorie:** lista z planu nie pokrywa się z seedem (sekcja 13). Lepiej mapować produkty na istniejące podkategorie niż tworzyć drugi słownik.
- **Kwoty:** `Transaction.amount` to grosze > 0. Rabaty i kaucje/zwroty wymagają osobnej decyzji.
- **Architektura:** nowy moduł to np. `scope:receipts`, z dostępem do `budget` tylko przez publiczne API (sekcja 16.1). Warto zapisać to jako ADR.
- **Ryzyko:** API Lidla jest nieoficjalne, może przestać działać; sprawdzić też regulamin. Prawdziwych paragonów i tokenów nie commitować.
