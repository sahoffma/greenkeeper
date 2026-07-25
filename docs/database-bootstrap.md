# Datenbank-Neuaufbau (Bootstrap)

Version 1.2 · Stand 2026-07-25

## Zweck

Dieses Dokument beschreibt den **verbindlichen, reproduzierbaren** Weg zum Aufbau der Greenkeeper-PostgreSQL-Datenbank — kompatibel mit Supabase SQL Editor, Supabase CLI (`db push` / Migrationen) und CI.

Production (`keoxzyzdkvebedgdswah`) wird hier **nicht** beschrieben als automatisches Ziel; Migrationen dort nur manuell nach Dev-Verifikation und unter den [Betriebsregeln](#betriebsentscheidung-supabase-plan-und-production-freeze) unten.

---

## Betriebsentscheidung: Supabase-Plan und Production-Freeze

**Verbindlich während der Entwicklungsphase** (Stand 2026-07-25):

| Regel | Entscheidung |
|-------|--------------|
| Supabase-Plan | **Free-Plan** bleibt vorerst aktiv |
| Entwicklung & Tests | ausschließlich gegen **greenkeeper-dev** (`amyounxrsxgujsfutshx`) |
| greenkeeper-prod | **keine weiteren Änderungen** bis zum geplanten öffentlichen Rollout |
| Vor öffentlichem Rollout | Supabase auf **mindestens Pro** hochstufen (ca. **25 USD/Monat** — Kosten bewusst erst bei tatsächlich bevorstehendem Production-Betrieb) |
| Vor jeder Production-Migration | **belastbarer, wiederherstellbarer Backup-Stand** muss vorhanden und geprüft sein |
| Ohne bestätigtes Backup | **keine Production-Migration** und **kein Production-Deploy** |

Diese Regeln gelten unabhängig von Migrations-Reife auf Dev. Ein production-freigabefähiger Stand auf Dev rechtfertigt **keine** automatische Production-Änderung.

---

## Verbindlicher Neuaufbauweg

### Schritt 1 — Baseline

Datei **`supabase/schema.sql`** ausführen.

Enthält den aktuellen Schema-Snapshot inkl.:

- Kern-Tabellen (profiles, areas, products, …)
- Onboarding/Pflegegruppen-Struktur
- **Governance-Enums** (`app_user_role`, `product_verification_status` inkl. `legacy_imported`, `product_source_type`)
- Enum-Spalten statt `text` für `profiles.role` und `products.verification_status`

### Schritt 2 — Migrationen chronologisch

Alle Dateien in **`supabase/migrations/*.sql`** in **Dateiname-Reihenfolge** (lexikographisch = chronologisch) ausführen:

```text
20250717_products_fertilizer_fields.sql
20250718_products_manganese_percent.sql
20250720_products_label_nutrients.sql
20250721_products_liquid_fertilizer.sql
20250722_product_governance.sql
20250723_product_governance_v2.sql
20250724_measure_activity_types.sql
20250725_onboarding_care_groups.sql
20250726_product_governance_role_type_fix.sql
20250727_product_governance_v2_enum_commit_fix.sql
```

**Keine Sonderreihenfolge.** Korrektur-Migrationen `20250726` und `20250727` sind idempotent und dienen bestehenden Datenbanken, die noch die alte `text`-Baseline hatten.

### Schritt 3 — Verifikation

```bash
# Transaktionaler Neuaufbau-Test (Dev, mit ROLLBACK — ändert Dev nicht dauerhaft)
node scripts/verify-chronological-bootstrap.mjs

# Onboarding RPC/RLS (Dev, schreibend)
node scripts/verify-onboarding-migration.mjs

npm test
npm run build
```

---

## Werkzeuge im Repository

| Skript | Zweck |
|--------|--------|
| `scripts/bootstrapDatabaseCore.mjs` | Gemeinsame Logik: schema + chronologische Migrationen |
| `scripts/apply-dev-schema.mjs` | Dauerhafter Apply auf Dev (nur `amyounxrsxgujsfutshx`, mit Env-Guard) |
| `scripts/verify-chronological-bootstrap.mjs` | Vollständiger Neuaufbau-Test in Transaktion + ROLLBACK |
| `scripts/supabaseEnvGuard.mjs` | Blockiert Production, erfordert `ALLOW_SUPABASE_WRITE_TESTS=true` |

---

## Baseline- vs. Squash-Strategie

| Ansatz | Entscheidung |
|--------|--------------|
| **`schema.sql` als Baseline** | ✅ Aktuell. Wird bei strukturellen Änderungen mitgepflegt. |
| **Vollständiger Squash aller Migrationen** | ❌ Nicht jetzt. Production hat Migrationen bereits angewendet; Squash würde Historie verwischen. |
| **Korrektur-Migrationen behalten** | ✅ `20250726`, `20250727` bleiben für Legacy-Pfade und Production-Sicherheit (No-Op wenn schon korrekt). |

Bei zukünftigen Major-Refactors: neues Baseline-Datum in `schema.sql`-Header dokumentieren, Migrationen nur für Delta.

---

## Bekannte Fallstricke (historisch)

| Symptom | Ursache (alter Stand) | Lösung |
|---------|----------------------|--------|
| `COALESCE types text and app_user_role cannot be matched` | `schema.sql` hatte `text`-Spalten; `20250722` übersprang Konvertierung | Baseline korrigiert; `20250726` für Legacy |
| `unsafe use of new value "legacy_imported"` (55P04) | Enum-Wert und UPDATE im selben Transaction-Block in `20250723` | `legacy_imported` in Baseline-Enum; `20250727` für Legacy |
| Sonderreihenfolge `20250726→20250722→20250727→20250723` | Workaround vor Baseline-Fix | **Entfernt** — nicht mehr nötig |

---

## Supabase CLI / CI

Empfohlener CI-Check (Dev-Credentials als Secrets):

```bash
node scripts/verify-chronological-bootstrap.mjs
npm test && npm run build
```

Für `supabase db push`: Migrationen liegen chronologisch vor; Baseline muss separat oder via init-Skript gesetzt sein — Greenkeeper nutzt derzeit **`schema.sql` + Migrationen** statt reinem CLI-Init.

---

## Production Pre-Flight

Vor jeder Production-Migration oder jedem Production-Deploy: **Read-only-Inventur** manuell ausführen. Kein automatisches Skript, keine CI-Verbindung zu Production.

> ### STOPP: Supabase Pro aktiv und Backup verfügbar?
>
> **Vor dem ersten Schritt** (Inventur, Migration oder Deploy) auf greenkeeper-prod prüfen:
>
> 1. **Supabase-Plan:** Ist das Production-Projekt auf **mindestens Pro** hochgestuft?  
>    → Während der Entwicklungsphase bleibt Production im **Free-Plan** — dann **keine Migration und kein Deploy**.
> 2. **Backup:** Liegt ein **belastbarer, wiederherstellbarer Backup-Stand** vor (Zeitstempel dokumentiert, Wiederherstellung verifiziert oder plausibel bestätigt)?
> 3. **Freigabe:** Beides bestätigt und schriftlich/freigegeben?
>
> **Ohne bestätigtes Pro + Backup: STOPP.** Keine Schreibaktion auf Production starten.

### Datei

[`scripts/sql/production-preflight-readonly.sql`](../scripts/sql/production-preflight-readonly.sql)

### Ablauf

0. **STOPP-Prüfung** oben (Supabase Pro + Backup) — bei Nicht-Erfüllung abbrechen.
1. Datei im Repository öffnen (nicht aus dem Chat kopieren — immer die versionierte Quelle verwenden).
2. Im Supabase-Dashboard sicherstellen, dass **greenkeeper-prod** (`keoxzyzdkvebedgdswah`) geöffnet ist — nicht Dev.
3. SQL Editor → **New query** → gesamten Dateiinhalt einfügen.
4. **Vor dem Ausführen prüfen:** erste Zeile muss `BEGIN TRANSACTION READ ONLY;` sein, letzte Zeile `COMMIT;`.
5. Query ausführen und **alle Result-Sets vollständig sichern** (Export, Screenshot oder Copy — für spätere Freigabe).
6. Bei **jedem Fehler** oder **unerwarteten Wert** abbrechen und Ergebnisse analysieren — **keine Migration starten**, bis Inventur geprüft und freigegeben ist.
7. Abschnitt **J** kann bei teilweise migrierter DB mit `relation/column does not exist` fehlschlagen; vorherige Abschnitte (A–H) sind dann trotzdem auswertbar. Fehlende Objekte als **SKIPPED** dokumentieren.

### Was die Inventur prüft

| Bereich | Inhalt |
|---------|--------|
| A | Aktuelle Datenbank, Benutzer, Read-only-Transaktion |
| B | Existenz von Tabellen, Spalten, RPC, Enum-Wert `legacy_imported`, Unique-Constraint |
| C | Datentypen `profiles.role`, `products.verification_status` |
| D | RPC `complete_onboarding` (SECURITY DEFINER, Volatilität, Signatur, EXECUTE für `authenticated`) |
| E–F | RLS-Aktivierung und Policies (Metadaten) |
| G | Zähler: Auth-Nutzer, Profile, aktive Flächen, Produkte (Gesamtanzahl; `soft_deleted_at`-Filter nur über B08 prüfbar) |
| H | Geschätzte Zeilenzahlen optionaler Tabellen (`care_groups`, `care_group_areas`, `measure_details`) |
| J | Integrität: Onboarding-Backfill-Lücken, Flächen ohne Pflegegruppe, Duplikate, leere Pflegegruppen |

### Wichtige Grenzen

- **Ersetzt keine Migrationshistorie.** Ob eine Migration fehlt, ergibt sich aus dem **tatsächlichen Schema-Zustand** (Existenz-Checks B, Typen C, RPC D) — nicht aus der Reihenfolge im Dashboard.
- **Keine personenbezogenen Detaildaten** in den Ergebnissen (keine E-Mails, Namen, UUID-Listen).
- **Keine Schreiboperationen** — ausschließlich `SELECT` in einer Read-only-Transaktion.

---

## Verwandte Dokumente

- [product-governance.md](./product-governance.md) — Governance-Migrationen
- [GA-010](./architecture/ga-010.md) — Dev/Production-Trennung
- [README.md](../README.md) — lokale `.env.local`-Konfiguration
