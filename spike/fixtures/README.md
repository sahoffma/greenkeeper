# Spike-Fixtures — KI-Düngererkennung (GA-013)

## Referenzfoto (Live-Test)

- **Datei:** `IMG_0081.HEIC` (iPhone-Vorderseite)
- **Produkt:** Rasendoktor Professional — Frühjahr & Neuansaat, NPK 14-28-10, 5 kg

HEIC wird **serverseitig** konvertiert — keine manuelle Konvertierung nötig.

## Manueller Integrationstest

```bash
set -a && source .env.local && set +a
npx tsx scripts/manual-product-recognize-spike.mjs spike/fixtures/IMG_0081.HEIC
```

## Dev-UI

1. `npm run dev:netlify`
2. [http://localhost:8888/dev/product-recognize](http://localhost:8888/dev/product-recognize)
3. `IMG_0081.HEIC` auswählen

**Hinweis:** Live-Test ruft OpenAI (Vision + Web Search) und Supabase auf. Nicht Teil der CI.
