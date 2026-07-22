> **Hinweis:** Inhalte wurden nach [ideas/](../ideas/index.md) migriert. Maßgeblich ist der [Ideen-Index](../ideas/index.md).

# Greenkeeper-Ideenbuch

Sammlung fachlicher und produktbezogener Ideen. Jede Idee durchläuft den [Pflegeprozess](./README.md#pflegeprozess) im Playbook.

---

## Statusdefinitionen

| Status | Bedeutung |
|--------|-----------|
| **💡 Idee** | Erfasst, noch nicht fachlich bewertet oder in Klärung |
| **📋 Geplant** | Nutzen geklärt; in Roadmap oder als nächster Schritt vorgesehen |
| **🚧 In Umsetzung** | Aktiv in Entwicklung |
| **✅ Umgesetzt** | Im Produkt verfügbar (Ist-Zustand dokumentieren) |
| **⏸ Zurückgestellt** | Bewusst pausiert |
| **❌ Verworfen** | Bewusst abgelehnt – Begründung in *Entscheidungsnotiz* |

---

## Eintragsvorlage

Jeder Eintrag enthält:

- **ID** – fortlaufend `GK-###`
- **Titel**
- **Kategorie** – z. B. Maßnahmen, Geräte, Produkte, Integration, UX, Auswertung
- **Quelle** – Praxis, Facebook, Team, Cursor-Session …
- **Beschreibung**
- **Möglicher Nutzen**
- **Verknüpfungen** – GP-, GA-, andere GK-IDs, Roadmap-Abschnitt
- **Status**
- **Entscheidungsnotiz** – Verlauf, Datum, Begründung bei Statuswechsel

---

## GK-001 – Harnstoff 46 %: Dosierung und Anwendung

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Produkte / Rechner |
| **Quelle** | Praxisidee aus der Facebook-Gruppe „Rasenfanatiker“ |
| **Beschreibung** | Fachliche Klärung und Unterstützung bei Harnstoff 46 %: Granulat vs. flüssig, Blatt- vs. Bodenapplikation, Reinstickstoff vs. Produktmenge, Umrechnung g N/m² → g Produkt/m², Beregnung nach Anwendung. |
| **Möglicher Nutzen** | Korrekte Dosierung; weniger Fehlapplikation; Vertrauen in berechnete Werte |
| **Mögliche Funktionen** | Nährstoffrechner; Produktmengenrechner; fachliche Anwendungshinweise |
| **Verknüpfungen** | GP-011; GA-001; [product-governance.md](../product-governance.md) |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Im Ideenbuch aufgenommen. Noch keine Roadmap-Priorisierung. |

---

## GK-002 – Zentrale Geräteverwaltung

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Geräte |
| **Quelle** | Playbook / Fachmodell |
| **Beschreibung** | Geräte werden einmal angelegt (Stammdaten) und anschließend in Maßnahmen ausgewählt – statt bei jedem Eintrag neu zu tippen. |
| **Möglicher Nutzen** | GP-007, GP-008; konsistente Historie; Grundlage für GK-011 |
| **Verknüpfungen** | GK-003, GK-006, GK-007; GA-001, GA-003; Roadmap „Als Nächstes“ |
| **Status** | 📋 Geplant |
| **Entscheidungsnotiz** | 2026-07-21: Als nächster großer Block nach Geräte-Architektur-Entscheid geplant. |

---

## GK-003 – Mehrstufige Geräteklassifizierung

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Geräte |
| **Quelle** | Playbook / [greenkeeper-data-model.md](../greenkeeper-data-model.md) |
| **Beschreibung** | Allgemeine **Geräteart** plus fachlicher **Untertyp** – z. B. Geräteart: Mäher, Gerätetyp: Spindelmäher. |
| **Möglicher Nutzen** | Eindeutige Filter und Vorschläge; GP-012 |
| **Verknüpfungen** | GK-002; GA-003; Fachmodell „Gerätearten und Gerätetypen“ |
| **Status** | 📋 Geplant |
| **Entscheidungsnotiz** | 2026-07-21: Mit GK-002 und Roadmap verzahnt. |

---

## GK-004 – Filterbare Fach-Timelines

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Auswertung / UX |
| **Quelle** | Playbook |
| **Beschreibung** | Gemeinsame chronologische Timeline mit schnellen Filtern: Alle, Mähen, Düngen, Bewässern, Aerifizieren, Vertikutieren, Topdressen, weitere Maßnahmen. Gefilterte Ansichten zeigen **passende Kennzahlen und Zusammenfassungen** (nicht nur eine Liste). |
| **Möglicher Nutzen** | GP-009; schneller Überblick pro Maßnahmenart |
| **Verknüpfungen** | GK-005; GA-004; GP-009 |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Hohe fachliche Relevanz; nach Geräte- und Maßnahmen-Basis. |

---

## GK-005 – Konkrete Maßnahmen statt „mechanische Maßnahmen“

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Maßnahmen |
| **Quelle** | Fachmodell / Produktvision |
| **Beschreibung** | Eigenständige Maßnahmentypen: Aerifizieren, Spiken, Schlitzen, Lüften, Vertikutieren, Topdressen usw. – **kein** Sammelbegriff „mechanische Maßnahmen“. |
| **Möglicher Nutzen** | GP-012; korrekte Spracheingabe und Auswertung |
| **Verknüpfungen** | GA-006, GA-007; [greenkeeper-data-model.md](../greenkeeper-data-model.md) |
| **Status** | 📋 Geplant |
| **Entscheidungsnotiz** | 2026-07-21: Fachlich im Datenmodell verankert; technische Umsetzung (Parser, Enums) schrittweise. Teilweise bereits im MVP (generische Typen). |

---

## GK-006 – Basismaschinen und Anbaugeräte

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Geräte |
| **Quelle** | Fachmodell / Praxis |
| **Beschreibung** | **Basismaschine** (z. B. Cobra Fortis 17 E) mit optionalen **Anbaugeräten**: 5-/6-/10-Blatt-Spindel, Lüfterkassette, Vertikutierkassette, Bürste. |
| **Möglicher Nutzen** | Realistische Abbildung der Maschinennutzung; GK-011 |
| **Verknüpfungen** | GK-007; GA-003, GA-008; Fachmodell „Geräte“ |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Offene Fragen zu Datensätzen und Mehrfachzuordnung – siehe GA-008, Fachmodell. |

---

## GK-007 – Maschinen, Anbaugeräte und Handwerkzeuge

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Geräte |
| **Quelle** | Fachmodell |
| **Beschreibung** | Unterscheidung zwischen **Basismaschine**, **Anbaugerät**, **eigenständige Maschine** (z. B. Topdresser ohne Kassettensystem) und **Handwerkzeug** (Rasenspeer, Handspiker, Hohlspoons, Handstreuer). Nicht jedes Werkzeug ist eine eigenständige Maschine. |
| **Möglicher Nutzen** | GP-012; klare UX bei Geräteauswahl |
| **Verknüpfungen** | GK-006; GA-003; Fachmodell |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Mit GK-006 gemeinsam architektonisch entscheiden. |

---

## GK-008 – Wetterintegration

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Integration |
| **Quelle** | Playbook |
| **Beschreibung** | Aktuelle und prognostizierte Wetterdaten für Flächen und Maßnahmen. Mögliche Werte: Temperatur, Niederschlag, Wind, Luftfeuchtigkeit, Verdunstung, Frost, Sonneneinstrahlung. |
| **Möglicher Nutzen** | Kontext für Bewässerung, Düngung, Mähen; GP-010 optional |
| **Verknüpfungen** | GA-005; GP-010; Roadmap „Später prüfen“ |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Bewusst kein Kern-Blocker. |

---

## GK-009 – Hydrawise-Integration

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Integration / Bewässerung |
| **Quelle** | Playbook |
| **Beschreibung** | Lesen historischer und geplanter Bewässerungen über eine **offiziell erlaubte** Schnittstelle (Hydrawise). |
| **Möglicher Nutzen** | Automatische Bewässerungs-Maßnahmen; weniger manuelle Erfassung |
| **Verknüpfungen** | GK-008; GA-005; GP-010 |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: API-Verfügbarkeit, Lizenz und Datenschutz klären. |

---

## GK-010 – Sprachbasierte Detailergänzung

| Feld | Inhalt |
|------|--------|
| **Kategorie** | UX / Sprache |
| **Quelle** | Playbook |
| **Beschreibung** | Nach einer ersten Maßnahme (kompakte Zusammenfassung + Speichern) können **weitere Details** erneut per Sprache ergänzt werden – ohne den gesamten Eintrag neu zu erfassen. |
| **Möglicher Nutzen** | GP-003; schneller erster Einstieg, volle Detailtiefe optional |
| **Verknüpfungen** | GK-011; GP-006; Roadmap „Danach“ |
| **Status** | 📋 Geplant |
| **Entscheidungsnotiz** | 2026-07-21: Passt zu „Speichern + Details ergänzen“ in Roadmap. |

---

## GK-011 – Kontextgestützte Bestätigung

| Feld | Inhalt |
|------|--------|
| **Kategorie** | UX / Sprache |
| **Quelle** | GP-005 / GP-006 |
| **Beschreibung** | Greenkeeper wertet den **letzten passenden Vorgang** aus und fragt nüchtern zur Bestätigung, z. B.: „Gleicher Mäher und gleiche Schnitthöhe wie beim letzten Mal: Cobra Fortis 17 E und 22 mm?“ |
| **Möglicher Nutzen** | GP-004, GP-005, GP-006; weniger Tippen, hohe Trefferquote |
| **Verknüpfungen** | GK-002, GK-010; GA-002; GP-005 |
| **Status** | 📋 Geplant |
| **Entscheidungsnotiz** | 2026-07-21: Abhängig von Geräte-Stammdaten und stabiler Historie. |

---

## GK-012 – Produktgruppe Bodenhilfsstoffe

| Feld | Inhalt |
|------|--------|
| **Kategorie** | Produkte |
| **Quelle** | Fachmodell („Bodenhilfsstoffe ausbringen“) |
| **Beschreibung** | Bodenhilfsstoffe (Sand, Ton, Kalk, …) werden fachlich **neben Dünger** und weiteren Produktgruppen verwaltet – nicht als „Sonderfall Dünger“. |
| **Möglicher Nutzen** | GP-011; korrekte Governance und Rechner |
| **Verknüpfungen** | GK-005; [product-governance.md](../product-governance.md); Fachmodell Maßnahme „Bodenhilfsstoffe ausbringen“ |
| **Status** | 💡 Idee |
| **Entscheidungsnotiz** | 2026-07-21: Abstimmung mit Produkt-Kategorien in Governance offen. |

---

## Weitere Ideen (Platzhalter)

Neue Einträge fortlaufend als **GK-013** ff. anlegen. Nicht löschen – bei Verwerfung Status und Begründung setzen.
