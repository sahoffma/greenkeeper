# Greenkeeper Dokumentation

**Dokumentation ist Teil des Produkts.** Eine Produktentscheidung gilt erst dann als vollständig abgeschlossen, wenn sie dokumentiert und mit den relevanten Dokumenten verknüpft wurde.

Diese Dokumentation ist **Bestandteil des Projekts** und wird versioniert im Repository gepflegt. Sie ist die zentrale Quelle für Produktwissen – neben dem Quellcode, nicht hinter Chat-Verläufen.

---

## Manifest

Das [Greenkeeper Manifest](./MANIFEST.md) beschreibt den **Zweck**, die **Werte**, die **Vision** und die **Leitprinzipien** von Greenkeeper. Es ist die **höchste fachliche Referenz** des Projekts.

---

## Project Handbook

Zentrale Referenz für **Rollen**, **Entwicklungsworkflow**, **Dokumentationsregeln** und **Definition of Done**: [PROJECT-HANDBOOK.md](./PROJECT-HANDBOOK.md)

---

## Greenkeeper Architect

Fachliche Spezifikation des langfristigen KI-Entwicklungspartners — Rolle, Arbeitsweise und Qualitätsmaßstäbe: [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md)

*(Keine GPT-Instruction; künftige GPT-Konfiguration wird aus Manifest, Handbook und Architect-Spezifikation abgeleitet.)*

---

## Bereiche

| Verzeichnis | Zweck |
|-------------|--------|
| [Playbook](./playbook/) | Gültige Produktregeln, UX, Onboarding, Design, Sprache und KI-Verhalten |
| [Architecture](./architecture/) | Technische Grundsatzentscheidungen (**GA-**) |
| [Model](./model/) | Fachliche Modellentscheidungen zum Domänenmodell (**GM-**) |
| [Ideas](./ideas/) | Zukünftige Produktideen (**GK-**) |
| [Decisions](./decisions/) | Getroffene Produktentscheidungen mit Begründung (**DL-**) |

---

## Weitere Referenzdokumente

| Dokument | Zweck |
|----------|--------|
| [Greenkeeper Manifest](./MANIFEST.md) | Zweck, Werte, Vision und Leitprinzipien — höchste fachliche Referenz |
| [Project Handbook](./PROJECT-HANDBOOK.md) | Rollen, Workflow, Dokumentationsregeln, Definition of Done |
| [Greenkeeper Architect](./GREENKEEPER-ARCHITECT.md) | Rolle und Arbeitsweise des KI-Entwicklungspartners |
| [Fachliches Datenmodell](./greenkeeper-data-model.md) | Maßnahmen, Geräte, Beziehungen; Entitäten und Abläufe |
| [Model-Index](./model/index.md) | Fachliche Modellentscheidungen (**GM-**) |
| [Produkt-Governance](./product-governance.md) | Offizielle Produktdatenbank, Review, technischer Governance-Workflow |
| [Aktueller Stand](./CURRENT-STATE.md) | Umsetzungsstand inkl. Authentifizierungsreise und Production-Freeze |
| [Onboarding (Playbook)](./playbook/onboarding.md) | Willkommen → Registrierung → E-Mail-Bestätigung → Garten-Onboarding |
| [GA-009 Authentifizierung](./architecture/ga-009.md) | Routing, Guards, E-Mail-Bestätigung, Dev-E2E-Strategie |
| [GK-015 Free/Pro](./ideas/gk-015.md) | Offene Monetarisierungsstrategie (noch keine Billing-Umsetzung) |
| [Datenbank-Bootstrap](./database-bootstrap.md) | Verbindlicher Neuaufbau: schema.sql + Migrationen chronologisch |
| [Migrations-Audit](./MIGRATION-AUDIT.md) | Bestandsaufnahme vor Konsolidierung (2026-07-22) |
| [Konsolidierungsbericht](./CONSOLIDATION-REPORT.md) | Änderungen aus GM-Umbenennung und Status-Vereinheitlichung |
| [GM-Migrationsbericht](./MIGRATION-GM.md) | GM-Auslagerung nach `docs/model/` |
| [Standardisierungsbericht](./STANDARDIZATION-REPORT.md) | Einheitlicher Dokumentkopf und Verlinkungsregeln |
| [Manifest-Bericht](./MANIFEST-REPORT.md) | Einführung des Greenkeeper Manifests |
| [Architect-Bericht](./GREENKEEPER-ARCHITECT-REPORT.md) | Einführung der Greenkeeper-Architect-Spezifikation |

---

## ID-Präfixe

| Präfix | Bedeutung | Ort |
|--------|-----------|-----|
| **GP-** | UX- und Produktprinzip | [playbook/ux-principles.md](./playbook/ux-principles.md) |
| **CM-** | Conversation Model (Dialogregeln) | [playbook/conversation-model.md](./playbook/conversation-model.md) |
| **GK-** | Idee (Greenkeeper Idea) | [ideas/](./ideas/) |
| **GA-** | Architekturentscheidung (Greenkeeper Architecture) | [architecture/](./architecture/) |
| **GM-** | Modellentscheidung (Greenkeeper Model) | [model/](./model/) |
| **DL-** | Produktentscheidung (Decision Log) | [decisions/](./decisions/) |

Weitere Präfixe außerhalb dieser Kernstruktur (noch nicht vollständig migriert):

| Präfix | Bedeutung | Ort |
|--------|-----------|-----|
| **GWP-** | Wissensprinzipien | [playbook/knowledge/principles.md](./playbook/knowledge/principles.md) |
| **HE-** | Home Experience | [playbook/home-experience.md](./playbook/home-experience.md) |

