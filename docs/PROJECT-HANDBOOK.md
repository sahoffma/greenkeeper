# Greenkeeper Project Handbook

Verbindliche Anleitung für den **Produktinhaber**, den **Greenkeeper Architect** und **Cursor** — die drei Rollen, mit denen Greenkeeper derzeit entwickelt wird.

Dieses Handbuch ist das **organisatorische und methodische Betriebssystem** des Projekts. Es ersetzt keine fachlichen Einzeldokumente (GK, GA, GM, DL, GP, CM), sondern beschreibt **wie** mit ihnen gearbeitet wird.

**Aktueller Projektstand:** Ein Produktinhaber trifft alle Entscheidungen. Der Greenkeeper Architect begleitet als strategischer Entwicklungspartner. Cursor übernimmt die technische Umsetzung im Repository. Es gibt derzeit kein Entwicklungsteam.

Verwandte Einstiege:

- [Greenkeeper Manifest](./MANIFEST.md) — höchste fachliche Referenz (Zweck, Werte, Vision, Leitprinzipien)
- [Current Project State](./CURRENT-STATE.md) — aktueller Entwicklungsstand (Einstieg für den Greenkeeper Architect)
- [Greenkeeper Architect](./GREENKEEPER-ARCHITECT.md) — Rolle und Arbeitsweise des KI-Entwicklungspartners
- [Dokumentations-Übersicht](./README.md) — Bereiche, ID-Präfixe, Status, Verlinkungsregeln
- [Playbook](./playbook/) — gültige Produktregeln
- [Fachmodell](./greenkeeper-data-model.md) — Entitäten und Beziehungen

---

## Greenkeeper Manifest – höchste fachliche Referenz

Das [Manifest](./MANIFEST.md) ist das **zentrale Leitdokument** des gesamten Greenkeeper-Projekts. Es bildet die Grundlage für Produktentwicklung, Architektur, Dokumentation und den [Greenkeeper Architect](./GREENKEEPER-ARCHITECT.md).

**Verbindlichkeit:**

- Alle **Produktentscheidungen** (GK, DL, GP, Playbook),
- alle **Architekturentscheidungen** (GA),
- alle **Modellentscheidungen** (GM),
- alle **Dokumentationsänderungen** und
- alle **KI-Empfehlungen** (CM, Conversation Model)

müssen mit dem Manifest **vereinbar** sein.

**Im Konfliktfall hat das Manifest Vorrang.** Abweichungen sind nur zulässig, wenn sie bewusst entschieden, im DL dokumentiert und mit dem Manifest in Einklang gebracht oder als bewusste Ausnahme begründet werden.

Prozess- und Methodenfragen regelt dieses Handbuch. Fachliche Leitlinien regelt das Manifest.

---

## Kapitel 1 – Projektphilosophie

Greenkeeper ist ein **langfristiges Softwareprodukt**. Es wird iterativ entwickelt, fachlich vertieft und technisch weitergebaut — nicht als kurzlebiges Experiment.

**Dokumentation ist Teil des Produkts.** Was nicht dokumentiert ist, gilt nicht als dauerhaft verbindlich. Code allein reicht nicht aus, um Produktentscheidungen, Begründungen und Zusammenhänge zu erhalten.

**Das Repository ist die einzige verbindliche Wissensquelle** (Single Source of Truth). Alle dauerhaften Regeln, Entscheidungen, Architektur- und Modellinformationen leben in `docs/`, im Playbook und in versionierten Quellcodedateien — nicht außerhalb des Repos.

**Chats dienen der Zusammenarbeit zwischen Produktinhaber und Greenkeeper Architect, nicht der dauerhaften Wissensspeicherung.** Diskussionen in ChatGPT oder Cursor sind wertvoll zur Klärung — aber erst die Übernahme ins Repository macht Wissen dauerhaft und nachvollziehbar.

---

## Kapitel 2 – Entwicklungsworkflow

Der typische Entwicklungsweg von der ersten Idee bis zum abgeschlossenen Schritt:

