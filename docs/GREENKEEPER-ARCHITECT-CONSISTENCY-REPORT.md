# Konsistenzbericht – Greenkeeper Architect (Kommunikation & Zusammenarbeit)

**Datum:** 2026-07-23  
**Auftrag:** Dokumentation an tatsächliche Arbeitsweise anpassen — Produktinhaber, Architect, Cursor; kein Team; positiver Kommunikationsstil; umsetzungsorientiert.

**Regel:** Keine neuen fachlichen Inhalte — nur sprachliche und strukturelle Anpassung.

---

## Zusammenfassung

Die Rolle des Greenkeeper Architect ist auf die **Zusammenarbeit mit einem Produktinhaber** ausgerichtet. Team-, Mehrzahl- und „wir“-Formulierungen in den Prozessdokumenten wurden entfernt oder präzisiert. Kommunikations- und Arbeitsweise des Architect sind eindeutig festgelegt.

---

## Geänderte Dokumente

| Datei | Änderungen |
|-------|------------|
| [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md) | Zusammenarbeit, Kommunikation, Arbeitsweise, Entscheidungsfrage, Arbeitsprinzipien, GPT-Instructions-Verweis |
| [PROJECT-HANDBOOK.md](./PROJECT-HANDBOOK.md) | Einleitung, Workflow, Rollen (Produktinhaber), Git-Abschnitt, Arbeitsprinzipien, praktischer Ablauf |
| [GPT-INSTRUCTIONS.md](./GPT-INSTRUCTIONS.md) | **Neu** (ersetzt GPT-DRAFT.md) — GPT-Instructions mit denselben Regeln |

**Nicht geändert:** [MANIFEST.md](./MANIFEST.md), GK/GA/GM/DL-Einzeleinträge, Playbook-Inhalte.

---

## Angepasste Formulierungen (Auswahl)

| Vorher | Nachher | Dokument |
|--------|---------|----------|
| „Welches Problem lösen **wir** wirklich?“ | „Welches Problem löst **diese Entscheidung** wirklich?“ | GREENKEEPER-ARCHITECT |
| Rollen ohne Solo-Kontext | Explizit: kein Entwicklungsteam; nur Produktinhaber + Architect + Cursor | GREENKEEPER-ARCHITECT |
| Kommunikation nur ehrlich/konstruktiv | Ergänzt: positiv, motivierend, lösungsorientiert; direkte Ansprache | GREENKEEPER-ARCHITECT |
| — | Neuer Abschnitt **Arbeitsweise** (umsetzungsorientiert) | GREENKEEPER-ARCHITECT |
| „für alle, die am Projekt arbeiten“ | Produktinhaber, Architect, Cursor — aktueller Stand | PROJECT-HANDBOOK |
| „für alle Beteiligten zugänglich“ | „dauerhaft und nachvollziehbar“ | PROJECT-HANDBOOK |
| „Mensch ↔ ChatGPT“ | „Produktinhaber ↔ Greenkeeper Architect“ | PROJECT-HANDBOOK |
| „### Mensch“ | „### Produktinhaber“ (alleiniger Entscheidungsträger) | PROJECT-HANDBOOK |
| „für das **Team** sichtbar“ | „nachvollziehbar versioniert“ | PROJECT-HANDBOOK |
| „gemeinsam definierten / entwickelten“ | „vom Produktinhaber und Architect abgestimmten“ | PROJECT-HANDBOOK |
| Git: „Zusammenarbeit“ als Bullet | entfernt (kein Team-Kontext) | PROJECT-HANDBOOK |

---

## Konsistenzprüfung

| Dokument | Team-Sprache | Produktinhaber | Kommunikationsstil | Umsetzungsfokus |
|----------|--------------|----------------|--------------------|-----------------|
| MANIFEST.md | ✅ „Wir“ = Produktvision (Greenkeeper als Marke), kein Dev-Team | — | — | — |
| GREENKEEPER-ARCHITECT.md | ✅ bereinigt | ✅ | ✅ | ✅ |
| GPT-INSTRUCTIONS.md | ✅ explizit verboten | ✅ Du-Ansprache | ✅ | ✅ |
| PROJECT-HANDBOOK.md | ✅ bereinigt | ✅ | ✅ (via Architect-Rolle) | ✅ (via Workflow) |

**Querverweise:** Manifest ↔ Architect ↔ Handbook ↔ GPT-INSTRUCTIONS sind konsistent verlinkt.

**MANIFEST.md:** „Wir möchten, dass Greenkeeper …“ bleibt unverändert — das ist **Produkt-/Markenperspektive**, keine Beschreibung der Entwicklungsorganisation.

---

## Empfehlungen für zukünftige Dokumente

1. **Prozessdocs** (Handbook, Architect, GPT): immer **Produktinhaber** statt „Mensch“, „Team“ oder „Mitwirkende“.
2. **Manifest & Vision:** „Wir“ nur für Greenkeeper als Produkt/Marke — nicht für die Entwicklungsstruktur.
3. **GPT-INSTRUCTIONS.md** (ehemals GPT-DRAFT.md): Bei Freigabe der GPT-Konfiguration als verbindliche Instruction im GPT Builder übernehmen.
4. **Neue Rollen:** Erst dokumentieren, wenn sie tatsächlich existieren — nicht vorwegnehmen.
5. **Cursor-Prompts:** Architect erstellt vollständige Prompts; Produktinhaber soll keine Platzhalter ersetzen müssen.
6. **README / Root-README:** Optional Verweis auf [GPT-INSTRUCTIONS.md](./GPT-INSTRUCTIONS.md) ergänzen.

---

## Fazit

Die Dokumentation beschreibt den **aktuellen Solo-Entwicklungsmodus** (Produktinhaber + Greenkeeper Architect + Cursor) konsistent. Kommunikationsstil und Arbeitsweise des Architect sind verbindlich festgelegt — in der fachlichen Spezifikation und im GPT-Entwurf.
