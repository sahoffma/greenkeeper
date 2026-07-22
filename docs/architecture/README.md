# Greenkeeper Architecture

Hier werden **technische Grundsatzentscheidungen** dokumentiert. Jede Entscheidung erhält eine eindeutige **GA-ID** (Greenkeeper Architecture).

Architekturentscheidungen beeinflussen Datenmodell, API, Infrastruktur und UI-Struktur. Sie beschreiben **wie** das System aufgebaut ist.

**Abgrenzung:** Fachliche Modellentscheidungen zum Domänenmodell tragen das Präfix **GM-** und liegen in [model/](../model/). Das [Fachmodell](../greenkeeper-data-model.md) beschreibt Entitäten und Beziehungen.

---

## Einträge

| Ressource | Zweck |
|-----------|--------|
| [Index](./index.md) | Übersicht aller GA-Einträge |
| [Template](./templates/ga-template.md) | Vorlage für neue Architekturentscheidungen |
| [Dokumentkopf-Standard](../templates/document-header.md) | Einheitlicher Metadatenblock |

---

## Status

Verbindliche Taxonomie (siehe [docs/README.md](../README.md)):

| Status | Bedeutung für GA |
|--------|------------------|
| 💡 Idee | Vorgeschlagen, noch nicht verbindlich |
| 📋 Geplant | Entscheidung in Klärung / Entwurf |
| 🚧 In Umsetzung | Entscheidung getroffen, technische Umsetzung läuft |
| ✅ Umgesetzt | Entscheidung verbindlich; gilt für neue Implementierung |
| ⏸ Zurückgestellt | Bewusst pausiert |
| ❌ Verworfen | Obsolet; Nachfolger verlinken |

---

## Priorität

| Priorität | Bedeutung |
|-----------|-----------|
| **Hoch** | Blockiert oder prägt Kernfunktionen |
| **Mittel** | Wichtig, aber schrittweise umsetzbar |
| **Niedrig** | Ergänzend oder später relevant |

---

## Pflege

1. Neue technische Grundsatzentscheidung → GA-ID vergeben, [Template](./templates/ga-template.md) nutzen.
2. [Index](./index.md) aktualisieren.
3. Verwandte GK-, GM-, DL- und Playbook-Einträge verlinken.
4. Bei Ersetzung Status **❌ Verworfen** setzen und Nachfolger benennen.