```
Idee
    ↓
Diskussion zwischen Produktinhaber und Greenkeeper Architect
    ↓
Einordnung:
    GK – Produktidee
    GA – Architektur
    GM – Domänenmodell
    DL – Entscheidung
    GP – Produktprinzip
    CM – Conversation Model
    ↓
Greenkeeper Architect erstellt einen vollständigen Cursor-Prompt
    ↓
Cursor aktualisiert die Dokumentation
    ↓
Cursor implementiert den Code
    ↓
Build prüfen
    ↓
Git Commit
    ↓
Git Push
    ↓
Abgeschlossen
```

**Grundregel:** Dokumentation und Code entwickeln sich **parallel**. Wer Code ändert, prüft in derselben Arbeitseinheit, ob Dokumentation betroffen ist — und umgekehrt.

**Hinweis zur Reihenfolge:** Bei größeren Themen wird zuerst eingeordnet und dokumentiert, dann implementiert. Bei kleinen, klar abgegrenzten Korrekturen kann die Dokumentation unmittelbar mit dem Code folgen — aber nicht erst Wochen später.

Ausführliche Status- und ID-Regeln: [docs/README.md](./README.md).

---

## Kapitel 3 – Rollen

### Produktinhaber

Verantwortlich für:

- Vision
- Produktstrategie
- Prioritäten
- Fachwissen
- Tests
- finale Entscheidungen
- finale Freigaben

Der Produktinhaber ist derzeit **alleiniger Entscheidungsträger**. Er entscheidet, **was** Greenkeeper sein soll und **wann** etwas umgesetzt wird.

---

### Greenkeeper Architect

Im Projektalltag übernimmt ein KI-Assistent (typischerweise ChatGPT) die Rolle des **Greenkeeper Architect**. Die verbindliche fachliche Spezifikation steht in [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md).

Verantwortlich für:

- Begleitung des Produktinhabers als strategischer Entwicklungspartner
- Produktarchitektur
- UX-Konzeption
- KI-Konzeption
- Qualitätsprüfung im Sinne des [Manifests](./MANIFEST.md)
- Erkennen dokumentationswürdiger Änderungen
- Einordnung in GK, GA, GM, DL, GP oder CM
- Erstellung vollständiger, sofort ausführbarer Cursor-Prompts
- Strukturierung von Ideen und Entscheidungen
- positive, motivierende und umsetzungsorientierte Kommunikation mit dem Produktinhaber

**Der Greenkeeper Architect schreibt keine Dateien direkt ins Repository.** Ergebnisse werden über Cursor (oder manuell durch den Produktinhaber) ins Repository übernommen.

Die GPT-Konfiguration des Greenkeeper Architect wird aus [MANIFEST.md](./MANIFEST.md), [PROJECT-HANDBOOK.md](./PROJECT-HANDBOOK.md), [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md) und [GPT-INSTRUCTIONS.md](./GPT-INSTRUCTIONS.md) abgeleitet.

---

### Cursor

Verantwortlich für:

- Implementierung
- Refactoring
- Dokumentationsänderungen
- Migrationen
- technische Umsetzung
- Dateierstellung
- Aktualisierung bestehender Dokumente
- Ausführung der vom Produktinhaber und Architect abgestimmten Änderungen

Cursor setzt die **abgestimmten Konzepte** um — im Code und in den Docs.

---

### Git / GitHub

Verantwortlich für:

- Versionsverwaltung
- Nachvollziehbarkeit
- Sicherung
- Historie
- Releases

Commits und Pushes machen Änderungen dauerhaft und nachvollziehbar versioniert.

---

### Repository

Das Repository ist die **einzige verbindliche Wissensquelle**.

Nicht ChatGPT.

Nicht Cursor.

Nicht einzelne Chats.

Alle dauerhaften Produktentscheidungen, Regeln und Architekturinformationen werden dort dokumentiert. Code und Dokumentation werden im selben Repository versioniert.

---

## Kapitel 4 – Dokumentationssystem

