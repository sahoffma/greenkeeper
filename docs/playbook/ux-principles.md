# UX-Prinzipien

Verbindliche Leitlinien für Produkt, UX und fachliche Modellierung (GP-001 ff.). Bei Konflikten zwischen schneller Umsetzung und Prinzip gilt: **Prinzip klären oder bewusst als Ausnahme dokumentieren** – als [GK-Idee](../ideas/index.md), [GA-Architekturentscheidung](../architecture/index.md) oder [DL-Produktentscheidung](../decisions/index.md).

---

## GP-001 – So einfach wie möglich. So intelligent wie nötig.

| Feld | Wert |
|------|------|
| **ID** | GP-001 |
| **Titel** | So einfach wie möglich. So intelligent wie nötig. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper reduziert Aufwand dort, wo Automatisierung und Kontext helfen – ohne Komplexität in die Oberfläche zu drücken. |

---


Greenkeeper reduziert Aufwand dort, wo Automatisierung und Kontext helfen – ohne Komplexität in die Oberfläche zu drücken.

- Der Standardfall muss in wenigen Schritten erledigt sein.
- Intelligenz (KI, Vorschläge, Berechnungen) erscheint **nur**, wenn sie einen erkennbaren Mehrwert liefert.
- Keine „Dashboard-Flut“ und keine Pflichtfelder ohne fachlichen Grund.

---

## GP-002 – Greenkeeper ist ein digitaler Greenkeeper und keine reine Dünger-App.

| Feld | Wert |
|------|------|
| **ID** | GP-002 |
| **Titel** | Greenkeeper ist ein digitaler Greenkeeper und keine reine Dünger-App. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper dokumentiert **alle relevanten Rasenpflegemaßnahmen** – Mähen, Bewässern, Bodenbearbeitung, Ausbringung von Materialien, Proben und mehr. |

---


Greenkeeper dokumentiert **alle relevanten Rasenpflegemaßnahmen** – Mähen, Bewässern, Bodenbearbeitung, Ausbringung von Materialien, Proben und mehr.

- Düngen ist ein wichtiger, aber **nicht der einzige** Use Case.
- UI, Sprache und Datenmodell dürfen nicht implizit „nur Düngung“ suggerieren.

---

## GP-003 – Sprache ist perspektivisch der primäre Bedienmodus.

| Feld | Wert |
|------|------|
| **ID** | GP-003 |
| **Titel** | Sprache ist perspektivisch der primäre Bedienmodus. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Nutzer beschreiben ihre Tätigkeit natürlich; Greenkeeper strukturiert. |

---


Nutzer beschreiben ihre Tätigkeit natürlich; Greenkeeper strukturiert.

- Spracheingabe ist der **bevorzugte Einstieg** für neue Maßnahmen.
- Manuelle Eingabe und Korrektur bleiben möglich – als Ergänzung, nicht als Ersatz für schlechte Erkennung.
- Der Nutzer soll seine Beschreibung **nicht wiederholen** müssen, wenn das System nachfragen oder ergänzen kann.

---

## GP-004 – Greenkeeper erinnert sich und nutzt vorhandene Historie.

| Feld | Wert |
|------|------|
| **ID** | GP-004 |
| **Titel** | Greenkeeper erinnert sich und nutzt vorhandene Historie. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Vergangene Maßnahmen, Geräte, Produkte und typische Werte sind **Kontext**, nicht Ballast. |

---


Vergangene Maßnahmen, Geräte, Produkte und typische Werte sind **Kontext**, nicht Ballast.

- „Beim letzten Mal“ ist ein legitimer UX-Hebel.
- Historie unterstützt Vorschläge, Filter und Auswertungen – ohne den Nutzer zu überraschen.

---

## GP-005 – Greenkeeper fragt nüchtern und spekuliert sprachlich nicht.

| Feld | Wert |
|------|------|
| **ID** | GP-005 |
| **Titel** | Greenkeeper fragt nüchtern und spekuliert sprachlich nicht. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Formulierungen sind sachlich und bestätigend – keine vermutenden oder emotional aufgeladenen Sätze. |

---


Formulierungen sind sachlich und bestätigend – keine vermutenden oder emotional aufgeladenen Sätze.

**Nicht:**

> „Ich vermute, du hast wieder …“

**Sondern:**

> „Gleicher Mäher und gleiche Schnitthöhe wie beim letzten Mal: Cobra Fortis 17 E und 22 mm?“

---

## GP-006 – Vorhandene Informationen werden vorgeschlagen statt erneut abgefragt.

| Feld | Wert |
|------|------|
| **ID** | GP-006 |
| **Titel** | Vorhandene Informationen werden vorgeschlagen statt erneut abgefragt. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Wenn aus Historie oder Stammdaten ein plausibler Wert hervorgeht, wird er **angeboten** – nicht stillschweigend gesetzt, aber auch nicht ignoriert. |

---


Wenn aus Historie oder Stammdaten ein plausibler Wert hervorgeht, wird er **angeboten** – nicht stillschweigend gesetzt, aber auch nicht ignoriert.

- Vorschläge sind editierbar und transparent.
- Fehlende Informationen werden gezielt nachgefragt, nicht pauschal alles abgefragt.

