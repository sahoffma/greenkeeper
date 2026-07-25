# Greenkeeper

Der persönliche KI-Greenkeeper für Premium-Rasenmanagement.

## Erster Meilenstein

Diese Version enthält:

- Startseite **Meine Flächen** mit zwei Flächenkarten
- Dashboard der Hauptfläche **Rose Valley – Hauptfläche**
- Mobile Navigation mit zentralem Plus-Button
- Plus-Menü mit Kategorien (noch ohne Erfassungsflow)

Noch nicht umgesetzt sind Timeline, Assistent, Mehr sowie die Datenerfassung über das Plus-Menü.

## Technik

- React 18
- TypeScript
- Vite 5
- React Router

## Voraussetzungen

- Node.js 18 oder neuer
- npm

## Lokal starten

```bash
npm install
npm run dev
```

Die App läuft standardmäßig unter [http://localhost:5173](http://localhost:5173).

## Produktions-Build

```bash
npm run build
npm run preview
```

## KI-Auswertung lokal testen

Die OpenAI-Anbindung läuft über eine Netlify Function. `npm run dev` startet nur das Vite-Frontend – die Route `/.netlify/functions/parse-activity` ist damit nicht verfügbar.

Für lokale Tests:

```bash
npm install -g netlify-cli
cp .env.example .env.local
# VITE_SUPABASE_* und OPENAI_API_KEY eintragen
netlify dev
```

**Wichtig:** Nicht mit `sudo netlify dev` starten – sudo kann `.env.local` nicht lesen oder Umgebungsvariablen blockieren.

`netlify dev` lädt `.env.local` und `.env` (siehe `netlify.toml`). Supabase-Keys gehören in `.env.local`:

```env
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein-anon-key
```

Der OpenAI API Key gehört in `.env` oder `.env.local` – niemals mit `VITE_`-Prefix.

## Supabase: Dev und Production

Greenkeeper nutzt **zwei getrennte Supabase-Projekte**:

| Umgebung | Verwendung | Project-Ref |
|----------|------------|-------------|
| **Dev** | Lokale Entwicklung, Migrationstests, RPC-/RLS-/E2E-Tests | eigenes Dev-Projekt |
| **Production** | Live-Betrieb | `keoxzyzdkvebedgdswah` (gesperrt für Schreibtests) |

**Regeln:**

- `.env.local` zeigt **ausschließlich auf Dev** (wird von Git ignoriert).
- Production-Schlüssel **niemals** in `.env.local` oder Client-Code.
- `.env.example` enthält nur Platzhalter — keine echten Keys.
- Migrationen zuerst in **Dev** verifizieren, danach kontrolliert auf Production anwenden.
- Schreibende Testskripte nur mit Dev-Ref **und** `ALLOW_SUPABASE_WRITE_TESTS=true` (siehe `scripts/supabaseEnvGuard.mjs`).

```env
# .env.local (Dev)
VITE_SUPABASE_URL=https://YOUR-DEV-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://YOUR-DEV-PROJECT-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ALLOW_SUPABASE_WRITE_TESTS=true
```

Onboarding-Verifikation (nur Dev):

```bash
ALLOW_SUPABASE_WRITE_TESTS=true node scripts/verify-onboarding-migration.mjs
```

Datenbank-Neuaufbau (chronologisch, transaktional mit ROLLBACK auf Dev):

```bash
ALLOW_SUPABASE_WRITE_TESTS=true node scripts/verify-chronological-bootstrap.mjs
```

Details: [docs/database-bootstrap.md](docs/database-bootstrap.md)

Browser-E2E (Onboarding, Guards, Startseite — nur Dev):

```bash
npm run test:e2e:all
```

Voraussetzung: `.env.local` mit Dev-Ref, `ALLOW_SUPABASE_WRITE_TESTS=true`, gültige Supabase-Keys.

## Projektstruktur

```text
src/
├── components/   # UI-Komponenten (Navigation, Karten, Plus-Menü)
├── data/         # Statische Flächendaten für den ersten Meilenstein
├── pages/        # Seiten (Flächenliste, Dashboard, Platzhalter)
├── styles/       # Globale Styles
└── types/        # TypeScript-Typen
```
