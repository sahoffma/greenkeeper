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

## Projektstruktur

```text
src/
├── components/   # UI-Komponenten (Navigation, Karten, Plus-Menü)
├── data/         # Statische Flächendaten für den ersten Meilenstein
├── pages/        # Seiten (Flächenliste, Dashboard, Platzhalter)
├── styles/       # Globale Styles
└── types/        # TypeScript-Typen
```
