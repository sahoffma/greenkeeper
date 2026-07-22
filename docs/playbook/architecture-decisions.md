> **Hinweis:** Inhalte wurden nach [architecture/](../architecture/index.md) migriert. Modellentscheidungen tragen das Präfix **GM-** (nicht GA-). Maßgeblich ist der [Architecture-Index](../architecture/index.md) für GA und der [Model-Index](../model/index.md) für GM.

# Greenkeeper-Architekturentscheidungen

Festgelegte und vorgeschlagene **GA-**Entscheidungen. Jede Entscheidung beeinflusst Datenmodell, API und UI.

**Hinweis:** Modellentscheidungen zum Domänenmodell tragen das Präfix **GM-** in [model/](../model/). **GA-** bezeichnet ausschließlich technische Architekturentscheidungen in [architecture/](../architecture/index.md).

---

## Eintragsvorlage

| Feld | Inhalt |
|------|--------|
| **Status** | 💡 Idee / 📋 Geplant / 🚧 In Umsetzung / ✅ Umgesetzt / ⏸ Zurückgestellt / ❌ Verworfen |
| **Kontext** | Problem oder Ausgangslage |
| **Entscheidung** | Was gilt? |
| **Begründung** | Warum? |
| **Konsequenzen** | Was folgt daraus für Modell, UI, Prozesse? |
| **Offene Fragen** | Was ist noch ungeklärt? |

---

## GA-001 – Stammdaten vor Freitext

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Freitext erschwert Auswertung, Vorschläge und Wiederverwendung (GP-007, GP-008). |
| **Entscheidung** | Flächen, Produkte, Geräte, Maßnahmentypen und standardisierte Einheiten werden als **Stammdaten** geführt. Freitext nur für Notizen und nicht modellierbare Details. |
| **Begründung** | Einmal erfassen, mehrfach nutzen; KI kann strukturiert zuordnen. |
| **Konsequenzen** | Geräte- und Produkttabellen; Referenzen in Maßnahmen; Product-Governance für offizielle Produkte. |
| **Offene Fragen** | Wie lange dürfen persönliche Freitext-Produktnamen parallel zu Stammdaten existieren? |

**Verknüpfungen:** GP-007, GP-008; GK-002; [product-governance.md](../product-governance.md)

---

## GA-002 – Historie bleibt stabil; Stammdaten werden deaktiviert statt gelöscht

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Gelöschte Geräte oder Produkte würden historische Maßnahmen entstellen oder brechen. |
| **Entscheidung** | Verwendete Stammdaten werden **bevorzugt deaktiviert** (nicht mehr zur Auswahl), nicht physisch gelöscht. Historische Maßnahmen behalten ihre Referenz oder den zum Zeitpunkt der Erfassung gültigen Anzeigenamen. |
| **Begründung** | GP-004; audit-fähige Historie; Vertrauen in das Journal. |
| **Konsequenzen** | Soft-Delete-/Active-Flags; UI filtert inaktive Einträge aus Auswahl; Timeline bleibt lesbar. |
| **Offene Fragen** | Anonymisierung vs. Deaktivierung bei Account-Löschung? |

**Verknüpfungen:** GP-004; GK-002

---

## GA-003 – Allgemeine Gerätekategorie plus fachlicher Untertyp

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | „Gerät“ allein ist zu grob; Mäher, Streuer und Sensoren haben unterschiedliche Attribute. |
| **Entscheidung** | Jedes Gerät erhält eine **Geräteart** (Mäher, Streuer, Sprühgerät, Bewässerung, Sensor, Sonstiges). Für **Mäher** zusätzlich optional einen **Gerätetyp** (Spindelmäher, Sichelmäher, Mähroboter, Handmäher, Aufsitzmäher, Rasentraktor). |
| **Begründung** | GP-012; GK-003; Filter und Vorschläge werden präziser. |
| **Konsequenzen** | Zwei Ebenen in Stammdaten; Parser/UX nutzen art-spezifische Felder (z. B. Schnitthöhe nur bei Mäher). |
| **Offene Fragen** | Brauchen andere Gerätearten eigene Untertypen (z. B. Streuer)? |

**Verknüpfungen:** GK-003; [greenkeeper-data-model.md](../greenkeeper-data-model.md) „Gerätearten und Gerätetypen“

---

## GA-004 – Gemeinsame Timeline mit unterschiedlichen fachlichen Sichten

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Getrennte Listen pro Maßnahmenart fragmentieren den Überblick. |
| **Entscheidung** | **Eine** chronologische Timeline pro Fläche; **Filter** erzeugen fachliche Sichten (Mähen, Düngen, …). Gefilterte Ansichten können **kategoriespezifische Kennzahlen** zeigen (GK-004). |
| **Begründung** | GP-009; ein Journal, viele Perspektiven. |
| **Konsequenzen** | Ein Activity-Datenkern; Filter-UI; optionale Aggregations-Views. |
| **Offene Fragen** | Welche Kennzahlen pro Filter sind MVP vs. später? |

**Verknüpfungen:** GK-004; GP-009

---

