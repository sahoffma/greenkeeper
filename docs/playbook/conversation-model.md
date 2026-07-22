# Greenkeeper Conversation Model

## Ziel

Dieses Dokument beschreibt die **fachlichen Regeln**, nach denen Greenkeeper Sprache interpretiert.

Es beschreibt ausdrücklich **keine technische Umsetzung** – keine Parser, keine Datenbank, keine UI-Komponenten, keine API.

Es beschreibt ausschließlich das **gewünschte Benutzererlebnis** und die **fachlichen Regeln** für den Dialog zwischen Nutzer und Greenkeeper.

Verwandte Dokumente:

- [UX-Prinzipien](./ux-principles.md) – GP-003 bis GP-006, GP-012
- [Architecture-Index](../architecture/index.md) – GA-004, GA-006, GA-008
- [Fachliches Datenmodell](../greenkeeper-data-model.md) – Maßnahmen, Flächen, Geräte

**ID-Präfix:** **CM-** (Conversation Model)

---

## CM-001 – Greenkeeper verarbeitet Arbeitsberichte

| Feld | Wert |
|------|------|
| **ID** | CM-001 |
| **Titel** | Greenkeeper verarbeitet Arbeitsberichte |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper verarbeitet **Arbeitsberichte** – nicht einzelne Formularfelder. |

---


Greenkeeper verarbeitet **Arbeitsberichte** – nicht einzelne Formularfelder.

**Nicht:**

```
Sprache → Formular
```

**Sondern:**

```
Sprache
    ↓
Arbeitsbericht
    ↓
fachliches Verständnis
    ↓
eine oder mehrere Maßnahmen
    ↓
Journal
```

Der Nutzer erzählt, was er getan hat. Greenkeeper **versteht** den Bericht fachlich und **leitet** daraus eine oder mehrere dokumentierbare Maßnahmen ab. Die Strukturierung dient dem Journal – nicht umgekehrt.

---

## CM-002 – Eine Spracheingabe kann mehrere Maßnahmen enthalten

| Feld | Wert |
|------|------|
| **ID** | CM-002 |
| **Titel** | Eine Spracheingabe kann mehrere Maßnahmen enthalten |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | **Eine Spracheingabe besitzt keine feste 1:1-Beziehung zu einer Maßnahme.** |

---


**Eine Spracheingabe besitzt keine feste 1:1-Beziehung zu einer Maßnahme.**

Eine einzelne Äußerung kann null, eine oder mehrere Maßnahmen beschreiben. Greenkeeper zerlegt den Arbeitsbericht in **einzelne fachliche Maßnahmen**, sofern der Inhalt das hergibt.

### Beispiele

**„Ich habe heute gemäht.“**

→ **1 Maßnahme** (Mähen)

---

**„Ich habe heute gemäht und gedüngt.“**

→ **2 Maßnahmen** (Mähen, Düngen)

---

**„Ich habe beide Flächen gemäht.“**

→ **2 Maßnahmen** (Mähen auf Fläche A, Mähen auf Fläche B)

---

**„Ich habe den Vorgarten aerifiziert, anschließend topgedresst und danach bewässert.“**

→ **3 Maßnahmen** (Aerifizieren, Topdressen, Bewässern)

---

### Fachliche Regel

- Jede erkannte Maßnahme ist eine **eigenständige fachliche Einheit** im Journal.
- Die ursprüngliche Spracheingabe bleibt als **Gesamtbericht** erhalten (Kontext), auch wenn daraus mehrere Maßnahmen werden.
- Unklare Grenzen zwischen Maßnahmen werden **nicht** durch Spekulation gezogen, sondern durch gezielte, maßnahmenbezogene Rückfragen geklärt (siehe CM-004).

---

## CM-003 – Greenkeeper nutzt Kontext

| Feld | Wert |
|------|------|
| **ID** | CM-003 |
| **Titel** | Greenkeeper nutzt Kontext |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper nutzt **bekannten Kontext** aus Historie, Stammdaten und vorherigen Einträgen – ohne den Nutzer alles erneut eingeben zu lassen. |

---


Greenkeeper nutzt **bekannten Kontext** aus Historie, Stammdaten und vorherigen Einträgen – ohne den Nutzer alles erneut eingeben zu lassen.

### Beispiel

**Nutzer:** „Alles wie gehabt.“

**Greenkeeper ergänzt** (aus Kontext, zur Bestätigung):

- bekannte Fläche
- bekanntes Gerät
- bekannte Schnitthöhe
- bekannte Produkte

Der Nutzer muss nicht erneut alles diktieren. Ergänzungen basieren auf **zuvor dokumentierten** oder **eindeutig zuordenbaren** Informationen – nicht auf Vermutungen (siehe CM-006).

---

## CM-004 – Rückfrageregeln

