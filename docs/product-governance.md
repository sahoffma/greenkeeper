# Produkt-Governance V2 – Architektur

Greenkeeper besitzt **einen einzigen offiziellen Schreibpfad** für Produktdaten: den **Product Governance Service** (`src/lib/productGovernanceService.ts`). Weder Nutzer, KI noch andere Teile der App dürfen direkt `public.products` verändern.

## Zentraler Service

```
importProductViaGovernance()     ← KI-, PDF-, Foto-, Admin-Import
submitNewProduct()                ← Nutzer/Assistent: neues Produkt
submitChangeRequest()             ← Korrekturvorschlag
approveSubmission() / approveChangeRequest()   ← Reviewer
registerSourceSnapshot()          ← Quellenmomentaufnahme
fetchReviewQueue()                ← priorisierte Warteschlange
```

Interne Schreiblogik ausschließlich in `productGovernanceWriter.ts` → `writeOfficialProductRecord()`.

## Architekturdiagramm V2

```mermaid
flowchart TB
  subgraph ingress [Eingänge]
    U[Nutzer]
    AI[KI-Assistent]
    PDF[PDF-Import]
    PHOTO[Foto-Import]
    ADM[Admin-Seed]
  end

  SVC[productGovernanceService]
  W[productGovernanceWriter]
  CORE[productGovernanceCore]

  subgraph db [PostgreSQL]
    PS[product_submissions]
    PCR[product_change_requests]
    PSS[product_source_snapshots]
    P[products – read-only für Clients]
    PV[product_versions]
    PRE[product_review_events]
    PDE[product_domain_events]
    RQ[product_review_queue View]
  end

  STG[(Supabase Storage)]

  U --> SVC
  AI --> SVC
  PDF --> SVC
  PHOTO --> SVC
  ADM --> SVC
  SVC --> CORE
  SVC --> W
  W --> P
  SVC --> PS
  SVC --> PCR
  SVC --> PSS
  SVC --> PV
  SVC --> PRE
  SVC --> PDE
  PSS -.->|Verweis| STG
  RQ --> PS
  RQ --> PCR
```

## Vertrauensmodell (getrennt)

| Ebene | Feld | Sichtbarkeit |
|-------|------|--------------|
| KI-Sicherheit | `ai_confidence_score`, `ai_field_confidence` | intern |
| Review-Sicherheit | `review_confidence_score`, `review_field_confidence` | intern |
| Nutzer-Anzeige | `buildProductUserTrustDisplay()` | „Verifiziert“, „Technisch übernommen“, „Quelle vorhanden“, „Änderung in Prüfung“ |

## Quellen-Snapshots

Tabelle `product_source_snapshots` – **unveränderlich** nach Erstellung:

- Metadaten: Quelle, Art, Hash, Zeitpunkt, extrahierter Text, KI-Extraktion
- Dateien (PDF, Fotos) in **Supabase Storage**; DB speichert nur `storage_bucket` + `storage_path`
- Verknüpfung mit Submission, Change Request oder Produkt

## Versionierung V2

Jede `product_versions`-Zeile enthält:

- Vollständigen `snapshot`
- Strukturierte `field_changes` (Vergleich zur Vorgängerversion)
- `submission_id` / `change_request_id` / `approved_by`
- `source_snapshot_ids`
- Getrennte KI-/Review-Vertrauenswerte

### Dünger: unveränderliche Produktversionen

Für Dünger gilt zusätzlich [DL-018](../decisions/dl-018.md):

- **Produktidentität** (Hersteller, Name, Barcode, …) und **Produktversion** (fachliche Herstellerdeklaration) sind getrennt.
- Eine gespeicherte Produktversion wird **niemals** rückwirkend auf eine spätere Rezeptur geändert.
- Rezepturänderung unter gleichem Namen → **neue** Produktversion; bestehende Version bleibt unverändert.
- Reine Gebindegrößenänderung (z. B. 5 kg → 4 kg bei identischer Deklaration) → **keine** neue Produktversion.
- Gebindegröße und Restmenge gehören zum **Bestand**, nicht zur Produktversion ([GM-008](./model/gm-008.md)).

