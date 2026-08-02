# Architecture Index

Übersicht aller Architekturentscheidungen. Einzelne Einträge liegen als `ga-XXX.md` in diesem Verzeichnis.

Neue Entscheidung: [Template](./templates/ga-template.md) · [README](./README.md)

---

| ID | Titel | Status | Priorität |
|----|-------|--------|-----------|
| [GA-001](./ga-001.md) | Stammdaten vor Freitext | ✅ Umgesetzt | Hoch |
| [GA-002](./ga-002.md) | Historie stabil; Deaktivieren statt Löschen | ✅ Umgesetzt | Hoch |
| [GA-003](./ga-003.md) | Geräteart plus fachlicher Untertyp | ✅ Umgesetzt | Mittel |
| [GA-004](./ga-004.md) | Gemeinsame Timeline mit fachlichen Filtern | ✅ Umgesetzt | Hoch |
| [GA-005](./ga-005.md) | Wetter und Integrationen als optionale Module | ✅ Umgesetzt | Mittel |
| [GA-006](./ga-006.md) | Datenmodell orientiert sich an Greenkeeper-Arbeit | ✅ Umgesetzt | Hoch |
| [GA-007](./ga-007.md) | Konkrete Maßnahmen statt Sammelkategorien | ✅ Umgesetzt | Hoch |
| [GA-008](./ga-008.md) | Mehrere fachliche Referenzen pro Maßnahme | 📋 Geplant | Mittel |
| [GA-009](./ga-009.md) | Atomarer Onboarding-Abschluss per RPC | ✅ Umgesetzt | Hoch |
| [GA-010](./ga-010.md) | Getrennte Supabase-Umgebungen für Dev und Production | ✅ Umgesetzt | Hoch |
| [GA-011](./ga-011.md) | Pflegegruppen-Verwaltung per RPC mit RLS und automatischer Bereinigung | ✅ Umgesetzt | Hoch |
| [GA-012](./ga-012.md) | Berechneter Bestand aus Bewegungen | 📋 Geplant | Hoch |
| [GA-013](./ga-013.md) | KI-gestützte Düngererkennung — Architektur (Stufe 1 Product Profiles) | ✅ Stufe 1 umgesetzt | Hoch |
| [GA-014](./ga-014.md) | Product Enrichment Engine | 📋 Geplant | Hoch |
| [GA-015](./ga-015.md) | Produktbasierter Düngerbestand — technische Umstellung | 📋 Geplant | Hoch |

---

## Abstimmung mit Produkt-Governance

Produkte folgen zusätzlich [product-governance.md](../product-governance.md). GA-001 und GA-002 gelten fachlich auch für Produkte; technische Umsetzung ist dort spezifiziert. Fachliche Modellentscheidungen zu Produkten siehe [GM-003](../model/gm-003.md). Persönlicher Düngerbestand und Bestandsbewegungen: [GM-008](../model/gm-008.md), [GA-012](./ga-012.md), [GA-015](./ga-015.md) (Umsetzungsplan DL-033).