| Feld | Wert |
|------|------|
| **ID** | CM-004 |
| **Titel** | Rückfrageregeln |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | ### Regel 1 – Nur zur genannten Maßnahme nachfragen |

---


### Regel 1 – Nur zur genannten Maßnahme nachfragen

Greenkeeper fragt **ausschließlich** im Kontext der **gerade erkannten oder bearbeiteten Maßnahme** nach – nicht vorausschauend zu anderen Tätigkeiten.

**Nutzer:** „Ich habe heute gemäht.“

**Erlaubte Rückfrage:**

> „Wieder Hauptfläche mit dem Cobra Fortis 17 E auf 21 mm?“

**Nicht erlaubt:**

> „Hast du danach noch gedüngt?“

Rückfragen zu Maßnahmen, die **nicht** im Arbeitsbericht vorkamen, sind unzulässig – auch wenn sie fachlich plausibel wären.

---

### Regel 2 – Nur fehlende Informationen abfragen

Bereits genannte oder aus Kontext eindeutig ableitbare Informationen werden **nicht** erneut abgefragt.

---

### Regel 3 – Je vollständiger die Aussage, desto weniger Rückfragen

Eine ausführliche, klare Aussage führt zu **weniger** Dialog. Kurze Aussagen dürfen mehr Nachfragen erfordern (siehe CM-008).

---

### Regel 4 – Lieber weniger speichern als den Nutzer mit Rückfragen nerven

> **Besonders hervorgehoben:** Wenn Informationen fehlen und eine Rückfrage den Flow unnötig belasten würde, speichert Greenkeeper **lieber einen unvollständigen, aber ehrlichen Eintrag** (mit transparentem Hinweis auf fehlende Felder), statt den Nutzer durch viele Einzelfragen zu drängen.

Der Nutzer kann später **Details ergänzen** (siehe CM-005, GK-010). Vollständigkeit ist erwünscht, **Zumutbarkeit** hat Vorrang vor Perfektion in einem Durchgang.

---

## CM-005 – Zusammenfassung vor dem Speichern

| Feld | Wert |
|------|------|
| **ID** | CM-005 |
| **Titel** | Zusammenfassung vor dem Speichern |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper zeigt **keine Formulare** als ersten Schritt nach der Auswertung. |

---


Greenkeeper zeigt **keine Formulare** als ersten Schritt nach der Auswertung.

Stattdessen eine **kompakte Zusammenfassung** des verstandenen Arbeitsberichts – pro erkannte Maßnahme oder als Gesamtübersicht.

### Beispiel

**Nutzer:**

> „Ich habe heute beide Flächen gemäht. Alles wie gehabt.“

**Greenkeeper:**

```
2 Maßnahmen erkannt.

✓ Hauptfläche
  · Cobra Fortis 17 E
  · 21 mm

✓ Fläche unter dem Nussbaum
  · Sichelmäher
  · 45 mm
```

**Aktionen:**

| Button | Bedeutung |
|--------|-----------|
| **Speichern** | Erkannte Maßnahmen ins Journal übernehmen |
| **Details ergänzen** | Weitere Angaben per Sprache oder gezielter Korrektur – ohne den Bericht von vorn zu beginnen |

Formularfelder existieren **hinter** „Details ergänzen“ oder zur Korrektur – nicht als Standard-Einstieg nach der Spracheingabe.

---

## CM-006 – Greenkeeper ergänzt, er erfindet nichts

| Feld | Wert |
|------|------|
| **ID** | CM-006 |
| **Titel** | Greenkeeper ergänzt, er erfindet nichts |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper **ergänzt** ausschließlich Informationen, die: |

---


Greenkeeper **ergänzt** ausschließlich Informationen, die:

- **bereits bekannt** sind (Historie, Stammdaten, letzter passender Vorgang), oder
- vom Nutzer **eindeutig genannt** wurden.

**Nicht:**

- Vermutungen
- Halluzinationen
- „Wahrscheinlich hast du …“

Jede ergänzte Information muss in der Zusammenfassung **sichtbar** sein und bestätigt oder korrigiert werden können, bevor gespeichert wird.

---

## CM-007 – Gespräch statt Formular

| Feld | Wert |
|------|------|
| **ID** | CM-007 |
| **Titel** | Gespräch statt Formular |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Der Nutzer **beschreibt** seine Arbeit. |

---


Der Nutzer **beschreibt** seine Arbeit.

Greenkeeper **dokumentiert** sie.

**Nicht umgekehrt.**

Der Nutzer soll nicht das Gefühl haben, ein Formular auszufüllen, das zufällig eine Mikrofon-Taste hat. Der Dialog folgt der **Erzählung** – Struktur entsteht im Hintergrund.

---

## CM-008 – Fachliche Priorität der ersten Aussage