## GA-005 – Wetter, Bodenanalyse und Integrationen bleiben optionale Module

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Externe Daten und Integrationen erhöhen Komplexität und Abhängigkeiten. |
| **Entscheidung** | Wetter (GK-008), Hydrawise (GK-009), Bodenanalyse und vergleichbare Erweiterungen sind **optionale Module**. Kern-Journal funktioniert ohne sie (GP-010). |
| **Begründung** | Kein Blockieren der Kernnutzung; klare Erweiterungspfade. |
| **Konsequenzen** | Feature-Flags oder Berechtigungen; Maßnahmen ohne Wetterkontext speicherbar. |
| **Offene Fragen** | Wird Wetterkontext dennoch als optionaler Maßnahmen-Referenztyp modelliert (GA-008)? |

**Verknüpfungen:** GK-008, GK-009; GP-010

---

## GA-006 – Das Datenmodell orientiert sich an der tatsächlichen Arbeitsweise eines Greenkeepers

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Technische Enums und generische Kategorien passen nicht zur Praxis. |
| **Entscheidung** | Fachbegriffe und Abläufe **leiten** Schema, APIs und UI – nicht umgekehrt. Greenkeeper spricht von Aerifizieren, Topdressen, Spiken, Lüften – **nicht** von „mechanischen Maßnahmen“. |
| **Begründung** | GP-012; GP-002; Vertrauen der Zielgruppe. |
| **Konsequenzen** | [greenkeeper-data-model.md](../greenkeeper-data-model.md) als fachliche Referenz; schrittweise Anpassung der technischen Typen. |
| **Offene Fragen** | Mapping alter technischer Typen auf fachliche Maßnahmen bei Migration. |

**Verknüpfungen:** GK-005; GP-012; [GM-006](../model/gm-006.md)

---

## GA-007 – Konkrete Maßnahmen statt technischer Sammelkategorien

| Feld | Inhalt |
|------|--------|
| **Status** | ✅ Umgesetzt |
| **Kontext** | Sammelbegriffe wie „mechanische Maßnahme“ oder zu grobe Enums (`other`, `application`) verdecken die fachliche Realität. |
| **Entscheidung** | Maßnahmen werden als **konkrete Typen** modelliert und angezeigt (Mähen, Düngen, Aerifizieren, Spiken, Topdressen, …). Sammelkategorien sind in UI und Sprache **nicht** vorgesehen; statistische Gruppierung nur intern, falls überhaupt. |
| **Begründung** | GK-005; Spracheingabe und Auswertung brauchen klare Typen. |
| **Konsequenzen** | Parser-Erweiterung; Enum-/Typ-Erweiterung; Timeline-Filter nach fachlichen Namen. |
| **Offene Fragen** | Vollständige Liste vs. erweiterbare Typen; Umgang mit „Sonstige Maßnahme“. |

**Verknüpfungen:** GK-005; Fachmodell „Maßnahmentypen“

---

## GA-008 – Eine Maßnahme kann mehrere fachliche Referenzen besitzen

| Feld | Inhalt |
|------|--------|
| **Status** | 📋 Geplant |
| **Kontext** | Realität: eine Maßnahme betrifft oft mehrere Entitäten gleichzeitig. |
| **Entscheidung** | Eine Maßnahme kann **optional mehrere Referenzen** tragen, z. B.: Fläche, Produkt, Basismaschine, Anbaugerät oder Werkzeug, Wetterkontext (wenn Modul aktiv). |
| **Begründung** | GP-012; GK-006, GK-011; Abbildung von „Fortis + 6-Blatt-Spindel“ oder Düngung + Produkt. |
| **Konsequenzen** | Relationale Modellierung (mehrere FKs oder Junction); UI zeigt Zusammenfassung aller Referenzen; Parser füllt mehrere Slots. |
| **Offene Fragen** | Siehe Fachmodell: eigenständige Datensätze für Anbaugeräte? Mehrfach-Maschinen-Zuordnung? Gespeicherte Maschinen-Konfigurationen als Preset? Zwei FKs vs. Konfigurations-Entität? |

**Verknüpfungen:** GK-006, GK-007, GK-008; Fachmodell „Beziehungen Maßnahme ↔ Gerät ↔ Produkt“

---

## Übersicht

| ID | Kurztitel | Status |
|----|-----------|--------|
| GA-001 | Stammdaten vor Freitext | ✅ Umgesetzt |
| GA-002 | Deaktivieren statt löschen | ✅ Umgesetzt |
| GA-003 | Geräteart + Untertyp | ✅ Umgesetzt |
| GA-004 | Gemeinsame Timeline + Filter | ✅ Umgesetzt |
| GA-005 | Optionale Module | ✅ Umgesetzt |
| GA-006 | Arbeitsweise des Greenkeepers | ✅ Umgesetzt |
| GA-007 | Konkrete Maßnahmen | ✅ Umgesetzt |
| GA-008 | Mehrere Referenzen pro Maßnahme | 📋 Geplant |

---

## Abstimmung mit Produkt-Governance

Produkte folgen zusätzlich den technischen Regeln in [product-governance.md](../product-governance.md) (ein Schreibpfad, Review, Snapshots). Playbook-GA-001 und GA-002 gelten **fachlich** auch für Produkte; technische Umsetzung ist dort bereits spezifiziert.