Greenkeeper nutzt nummerierte Dokumenttypen mit festen Präfixen. Jeder Typ hat einen eigenen Ort und Zweck.

| Präfix | Name | Ort |
|--------|------|-----|
| **GK** | Greenkeeper Idea | [ideas/](./ideas/) |
| **GA** | Greenkeeper Architecture | [architecture/](./architecture/) |
| **GM** | Greenkeeper Model | [model/](./model/) |
| **DL** | Decision Log | [decisions/](./decisions/) |
| **GP** | Greenkeeper Product Principle | [playbook/ux-principles.md](./playbook/ux-principles.md) |
| **CM** | Conversation Model | [playbook/conversation-model.md](./playbook/conversation-model.md) |

Neue Einträge folgen dem [Dokumentkopf-Standard](./templates/document-header.md).

---

### GK – Greenkeeper Idea

**Zweck:** Produktideen, mögliche Funktionen und fachliche Erweiterungen.

**Verwendung:** Wenn eine neue Idee entsteht, die noch bewertet, geplant oder umgesetzt werden muss.

Index: [ideas/index.md](./ideas/index.md)

---

### GA – Greenkeeper Architecture

**Zweck:** Technische Architektur, Systemgrenzen, Integrationen und grundlegende technische Strukturen.

**Verwendung:** Bei dauerhaften oder wesentlichen Architekturänderungen.

Index: [architecture/index.md](./architecture/index.md)

**Abgrenzung:** GA beschreibt **wie** das System aufgebaut ist. GM beschreibt **was** fachlich modelliert wird.

---

### GM – Greenkeeper Model

**Zweck:** Domänenmodell, Entitäten, Beziehungen und fachliche Datenstrukturen.

**Verwendung:** Wenn sich das fachliche Modell oder seine Beziehungen ändern.

Index: [model/index.md](./model/index.md) · Entitäten: [greenkeeper-data-model.md](./greenkeeper-data-model.md)

---

### DL – Decision Log

**Zweck:** Nachvollziehbare Dokumentation verbindlicher Entscheidungen — mit Begründung, Alternativen und Konsequenzen.

**Verwendung:** Wenn eine relevante Produkt-, Architektur- oder Prozessentscheidung getroffen wurde.

Index: [decisions/index.md](./decisions/index.md)

---

### GP – Greenkeeper Product Principle

**Zweck:** Dauerhafte Produkt- und UX-Prinzipien.

**Verwendung:** Wenn eine Regel nicht nur für ein einzelnes Feature, sondern für das gesamte Produkt gilt.

Ort: [playbook/ux-principles.md](./playbook/ux-principles.md)

---

### CM – Conversation Model

**Zweck:** Verhalten, Sprache und Logik des KI-Assistenten.

**Verwendung:** Wenn sich das Gesprächsverhalten oder die Interaktionslogik des Greenkeeper-Assistenten ändert.

Ort: [playbook/conversation-model.md](./playbook/conversation-model.md)

---

### Beziehungen zwischen Dokumenttypen

| Ausgang | Kann führen zu | Beispiel |
|---------|----------------|----------|
| GK | DL, GA, GM, GP | Idee wird entschieden (DL) und architektonisch verankert (GA) |
| DL | GA, GM, Playbook | Entscheidung erfordert Modell- oder Architekturanpassung |
| GA | GM, Code | Technische Umsetzung spiegelt fachliches Modell |
| Umsetzung | GK-Status, GA, GM | GK wechselt zu ✅ Umgesetzt; betroffene GA/GM prüfen |
| Dauerhafte UX-Regel | GP | Prinzip gilt produktweit, nicht nur für ein Feature |
| KI-Verhalten | CM | Dialogregeln für Spracheingabe und Bestätigung |

**Beispiele:**

- Eine **GK** kann nach einer Entscheidung zu einem **DL** führen.
- Eine Umsetzung kann Änderungen an **GA** oder **GM** erforderlich machen.
- Ein dauerhaftes UX-Prinzip kann als **GP** dokumentiert werden.
- Das Verhalten des KI-Assistenten wird im **CM** festgehalten.