| Feld | Wert |
|------|------|
| **ID** | CM-008 |
| **Titel** | Fachliche Priorität der ersten Aussage |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Die **Qualität und Vollständigkeit der ersten Aussage** bestimmt den weiteren Gesprächsverlauf. |

---


Die **Qualität und Vollständigkeit der ersten Aussage** bestimmt den weiteren Gesprächsverlauf.

| Art der Aussage | Typischer Verlauf |
|-----------------|-------------------|
| **Kurze Aussage** | Mehr Rückfragen oder mehr Kontext aus Historie (mit Bestätigung) |
| **Ausführliche Aussage** | Weniger Rückfragen; direktere Zusammenfassung |

Greenkeeper passt Tiefe und Anzahl der Rückfragen an den **Informationsgehalt** der Äußerung an – nicht an ein festes Fragenkatalog-Schema.

---

## CM-009 – Komplexe Arbeitsberichte

| Feld | Wert |
|------|------|
| **ID** | CM-009 |
| **Titel** | Komplexe Arbeitsberichte |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | Greenkeeper soll langfristig auch **längere Arbeitsberichte** verstehen – mehrere Flächen, mehrere Schritte, zeitliche Abfolge. |

---


Greenkeeper soll langfristig auch **längere Arbeitsberichte** verstehen – mehrere Flächen, mehrere Schritte, zeitliche Abfolge.

### Beispiel

**Nutzer:**

> „Ich habe zuerst den Vorgarten gemäht, danach die kleine Fläche unter dem Nussbaum, anschließend den Vorgarten topgedresst und zum Schluss bewässert.“

**Fachliche Regel:**

- Der Nutzer **erzählt** einen zusammenhängenden Arbeitstag oder Arbeitsabschnitt.
- Greenkeeper **zerlegt** den Bericht in **einzelne fachliche Maßnahmen** (hier: mehrere Mähen, Topdressen, Bewässern – mit Zuordnung zu Flächen).
- Die **Reihenfolge** kann für die Darstellung erhalten bleiben; jede Maßnahme ist im Journal separat auswertbar.

Dies ist **Zielvorstellung** – nicht Voraussetzung für den minimalen Ersteinstieg (ein Bericht, eine oder mehrere Maßnahmen).

---

## CM-010 – Produktprinzip: Mitdenken, nicht vorausdenken

| Feld | Wert |
|------|------|
| **ID** | CM-010 |
| **Titel** | Produktprinzip: Mitdenken, nicht vorausdenken |
| **Status** | ✅ Umgesetzt |
| **Priorität** | — |
| **Erstellt** | — |
| **Zuletzt geändert** | — |
| **Verantwortlich** | — |
| **Verwandte Dokumente** | — |
| **Kurzbeschreibung** | **Greenkeeper denkt mit.** |

---


**Greenkeeper denkt mit.**

**Greenkeeper denkt nicht voraus.**

Das bedeutet:

| Greenkeeper tut | Greenkeeper tut nicht |
|-----------------|----------------------|
| Kontext ergänzen | Zukünftige Maßnahmen annehmen |
| Bekannte Informationen vorschlagen | Fehlende Tätigkeiten erraten |
| Nachfragen, wenn für **korrekte Dokumentation** Informationen fehlen | Nachfragen aus Neugier oder Vollständigkeitswahn |
| Nüchtern bestätigen lassen | Spekulativ formulieren |

Kurz: **Mitdenken** = Kontext und Historie nutzen. **Nicht vorausdenken** = keine Maßnahmen, Produkte oder Absichten unterstellen, die nicht im Bericht oder in belegbarem Kontext stehen.

---

## Übersicht

| ID | Kurztitel |
|----|-----------|
| CM-001 | Arbeitsberichte, nicht Formular |
| CM-002 | 1:n Spracheingabe → Maßnahmen |
| CM-003 | Kontext nutzen |
| CM-004 | Rückfrageregeln (Regel 4 hervorgehoben) |
| CM-005 | Zusammenfassung vor Speichern |
| CM-006 | Ergänzen, nicht erfinden |
| CM-007 | Gespräch statt Formular |
| CM-008 | Qualität der ersten Aussage |
| CM-009 | Komplexe Arbeitsberichte |
| CM-010 | Mitdenken, nicht vorausdenken |

---

## Abgrenzung

| Dieses Dokument | Andere Dokumente |
|-----------------|------------------|
| Dialog, Verständnis, Rückfragen | [Fachmodell](../greenkeeper-data-model.md): *Was* ist eine Maßnahme? |
| Arbeitsbericht → Maßnahmen | [Produkt-Governance](../product-governance.md): Produktdaten, Review |
| UX-Regeln ohne Technik | [Ideen-Index](../ideas/index.md): *Wann* umsetzen |

Technische Umsetzung (Parser, Schema, UI) leitet sich aus CM-Regeln **ab** – wird hier **nicht** spezifiziert.
