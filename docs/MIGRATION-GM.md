# Migrationsbericht – GM (Greenkeeper Model)

**Datum:** 2026-07-22  
**Ziel:** GA/GM-Doppelverwendung auflösen — Fachmodell-Entscheidungen erhalten **GM-**IDs in `docs/model/`; Architekturentscheidungen behalten **GA-**IDs in `docs/architecture/`.

**Regel:** Keine inhaltlichen Änderungen — nur Struktur und Referenzen.

---

## 1. Identifizierte Fachmodell-Einträge (ehemals GA im Fachmodell)

Die folgenden Einträge standen in `docs/greenkeeper-data-model.md` unter „Modellentscheidungen“ und beschreiben das **fachliche Domänenmodell**, nicht technische Architektur. Sie hatten zuvor die IDs GA-001 … GA-006 im Fachmodell-Kontext (Kollision mit `docs/architecture/ga-*.md`).

| Alt (Fachmodell) | Neu (GM) | Datei | Titel |
|------------------|----------|-------|-------|
| GA-001 | **GM-001** | `docs/model/gm-001.md` | Maßnahmen-Journal, kein Düngejournal |
| GA-002 | **GM-002** | `docs/model/gm-002.md` | Spracheingabe primärer Einstieg |
| GA-003 | **GM-003** | `docs/model/gm-003.md` | Produkte nur über Governance |
| GA-004 | **GM-004** | `docs/model/gm-004.md` | Product-Learn-Assistent bei unbekannten Produkten |
| GA-005 | **GM-005** | `docs/model/gm-005.md` | Konkrete Maßnahmentypen |
| GA-006 | **GM-006** | `docs/model/gm-006.md` | Orientierung an Greenkeeper-Arbeitsweise |

**Unverändert (Architektur):** `docs/architecture/ga-001.md` … `ga-008.md` behalten ihre GA-IDs und Inhalte.

---

## 2. Neu angelegte Dateien

| Datei | Zweck |
|-------|--------|
| `docs/model/README.md` | Abgrenzung GM vs. GA |
| `docs/model/index.md` | Übersicht GM-001 … GM-006 |
| `docs/model/gm-template.md` | Vorlage für neue Modellentscheidungen |
| `docs/model/gm-001.md` … `gm-006.md` | Einzeleinträge (Entscheidungstext aus Fachmodell-Tabelle) |
| `docs/MIGRATION-GM.md` | Dieser Bericht |

---

## 3. Geänderte Dateien (Referenzen)

| Datei | Anpassung |
|-------|-----------|
| `docs/greenkeeper-data-model.md` | GM-Tabelle verlinkt auf `model/gm-*.md`; Verweis auf Model-Index |
| `docs/README.md` | Bereich `model/`; GM-Ort `docs/model/`; Link MIGRATION-GM |
| `docs/architecture/README.md` | GM-Ort → `docs/model/` |
| `docs/architecture/index.md` | GM-003 → `../model/gm-003.md` |
| `docs/architecture/ga-006.md` | GM-006 → `../model/gm-006.md` |
| `docs/architecture/templates/ga-template.md` | Model-Index in Verwandte Dokumente |
| `docs/decisions/dl-003.md` | GM-003 → `../model/gm-003.md` |
| `docs/playbook/README.md` | GM-Ort → `model/` |
| `docs/playbook/architecture-decisions.md` | GM-Hinweise und GM-006-Link → `model/` |

---

## 4. Angepasste Verweise (Detail)

### GM-Anker `#modellentscheidungen-gm` → Einzeldateien

| Vorher | Nachher |
|--------|---------|
| `greenkeeper-data-model.md#modellentscheidungen-gm` (GM-003) | `model/gm-003.md` |
| `greenkeeper-data-model.md#modellentscheidungen-gm` (GM-006) | `model/gm-006.md` |

### GM-Ort in README-Dateien

| Vorher | Nachher |
|--------|---------|
| GM in `greenkeeper-data-model.md` | GM in `docs/model/` |
| — | Fachmodell bleibt in `greenkeeper-data-model.md` (Entitäten, Beziehungen) |

### Verweise unverändert gelassen (bewusst)

| Verweis | Grund |
|---------|--------|
| `[Fachmodell](../greenkeeper-data-model.md)` in GK-, GA-, Playbook-Dateien | Beschreibt Entitäten/Beziehungen, nicht GM-IDs |
| `GA-001` … `GA-008` in `docs/architecture/` | Architekturentscheidungen unverändert |
| `docs/MIGRATION-AUDIT.md` | Historischer Snapshot — nicht angepasst |
| `docs/CONSOLIDATION-REPORT.md` | Vorheriger Konsolidierungsschritt — nicht angepasst |

---

## 5. Abgrenzung nach Migration

| Präfix | Bedeutung | Ort |
|--------|-----------|-----|
| **GM** | Fachliches Domänenmodell | `docs/model/` |
| **GA** | Technische Architekturentscheidungen | `docs/architecture/` |
| *(Fachmodell-Dokument)* | Entitäten, Maßnahmentypen, Geräte, Beziehungen | `docs/greenkeeper-data-model.md` |

---

## 6. Nächste GM-ID

Fortlaufend **GM-007** ff. in `docs/model/` anlegen.