Weitere Verlinkungsregeln: [docs/README.md – Verlinkungsregeln](./README.md#verlinkungsregeln).

**Spezialfall Produktdaten:** Offizielle Produktdaten folgen zusätzlich [product-governance.md](./product-governance.md) — technischer Governance-Workflow, ergänzend zu GM-003 und DL-003.

---

## Kapitel 5 – Definition of Done

Ein Entwicklungsschritt gilt erst als **abgeschlossen**, wenn alle **zutreffenden** Punkte erfüllt sind:

- [ ] Code implementiert (falls technische Änderung)
- [ ] relevante Dokumentation aktualisiert
- [ ] Verknüpfungen zwischen Dokumenten ergänzt
- [ ] Build erfolgreich
- [ ] notwendige Tests durchgeführt
- [ ] Git Commit erstellt
- [ ] Git Push erfolgt

**Nicht jeder Arbeitsschritt** benötigt zwangsläufig einen neuen GK-, GA-, GM-, DL-, GP- oder CM-Eintrag.

Es muss jedoch bei **jedem relevanten Schritt** geprüft werden, ob bestehende Dokumente aktualisiert oder neue Einträge erstellt werden müssen.

Eine Produktentscheidung gilt erst dann als vollständig abgeschlossen, wenn sie **dokumentiert und verknüpft** wurde (siehe [docs/README.md](./README.md)).

---

## Kapitel 6 – Arbeitsprinzipien

Verbindliche Regeln:

1. **Dokumentation ist Teil des Produkts.**
2. **Keine relevante Produktentscheidung bleibt undokumentiert.**
3. **Keine wesentliche Architekturänderung ohne Prüfung eines GA-Eintrags.**
4. **Keine wesentliche Modelländerung ohne Prüfung eines GM-Eintrags.**
5. **Keine größere Produktidee ohne Prüfung eines GK-Eintrags.**
6. **Verbindliche Entscheidungen werden im DL festgehalten.**
7. **Dauerhafte Produktprinzipien gehören ins Playbook beziehungsweise in GP.**
8. **Änderungen am Verhalten des KI-Assistenten werden im CM dokumentiert.**
9. **Das Repository ist die einzige dauerhafte Wissensquelle.**
10. **Chats dienen der Zusammenarbeit zwischen Produktinhaber und Architect, nicht der Archivierung.**
11. **Dokumentation und Code werden im selben Entwicklungsschritt gepflegt.**
12. **Bestehende Dokumente werden bevorzugt erweitert, bevor neue Kategorien entstehen.**
13. **Alle fachlichen Entscheidungen und Empfehlungen müssen mit dem [Manifest](./MANIFEST.md) vereinbar sein; im Konfliktfall gilt das Manifest.**

Verworfene Einträge werden **nicht gelöscht**, sondern mit Status **❌ Verworfen** und Begründung markiert.

---

## Kapitel 7 – Praktischer Arbeitsablauf

Täglicher Ablauf für typische Arbeit:

1. **Thema oder Idee besprechen** (Produktinhaber ↔ Greenkeeper Architect).
2. **Einordnen**, ob Dokumentation betroffen ist (GK / GA / GM / DL / GP / CM) — und ob die geplante Änderung mit dem [Manifest](./MANIFEST.md) vereinbar ist.
3. **Bestehende Dokumente prüfen** — erweitern statt duplizieren.
4. **Cursor-Prompt erstellen** — präzise, mit Dateipfaden und Regeln.
5. **Dokumentation und Code durch Cursor aktualisieren** lassen.
6. **Ergebnis prüfen** — fachlich, UX, Docs, Code.
7. **Build ausführen.**
8. **Git-Status kontrollieren.**
9. **Commit erstellen** — aussagekräftige Message.
10. **Push durchführen.**

**Hinweis:** Bei kleinen Änderungen darf der Ablauf verkürzt werden, solange **Dokumentation**, **Build** und **Versionsstand** weiterhin korrekt bleiben. Die Definition of Done bleibt maßgeblich — nur nicht jeder Schritt erfordert neue IDs.

---

## Supabase-Umgebungen (Dev / Production)

Greenkeeper trennt **Entwicklung** und **Production** strikt auf Supabase-Ebene.

| Umgebung | Zweck | Lokale `.env.local` |
|----------|--------|---------------------|
| **Dev** | Migrationen testen, RPC-/RLS-/E2E-Tests, lokale App | ✅ ja |
| **Production** | Live-Daten, kontrollierte Releases | ❌ nein |

**Verbindliche Regeln:**

1. Lokale Entwicklung nutzt **ausschließlich Dev**-URL und Dev-Keys in `.env.local`.
2. Production-Project-Ref `keoxzyzdkvebedgdswah` ist in Testskripten **gesperrt** (`scripts/supabaseEnvGuard.mjs`).
3. Schreibende Supabase-Tests erfordern zusätzlich `ALLOW_SUPABASE_WRITE_TESTS=true`.
4. Migrationen werden **zuerst in Dev** verifiziert, **danach** kontrolliert auf Production angewendet.
5. Production-Daten werden **nicht** in Dev kopiert, sofern nicht ausdrücklich erforderlich und datenschutzrechtlich unkritisch.
6. Service-Role-Keys gehören **niemals** in Client-Code (`VITE_`-Prefix verboten).

Siehe auch [README](../README.md#supabase-dev-und-production) und [GA-010](./architecture/ga-010.md).

---

## Kapitel 8 – Zukunft und Pflege

Das **PROJECT-HANDBOOK** ist ein lebendes Dokument.

- Es darf **erweitert** werden, wenn sich der Entwicklungsprozess dauerhaft verändert.
- **Neue Dokumenttypen** sollen nur eingeführt werden, wenn sie langfristig notwendig sind.
- **Bestehende Strukturen** sollen bevorzugt erweitert statt ersetzt werden.
- Änderungen an diesem Handbuch müssen **nachvollziehbar** und mit dem bestehenden Dokumentationssystem **konsistent** sein.

**Hierarchie bei Widersprüchen:**

| Ebene | Dokument | Gilt für |
|-------|----------|----------|
| 1 | [Manifest](./MANIFEST.md) | Fachliche Leitlinien, Werte, Vision, Produktphilosophie |
| 2 | GK, GA, GM, DL, GP, CM | Konkrete Entscheidungen und Regeln |
| 3 | PROJECT-HANDBOOK | Prozess, Rollen, Methodik |

Bei **fachlichen** Widersprüchen hat das **Manifest** Vorrang. Bei **Prozessfragen** gilt dieses Handbuch. Spezifischere Einträge (GK, DL, …) präzisieren das Manifest — sie dürfen es nicht unterlaufen.

---

## Anhang – Schnellreferenz

| Frage | Antwort |
|-------|---------|
| Wo liegt die höchste fachliche Referenz? | [MANIFEST.md](./MANIFEST.md) |
| Wer ist der KI-Entwicklungspartner? | [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md) |
| Wo leben Ideen? | [ideas/](./ideas/) (GK) |
| Wo lebt Architektur? | [architecture/](./architecture/) (GA) |
| Wo lebt das Domänenmodell? | [model/](./model/) (GM) + [Fachmodell](./greenkeeper-data-model.md) |
| Wo leben Entscheidungen? | [decisions/](./decisions/) (DL) |
| Wo leben UX-Prinzipien? | [ux-principles.md](./playbook/ux-principles.md) (GP) |
| Wo lebt KI-Dialog? | [conversation-model.md](./playbook/conversation-model.md) (CM) |
| Wann ist etwas fertig? | [Kapitel 5 – Definition of Done](#kapitel-5--definition-of-done) |
| Wie verlinke ich? | [README – Verlinkungsregeln](./README.md#verlinkungsregeln) |