Der Governance-Schreibpfad darf eine neue Herstellerdeklaration **nicht** still in ein bestehendes Product Profile schreiben, das eine andere Produktversion repräsentiert. Vor Persistenz muss geprüft werden, ob die normalisierte Deklaration einer bekannten Produktversion entspricht ([GA-014 §11.14.1](./architecture/ga-014.md#11141-produktversion-und-persistenzgrenze-dünger)).

Technischer **Composition Fingerprint** für den Versionsvergleich: fachlich gefordert in DL-018 — **noch nicht** implementiert.

## Legacy-Strategie

Bestehende Produkte **ohne menschliche Freigabe** (`verified_by IS NULL`):

- Status → `legacy_imported` (nicht `verified`)
- `legacy_imported_at` + Hinweistext
- Keine automatische Version-Backfill – optional später via `legacy_backfill`-Submission
- Daten bleiben unverändert lesbar; Review kann sie normal verifizieren

## Review-Warteschlange

View `product_review_queue` – sortiert nach `review_priority DESC`:

- Herstellerquellen > PDF > Foto > KI > Nutzer
- +10 Punkte pro übereinstimmender Meldung (max. +30)

## Domain Events

Tabelle `product_domain_events` – Vorbereitung Event-Engine:

- `dispatched_at IS NULL` = noch nicht an externe Consumer gesendet
- Events: `product.published`, `product.updated`, `product.submission_created`, …

## Migrationen (manuell ausführen)

**Verbindlicher Neuaufbau:** siehe [database-bootstrap.md](./database-bootstrap.md).

Kurzform — nach `schema.sql` alle Migrationen in **Dateiname-Reihenfolge**:

1. `20250717` … `20250721` — Produktfelder
2. `20250722_product_governance.sql` — Phase 1
3. `20250723_product_governance_v2.sql` — V2-Erweiterung
4. `20250724`, `20250725` — Maßnahmen, Onboarding/Pflegegruppen
5. `20250726`, `20250727` — idempotente Legacy-Korrekturen (No-Op auf frischem Neuaufbau)

**Keine Sonderreihenfolge mehr nötig**, sofern `schema.sql` die Governance-Enums enthält (Stand ab 2026-07-25).

**Historische Fallstricke** (nur bei altem `schema.sql` ohne Enum-Baseline):

| Fehler | Korrektur |
|--------|-----------|
| `COALESCE types text and app_user_role cannot be matched` | `20250726` (Legacy) oder Baseline-Fix |
| `unsafe use of new value "legacy_imported"` (55P04) | `20250727` (Legacy) oder Baseline-Fix |

## Risiken

- Admin-Seed-Skripte benötigen `GOVERNANCE_ADMIN_USER_ID` (Reviewer/Admin-Profil)
- Legacy-Produkte erscheinen als „Technisch übernommen“ bis Review
- `importProductWithServiceRole` ist deprecated und leitet auf Governance um

## Persönlicher Bestand (Abgrenzung)

Dieses Dokument regelt **Ebene 1 – Produktkatalog** (globale Produktdaten). Persönliche Gebinde, Bestandsbewegungen und die Kopplung zur Journal-Düngung sind **nicht** Teil des Governance-Schreibpfads; sie folgen [GM-008](./model/gm-008.md), [GA-012](./architecture/ga-012.md), [DL-019](./decisions/dl-019.md), [DL-020](./decisions/dl-020.md), [DL-021](./decisions/dl-021.md) und [DL-022](./decisions/dl-022.md).

**KI-Produkterkennung (GA-013):** Erkannte Produkte werden als **persönlicher Recognition Candidate** übernommen — **ohne** automatischen Eintrag in den offiziellen Katalog. Ein eindeutiger Greenkeeper-Katalogtreffer verwendet das bestehende Produkt; parallele persönliche Kandidaten entstehen dann nicht. Automatische Wissensanreicherung nach Identifikation ist Kernprinzip ([DL-013](./decisions/dl-013.md)); technisches Zielbild: [GA-014](./architecture/ga-014.md). Offizielle Katalogschreibungen bleiben über diesen Governance-Pfad. Bei der Übernahme von Herstellerdeklarationen gilt: nicht genannte Inhaltsstoffe werden als 0 % interpretiert ([DL-014](./decisions/dl-014.md)). Sichtbare Bestandsaufnahme erst nach erfüllter Qualitätsbarriere ([DL-015](./decisions/dl-015.md)); fachliche Aufnahmefähigkeit Dünger: [DL-016](./decisions/dl-016.md), technische Spezifikation: [GM-009](./model/gm-009.md).
