> **Hinweis:** Dieses Dokument wurde nach [ux-principles.md](./ux-principles.md) migriert. Der Inhalt bleibt vorübergehend zur Referenz erhalten – maßgeblich ist das Playbook-Dokument **UX-Prinzipien**.

# Greenkeeper-Produktprinzipien

Verbindliche Leitlinien für Produkt, UX und fachliche Modellierung. Bei Konflikten zwischen schneller Umsetzung und Prinzip gilt: **Prinzip klären oder bewusst als Ausnahme dokumentieren** (Ideenbuch + Architekturentscheidung).

---

## GP-001 – So einfach wie möglich. So intelligent wie nötig.

Greenkeeper reduziert Aufwand dort, wo Automatisierung und Kontext helfen – ohne Komplexität in die Oberfläche zu drücken.

- Der Standardfall muss in wenigen Schritten erledigt sein.
- Intelligenz (KI, Vorschläge, Berechnungen) erscheint **nur**, wenn sie einen erkennbaren Mehrwert liefert.
- Keine „Dashboard-Flut“ und keine Pflichtfelder ohne fachlichen Grund.

---

## GP-002 – Greenkeeper ist ein digitaler Greenkeeper und keine reine Dünger-App.

Greenkeeper dokumentiert **alle relevanten Rasenpflegemaßnahmen** – Mähen, Bewässern, Bodenbearbeitung, Ausbringung von Materialien, Proben und mehr.

- Düngen ist ein wichtiger, aber **nicht der einzige** Use Case.
- UI, Sprache und Datenmodell dürfen nicht implizit „nur Düngung“ suggerieren.

---

## GP-003 – Sprache ist perspektivisch der primäre Bedienmodus.

Nutzer beschreiben ihre Tätigkeit natürlich; Greenkeeper strukturiert.

- Spracheingabe ist der **bevorzugte Einstieg** für neue Maßnahmen.
- Manuelle Eingabe und Korrektur bleiben möglich – als Ergänzung, nicht als Ersatz für schlechte Erkennung.
- Der Nutzer soll seine Beschreibung **nicht wiederholen** müssen, wenn das System nachfragen oder ergänzen kann.

---

## GP-004 – Greenkeeper erinnert sich und nutzt vorhandene Historie.

Vergangene Maßnahmen, Geräte, Produkte und typische Werte sind **Kontext**, nicht Ballast.

- „Beim letzten Mal“ ist ein legitimer UX-Hebel.
- Historie unterstützt Vorschläge, Filter und Auswertungen – ohne den Nutzer zu überraschen.

---

## GP-005 – Greenkeeper fragt nüchtern und spekuliert sprachlich nicht.

Formulierungen sind sachlich und bestätigend – keine vermutenden oder emotional aufgeladenen Sätze.

**Nicht:**

> „Ich vermute, du hast wieder …“

**Sondern:**

> „Gleicher Mäher und gleiche Schnitthöhe wie beim letzten Mal: Cobra Fortis 17 E und 22 mm?“

---

## GP-006 – Vorhandene Informationen werden vorgeschlagen statt erneut abgefragt.

Wenn aus Historie oder Stammdaten ein plausibler Wert hervorgeht, wird er **angeboten** – nicht stillschweigend gesetzt, aber auch nicht ignoriert.

- Vorschläge sind editierbar und transparent.
- Fehlende Informationen werden gezielt nachgefragt, nicht pauschal alles abgefragt.

---

## GP-007 – Daten werden einmal erfasst und anschließend wiederverwendet.

Geräte, Produkte, Flächen und typische Kombinationen werden **zentral gepflegt** und in Maßnahmen referenziert.

- Kein erneutes Tippern des gleichen Produktnamens bei jedem Eintrag.
- Persönliche Nutzung ist sofort möglich; öffentliche Freigabe (Produkte) erfolgt separat über Governance.

---

## GP-008 – Stammdaten statt unnötigem Freitext.

Freitext ist für das, was strukturierte Felder nicht abbilden – nicht für Dinge, die als Stammdatum existieren sollten.

- Produkte, Geräte, Maßnahmentypen, Einheiten → strukturiert.
- Notizen für Beobachtungen, Abweichungen, Kontext.

---

## GP-009 – Greenkeeper zeigt nicht nur Daten, sondern beantwortet die naheliegende Frage hinter den Daten.

Auswertungen und Zusammenfassungen sollen **fachlich relevant** sein – nicht nur Listen.

- Timeline-Filter: nicht nur „Einträge anzeigen“, sondern passende Kennzahlen (z. B. letzte Schnitthöhe, kumulierte N-Dosis).
- Dashboard und Briefings orientieren sich an der Frage: *Was sollte ich als Greenkeeper als Nächstes wissen?*

---

## GP-010 – Optionale Module dürfen die Kernnutzung nicht blockieren.

Wetter, Integrationen (Hydrawise), Bodenanalyse, Wissensbasis und erweiterte Rechner sind **Erweiterungen**.

- Journal, Maßnahmen erfassen und Timeline müssen ohne diese Module voll nutzbar bleiben.
- Fehlende Integration darf keine leeren Pflichtschritte erzeugen.

---

## GP-011 – Produkte werden nach fachlicher Zusammensetzung und Anwendung beurteilt, nicht nach Marketingnamen.

NPK, Nährstoffbasis, Applikationsart und Dosierung sind wichtiger als Markenrhetorik.

- Produkt-Governance und Anzeige trennen **interne Sicherheit** von **Nutzer-Vertrauensanzeige** (siehe [product-governance.md](../product-governance.md)).
- Rechner und Hinweise (z. B. Reinstickstoff vs. Produktmenge) basieren auf **Zusammensetzung**, nicht auf Slogans.

---

## GP-012 – Die Sprache und Struktur orientieren sich an der tatsächlichen Arbeit eines Greenkeepers.

Fachbegriffe in UI, KI und Dokumentation entsprechen der Praxis:

- Aerifizieren, Topdressen, Spiken, Lüften – **nicht** „mechanische Maßnahmen“.
- Basismaschine, Anbaugerät, Handwerkzeug – **nicht** pauschal „Gerät“ ohne Rolle.

Details: [greenkeeper-data-model.md](../greenkeeper-data-model.md)