---

## Dokumentkopf (Standard)

Alle nummerierten Einträge (**GK**, **GA**, **GM**, **DL**, **GP**, **CM**) tragen einen einheitlichen Metadatenblock direkt unter der ID-Überschrift.

Felder: **ID**, **Titel**, **Status**, **Priorität** (falls zutreffend), **Erstellt**, **Zuletzt geändert**, **Verantwortlich**, **Verwandte Dokumente**, **Kurzbeschreibung**.

Details und Format: [templates/document-header.md](./templates/document-header.md)

---

## Statusdefinitionen

Verbindliche Statuswerte projektweit. Synonyme wie „Prüfen“, „Aktiv“, „Entwurf“, „angenommen“ oder „vorgeschlagen“ werden **nicht** mehr verwendet.

| Status | Beschreibung |
|--------|--------------|
| 💡 **Idee** | Erfasst oder in fachlicher Klärung; noch nicht verbindlich geplant oder umgesetzt. |
| 📋 **Geplant** | Fachlich angenommen oder vorgesehen; Umsetzung steht an, läuft aber noch nicht. |
| 🚧 **In Umsetzung** | Aktiv in Entwicklung oder schrittweiser Einführung. |
| ✅ **Umgesetzt** | Im Produkt verfügbar, verbindlich entschieden oder als Regel im Playbook gültig. |
| ⏸ **Zurückgestellt** | Bewusst pausiert; kann später reaktiviert werden. |
| ❌ **Verworfen** | Abgelehnt oder ersetzt — Begründung und ggf. Nachfolger dokumentieren. |

---

## Verlinkungsregeln

Alle Dokumente sollen – **soweit fachlich sinnvoll** – auf zusammengehörige Einträge verweisen:

| Von | Typische Querverweise |
|-----|------------------------|
| **GK** | GP, GA, GM, DL, verwandte GK |
| **GA** | GP, GK, GM, DL, Fachmodell |
| **GM** | GP, GA, GK, DL, Fachmodell |
| **DL** | GP, GK, GA, GM, Playbook |
| **GP / CM** | GK, GA, GM, DL, Fachmodell, [Manifest](./MANIFEST.md) |

**Regeln:**

1. Immer **explizite ID-Präfixe** verwenden (z. B. GA-003, nicht nur „Architektur“).
2. Verweise im Dokumentkopf (**Verwandte Dokumente**) und in den bestehenden Abschnitten pflegen — nicht ersetzen.
3. Keine erfundenen Querverweise; fehlende Verknüpfungen als offene Pflege markieren (`—` im Kopf).
4. Index-Dateien (`index.md`) und Einzeldokumente synchron halten.

---

## Status-Taxonomie

*(Kurzreferenz — ausführliche Definitionen siehe [Statusdefinitionen](#statusdefinitionen).)*

| Status | Bedeutung |
|--------|-----------|
| 💡 Idee | Erfasst oder in fachlicher Klärung |
| 📋 Geplant | Annahme / Vorgesehen, noch nicht in Umsetzung |
| 🚧 In Umsetzung | Aktiv in Entwicklung |
| ✅ Umgesetzt | Verfügbar oder verbindlich entschieden |
| ⏸ Zurückgestellt | Bewusst pausiert |
| ❌ Verworfen | Abgelehnt oder ersetzt – Begründung dokumentieren |

---

## Workflow

```
💡 Idee (GK)
    ↓ fachliche Bewertung
📋 Geplant / DL-Entscheidung
    ↓ Regeln ins Playbook (GP, CM, Onboarding, Design …)
🚧 In Umsetzung
    ↓
✅ Umgesetzt
```

**Schritte im Detail:**

1. **Idee** als GK-Eintrag in [ideas/](./ideas/) anlegen.
2. Bei Bedarf **Produktentscheidung** als DL-Eintrag festhalten und **Architektur** (GA) bzw. **Modell** (GM) prüfen oder ergänzen.
3. Gültige Regeln ins **Playbook** übernehmen (GP, CM, domain-spezifische Regeln).
4. Technisch umsetzen – Code und Docs verweisen auf relevante IDs.
5. Status in GK-, GA- und DL-Index nachziehen; verworfene Einträge **nicht löschen**.

---

## Pflegegrundsätze

1. Neue Ideen → **GK-**Eintrag.
2. Architekturentscheidungen → **GA-**ID.
3. Fachliche Modellentscheidungen → **GM-**ID in [model/](./model/).
4. Produktentscheidungen → **DL-**ID.
5. Das **Playbook** enthält ausschließlich gültige Regeln – keine Ideensammlung.
6. Keine Platzhaltertexte; README-Dateien mit echtem Inhalt pflegen.
7. Statusänderungen nachvollziehbar dokumentieren (Datum in **Zuletzt geändert**, Kurznotiz im Eintrag).
8. Neue Einträge mit [Dokumentkopf-Standard](./templates/document-header.md) anlegen.

---

## Abgrenzung GA / GM

| | **GA** (Architecture) | **GM** (Model) |
|--|----------------------|----------------|
| Frage | Wie bauen wir technisch? | Was modellieren wir fachlich? |
| Ort | `docs/architecture/` | `docs/model/` |
| Beispiel | GA-001 Stammdaten vor Freitext | GM-003 Produkte nur über Governance |

Beide ID-Reihen sind **unabhängig nummeriert**. Verweise immer explizit mit Präfix.
