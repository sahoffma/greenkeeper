# Greenkeeper-Roadmap

Priorisierte fachliche und technische Schritte – **ohne konkrete Termine**. Status und Fortschritt werden im [Ideen-Index](../ideas/index.md) und [Architecture-Index](../architecture/index.md) nachgehalten.

Legende:

- **Aktuell** – läuft oder muss zuerst abgeschlossen werden
- **Als Nächstes** – nächster Umsetzungsblock nach „Aktuell“
- **Danach** – folgende Welle
- **Später prüfen** – bewusst nicht priorisiert

---

## Aktuell

| Thema | Beschreibung | Verknüpfungen |
|-------|--------------|---------------|
| Fachliches Playbook aufbauen und prüfen | Playbook-Struktur, Prinzipien, Ideen, GA, Roadmap; Abgleich mit Fachmodell | Playbook README |
| Geräte-Architektur abschließend entscheiden | GK-006, GK-007; GA-008; offene Fragen im [Fachmodell](../greenkeeper-data-model.md) | GK-006, GK-007, GA-008 |

---

## Als Nächstes

| Thema | Beschreibung | Verknüpfungen |
|-------|--------------|---------------|
| Zentrale Geräteverwaltung | Stammdaten anlegen, in Maßnahmen auswählen | GK-002, GA-001 |
| Geräteart und Gerätetyp | GA-003 umsetzen (Mäher-Untertypen zuerst) | GK-003, GA-003 |
| Entscheidung Basismaschine + Anbaugeräte | GA-008 finalisieren; Datenmodell festziehen | GK-006, GA-008 |
| Geräteauswahl bei Maßnahmen | Referenz Basismaschine / Anbaugerät / Handwerkzeug | GK-002, GK-007 |
| Kompakte Maßnahmenzusammenfassung | Nach Spracheingabe: Zusammenfassung mit **Speichern** und **Details ergänzen** | GK-010, GP-003 |
| Konkrete Maßnahmentypen (technisch) | Parser und Speicher an Fachmodell annähern | GK-005, GA-007 |

---

## Danach

| Thema | Beschreibung | Verknüpfungen |
|-------|--------------|---------------|
| Details per Sprache ergänzen | Nachträgliche Spracheingabe für bestehende Maßnahme | GK-010 |
| Letzten passenden Vorgang auswerten | Historie für Vorschläge nutzen | GK-011, GA-002 |
| Werte nüchtern zur Bestätigung vorschlagen | GP-005, GP-006 in UI | GK-011, GP-005 |
| Timeline-Filter | Fachfilter auf gemeinsamer Timeline | GK-004, GA-004 |
| Kategoriespezifische Timeline-Zusammenfassungen | Kennzahlen pro Filter | GK-004, GP-009 |

---

## Später prüfen

| Thema | Beschreibung | Verknüpfungen |
|-------|--------------|---------------|
| Wetterintegration | Externe Wetterdaten, optional | GK-008, GA-005 |
| Hydrawise | Bewässerungshistorie, offizielle API | GK-009, GA-005 |
| Bodenanalyse | Proben, Laborwerte, Auswertung | GA-005; Fachmodell „Bodenprobe“ |
| Wissensbasis | Fachliche Inhalte (z. B. GK-001 Harnstoff) | GK-001 |
| Gerätewartung | Wartungsintervalle, Stunden, Kosten | — |
| Externe Geräte- und Sensordaten | IoT, Bodensensoren | GA-005; Geräteart Sensor |

---

## Bereits umgesetzt (Auszug, Ist-Stand)

Dient der ehrlichen Trennung von **Ziel** und **Ist** (GP Playbook-Regeln). Nicht vollständig – bei Umsetzung ergänzen.

| Bereich | Stand | Hinweis |
|---------|--------|---------|
| Maßnahmen-Journal (Basis) | teilweise | Spracheingabe, KI-Erkennung, Zusammenfassung für Teilmenge der Maßnahmentypen |
| Product-Learn-Assistent | umgesetzt | Unbekannte Produkte; Governance-Submission |
| Product-Governance V2 | umgesetzt | Siehe [product-governance.md](../product-governance.md) |
| Geräteverwaltung | nicht umgesetzt | GK-002 geplant |
| Timeline-Filter | nicht umgesetzt | GK-004 |
| Wetter / Hydrawise | nicht umgesetzt | optional |

---

## Roadmap-Pflege

- Verschiebungen zwischen Abschnitten im Ideenbuch (*Entscheidungsnotiz*) begründen.
- Neue Cursor-Prompts nennen die betroffenen **GK-** und **GA-**IDs.
- Nach Abschluss eines Blocks: Status in [ideas/index.md](../ideas/index.md) auf **✅ Umgesetzt** setzen und Ist-Tabelle oben aktualisieren.
