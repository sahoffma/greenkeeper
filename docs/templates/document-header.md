# Dokumentkopf (Standard)

Einheitlicher Metadatenblock für alle nummerierten Dokumente (**GK**, **GA**, **GM**, **DL**, **GP**, **CM**). Der Kopf steht **direkt unter** der `# ID`-Überschrift (bzw. unter `## GP-XXX` / `## CM-XXX` in Sammeldateien). Bestehende Abschnitte darunter bleiben unverändert.

---

## Pflichtfelder

| Feld | Beschreibung |
|------|--------------|
| **ID** | Eindeutige Kennung mit Präfix (z. B. GK-004) |
| **Titel** | Kurzer, prägnanter Titel |
| **Status** | Einer der [Statuswerte](../README.md#statusdefinitionen) |
| **Priorität** | Hoch / Mittel / Niedrig — oder `—`, wenn nicht zutreffend |
| **Erstellt** | ISO-Datum (YYYY-MM-DD) oder `—` bis bekannt |
| **Zuletzt geändert** | ISO-Datum oder `—` bis bekannt |
| **Verantwortlich** | Person/Rolle oder `—` bis zugewiesen |
| **Verwandte Dokumente** | Links zu GK-, GA-, GM-, DL-, GP-, CM-Einträgen (siehe [Verlinkungsregeln](../README.md#verlinkungsregeln)) |
| **Kurzbeschreibung** | Ein Satz; Inhalt aus bestehendem Text, nicht neu erfinden |

---

## Format (Markdown-Tabelle)

```markdown
# GK-XXX

| Feld | Wert |
|------|------|
| **ID** | GK-XXX |
| **Titel** | … |
| **Status** | 💡 Idee |
| **Priorität** | Mittel |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | … |
| **Kurzbeschreibung** | … |

---

## Titel
…
```

---

## Typ-spezifische Hinweise

| Typ | Ort | Status | Priorität |
|-----|-----|--------|-----------|
| **GK** | `docs/ideas/gk-XXX.md` | Pflicht | üblich |
| **GA** | `docs/architecture/ga-XXX.md` | Pflicht | üblich |
| **GM** | `docs/model/gm-XXX.md` | `—`, wenn kein Status geführt | `—` |
| **DL** | `docs/decisions/dl-XXX.md` | Pflicht | `—` |
| **GP** | `docs/playbook/ux-principles.md` | ✅ Umgesetzt (verbindlich) | `—` |
| **CM** | `docs/playbook/conversation-model.md` | ✅ Umgesetzt (verbindlich) | `—` |

---

## Vorlagen

| Typ | Template |
|-----|----------|
| GK | [ideas/templates/gk-template.md](../ideas/templates/gk-template.md) |
| GA | [architecture/templates/ga-template.md](../architecture/templates/ga-template.md) |
| GM | [model/gm-template.md](../model/gm-template.md) |
| DL | [decisions/templates/dl-template.md](../decisions/templates/dl-template.md) |
| GP | [playbook/templates/gp-template.md](../playbook/templates/gp-template.md) |
| CM | [playbook/templates/cm-template.md](../playbook/templates/cm-template.md) |

Neue Einträge mit [add-doc-headers.py](../../scripts/add-doc-headers.py) ergänzen oder Template manuell nutzen.