---

## GP-007 – Daten werden einmal erfasst und anschließend wiederverwendet.

| Feld | Wert |
|------|------|
| **ID** | GP-007 |
| **Titel** | Daten werden einmal erfasst und anschließend wiederverwendet. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Geräte, Produkte, Flächen und typische Kombinationen werden **zentral gepflegt** und in Maßnahmen referenziert. |

---


Geräte, Produkte, Flächen und typische Kombinationen werden **zentral gepflegt** und in Maßnahmen referenziert.

- Kein erneutes Tippern des gleichen Produktnamens bei jedem Eintrag.
- Persönliche Nutzung ist sofort möglich; öffentliche Freigabe (Produkte) erfolgt separat über Governance.

---

## GP-008 – Stammdaten statt unnötigem Freitext.

| Feld | Wert |
|------|------|
| **ID** | GP-008 |
| **Titel** | Stammdaten statt unnötigem Freitext. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Freitext ist für das, was strukturierte Felder nicht abbilden – nicht für Dinge, die als Stammdatum existieren sollten. |

---


Freitext ist für das, was strukturierte Felder nicht abbilden – nicht für Dinge, die als Stammdatum existieren sollten.

- Produkte, Geräte, Maßnahmentypen, Einheiten → strukturiert.
- Notizen für Beobachtungen, Abweichungen, Kontext.

---

## GP-009 – Greenkeeper zeigt nicht nur Daten, sondern beantwortet die naheliegende Frage hinter den Daten.

| Feld | Wert |
|------|------|
| **ID** | GP-009 |
| **Titel** | Greenkeeper zeigt nicht nur Daten, sondern beantwortet die naheliegende Frage hinter den Daten. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Auswertungen und Zusammenfassungen sollen **fachlich relevant** sein – nicht nur Listen. |

---


Auswertungen und Zusammenfassungen sollen **fachlich relevant** sein – nicht nur Listen.

- Timeline-Filter: nicht nur „Einträge anzeigen“, sondern passende Kennzahlen (z. B. letzte Schnitthöhe, kumulierte N-Dosis).
- Dashboard und Briefings orientieren sich an der Frage: *Was sollte ich als Greenkeeper als Nächstes wissen?*

---

## GP-010 – Optionale Module dürfen die Kernnutzung nicht blockieren.

| Feld | Wert |
|------|------|
| **ID** | GP-010 |
| **Titel** | Optionale Module dürfen die Kernnutzung nicht blockieren. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | [Onboarding](./onboarding.md); [DL-001](../decisions/dl-001.md) |
| **Kurzbeschreibung** | Wetter, Integrationen (Hydrawise), Bodenanalyse, Wissensbasis und erweiterte Rechner sind **Erweiterungen**. |

---


Wetter, Integrationen (Hydrawise), Bodenanalyse, Wissensbasis und erweiterte Rechner sind **Erweiterungen**.

- Journal, Maßnahmen erfassen und Timeline müssen ohne diese Module voll nutzbar sein.
- Fehlende Integration darf keine leeren Pflichtschritte erzeugen.

Siehe auch [Onboarding](./onboarding.md) und [DL-001](../decisions/dl-001.md).

---

## GP-011 – Produkte werden nach fachlicher Zusammensetzung und Anwendung beurteilt, nicht nach Marketingnamen.

| Feld | Wert |
|------|------|
| **ID** | GP-011 |
| **Titel** | Produkte werden nach fachlicher Zusammensetzung und Anwendung beurteilt, nicht nach Marketingnamen. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | [product-governance.md](../product-governance.md) |
| **Kurzbeschreibung** | NPK, Nährstoffbasis, Applikationsart und Dosierung sind wichtiger als Markenrhetorik. |

---


NPK, Nährstoffbasis, Applikationsart und Dosierung sind wichtiger als Markenrhetorik.

- Produkt-Governance und Anzeige trennen **interne Sicherheit** von **Nutzer-Vertrauensanzeige** (siehe [product-governance.md](../product-governance.md)).
- Rechner und Hinweise (z. B. Reinstickstoff vs. Produktmenge) basieren auf **Zusammensetzung**, nicht auf Slogans.

---

## GP-012 – Die Sprache und Struktur orientieren sich an der tatsächlichen Arbeit eines Greenkeepers.

| Feld | Wert |
|------|------|
| **ID** | GP-012 |
| **Titel** | Die Sprache und Struktur orientieren sich an der tatsächlichen Arbeit eines Greenkeepers. |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | [greenkeeper-data-model.md](../greenkeeper-data-model.md) |
| **Kurzbeschreibung** | Fachbegriffe in UI, KI und Dokumentation entsprechen der Praxis: |

---


Fachbegriffe in UI, KI und Dokumentation entsprechen der Praxis:

- Aerifizieren, Topdressen, Spiken, Lüften – **nicht** „mechanische Maßnahmen“.
- Basismaschine, Anbaugerät, Handwerkzeug – **nicht** pauschal „Gerät“ ohne Rolle.

Details: [greenkeeper-data-model.md](../greenkeeper-data-model.md)
