# Greenkeeper Model

Hier werden **fachliche Modellentscheidungen** zum Domänenmodell dokumentiert. Jede Entscheidung erhält eine eindeutige **GM-ID** (Greenkeeper Model).

**GM** beschreibt ausschließlich das **fachliche Domänenmodell**: Was modellieren wir in der Greenkeeper-Praxis?

**GA** ([Architecture](../architecture/)) beschreibt ausschließlich **technische Architekturentscheidungen**: Wie bauen wir das System?

Beide ID-Reihen sind **unabhängig nummeriert**. Verweise immer explizit mit Präfix.

---

## Einträge

| Ressource | Zweck |
|-----------|--------|
| [Index](./index.md) | Übersicht aller GM-Einträge |
| [Template](./gm-template.md) | Vorlage für neue Modellentscheidungen |
| [Dokumentkopf-Standard](../templates/document-header.md) | Einheitlicher Metadatenblock |
| [Fachmodell](../greenkeeper-data-model.md) | Entitäten, Beziehungen, Maßnahmentypen, Geräte |

---

## Pflege

1. Neue fachliche Modellentscheidung → GM-ID vergeben, [Template](./gm-template.md) nutzen.
2. [Index](./index.md) und ggf. [Fachmodell](../greenkeeper-data-model.md) aktualisieren.
3. Verwandte GK-, GA-, DL- und Playbook-Einträge verlinken.
4. Bei Ersetzung Begründung dokumentieren – Einträge nicht stillschweigend löschen.

---

## Abgrenzung GM / GA

| | **GM** (Model) | **GA** (Architecture) |
|--|----------------|----------------------|
| Frage | Was modellieren wir fachlich? | Wie bauen wir technisch? |
| Ort | `docs/model/` | `docs/architecture/` |
| Beispiel | GM-003 Produkte nur über Governance | GA-001 Stammdaten vor Freitext |

Siehe auch [docs/README.md](../README.md).
