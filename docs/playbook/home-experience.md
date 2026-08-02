# Home Experience

Dieses Dokument beschreibt die **fachliche Benutzererfahrung der Startseite** – unabhängig von UI-Komponenten, technischer Umsetzung und konkretem Ist-Stand.

**Ist-Stand (Dev, Version 1):** Siehe [GK-016](../ideas/gk-016.md) — Begrüßung, Flächenkarten (Tipp öffnet Detailseite), Mikrofon, „Was ist heute wichtig?“, Navigation Journal · Greenkeeper · Ausrüstung. Titelbilder pro Fläche werden auf der Detailseite gepflegt und auf der Startseite angezeigt. Persönliches Gartenfoto (HE-001) und letzte Aktivitäten (HE-003) folgen in späteren Sprints.

---

## Ziel

Die Startseite ist der **tägliche Einstieg** in Greenkeeper.

Sie ist **kein Dashboard**.

Sie ist der **Beginn eines Gesprächs**.

---

## HE-001 — Die Startseite zeigt immer den eigenen Garten

Im Mittelpunkt steht ein **persönliches Foto**.

Kein Stockfoto.

Der Nutzer soll sofort erkennen:

> „Das ist mein Garten.“

Die Startseite ist kein generischer App-Einstieg. Sie ist **persönlich und wiedererkennbar** – der eigene Ort steht im Vordergrund.

---

## HE-002 — Die wichtigste Aktion ist die Spracheingabe

Zentrale Frage:

> **„Was hast du heute gemacht?“**

Diese Aktion **dominiert** die gesamte Startseite.

Sprache ist der primäre Weg, Greenkeeper etwas mitzuteilen. Alles andere auf der Startseite ordnet sich dieser Handlung unter.

---

## HE-003 — Letzte Aktivitäten unterhalb der Spracheingabe

Unterhalb der Spracheingabe erscheinen die **letzten Aktivitäten**.

- Keine langen Listen
- Nur wenige aktuelle Einträge

Die Historie dient der **Orientierung und Erinnerung** – nicht der Verwaltung oder detaillierten Analyse.

---

## HE-004 — Mehrere Rasenflächen

Hat der Nutzer **mehrere Rasenflächen**, werden diese unterhalb der Gartenansicht angezeigt.

**Überschrift:** „Rasenflächen“

Die einzelnen Rasenflächen sind **horizontal wischbar**.

Jede Rasenfläche besitzt:

- eigenes Foto
- Namen
- eigenes Mikrofon
- letzte Aktivität

Der Nutzer kann pro Fläche direkt dokumentieren – ohne Umwege über Einstellungen oder Formulare.

---

## HE-005 — Eine Rasenfläche: maximale Einfachheit

Hat der Nutzer **nur eine Rasenfläche**, wird **keine Hierarchie erklärt**.

Der Nutzer muss niemals verstehen, dass Greenkeeper intern zwischen **Garten** und **Rasenflächen** unterscheidet.

Die App bleibt **maximal einfach**. Was intern existiert, muss nach außen nicht sichtbar werden.

---

## HE-006 — Sprache ist stärker als der aktuelle Kontext

**Beispiel:**

Der Nutzer befindet sich auf der Rasenfläche „Hauptfläche“.

Er sagt:

> „Ich habe heute beide Flächen gemäht.“

Greenkeeper erkennt trotzdem **zwei Maßnahmen**.

Der aktuelle Kontext **ergänzt** Sprache.

Er **begrenzt** sie niemals.

Wo der Nutzer gerade steht, ist ein Hinweis – kein Käfig. Was er sagt, hat Vorrang.

---

## HE-007 — Motivation zur Dokumentation

Die Startseite motiviert zur **Dokumentation**.

Nicht zur Verwaltung.

Nicht zur Analyse.

Nicht zum Lesen.

Die wichtigste Aufgabe der Startseite ist:

> Den **nächsten Journaleintrag** so einfach wie möglich zu machen.

---

## Offene Unterhaltung auf der Startseite

Verbindliches Zielbild für die **offene Unterhaltung** mit Greenkeeper. Technische Umsetzung: [CM-015](./conversation-model.md#cm-015--offene-unterhaltung-und-geführte-erfassung). Abgrenzung zu Unterseiten: [DL-010](../decisions/dl-010.md).

**Status:** 📋 Zielbild — **nicht** als produktiv umgesetzt behauptet (kein funktionierendes Startseitenmikrofon für alle Intents, keine vollständige NLU-Pipeline, kein persistierter Conversation Draft, keine TTS-Antworten).

### 1. Einziger Ort offener Unterhaltung

Die **offene Unterhaltung** findet **ausschließlich auf der Startseite** statt.

Unterbereiche (z. B. Ausrüstung → Dünger erfassen) nutzen **geführte Erfassung** — kein globales Intent-Routing, kein offenes Gespräch über Fachbereiche hinweg.

Flächen-Mikrofone **auf der Startseite** (HE-004) bleiben **Startseitenkontext** — sie ersetzen nicht den zentralen Gesprächseinstieg und sind **keine** Unterseiten-Diktatfelder.

### 2. Zentrale Ansprache

Bevorzugte Überschrift:

> **„Unterhalte Dich mit Greenkeeper“**

Ergänzende Frage (bestehendes HE-002):

> **„Was hast Du heute gemacht?“**

### 3. Zentrales Mikrofon

Das **freistehende Mikrofon** ist visuell und semantisch der **primäre Gesprächseinstieg**.

Der Nutzer darf **frei erzählen**, was er getan hat oder erfassen möchte — ohne vorher einen Fachbereich zu wählen.

### 4. Freie Spracheingabe und Schreiben

- **Sprache** und **Text** sind **gleichwertige** Gesprächseingaben.
- **„Lieber schreiben“** / **„Stattdessen schreiben“** wechselt nur das **Eingabemedium** — der **offene Conversation-Vertrag** bleibt identisch ([DL-010](../decisions/dl-010.md)).

Beispiele freier Aussagen:

- „Ich habe heute den Rasen gemäht.“
- „Ich habe Dünger gekauft.“
- „Ich habe gedüngt.“
- „Ich habe bewässert.“
- „Ich habe aerifiziert.“
- „Ich musste Dünger entsorgen.“
- „Ich habe noch drei Kilo Stressmanager zu Hause.“

### 5. Intent-Erkennung und Orchestration

Greenkeeper erkennt aus der freien Aussage:

- welcher **Intent** vorliegt
- welcher **Fachbereich** betroffen ist
- welche Informationen **bereits enthalten** sind
- welche Informationen **fehlen**
- welcher **bestehende Fachflow** gestartet werden muss

Danach führt Greenkeeper eine **echte Unterhaltung**:

- gezielte Rückfragen
- Auswertung der Antworten
- Verifizierung von Kandidaten
- Erklärung von Unsicherheit
- Vorschlag von Foto, Suche oder Barcode als nächstem Schritt
- Zusammenfassung
- **Bestätigung vor Speicherung** ([CM-005](./conversation-model.md#cm-005--zusammenfassung-vor-dem-speichern))

### 6. Übergabe in bestehende Fachflows

Die Startseite ist **Einstieg und Orchestrator** — **keine** eigene Persistenzlogik.

| Beispiel | Erkannt | Anschließend |
|----------|---------|--------------|
| „Ich habe Dünger gekauft.“ | Bestandszugang `purchase` | Produktklärung → Mengenklärung → Bestätigung → [DL-034](../decisions/dl-034.md) |
| „Ich habe gedüngt.“ | Flächenbezogene Anwendung | Produkt- und Flächenauswahl → Menge → bestehender Düngungsflow |
| „Ich habe den Rasen gemäht.“ | Mähaktivität | Bestehender beziehungsweise vorgesehener Mähflow |

Es darf **niemals** eine separate Persistenzlogik **allein für die Startseitenunterhaltung** entstehen.

### 7. Beispielsätze unter dem Mikrofon

Unterhalb des zentralen Mikrofons dürfen **wechselnde Beispielsätze** erscheinen — Inspiration, **keine** Buttons mit eigener Fachlogik:

- „Ich habe heute den Rasen gemäht.“
- „Ich habe Dünger gekauft.“
- „Ich habe gedüngt.“
- „Ich habe bewässert.“
- „Ich habe aerifiziert.“

Regeln:

- zeigen die **Offenheit** des Gesprächseinstiegs
- führen **nicht** zu separaten Implementierungen
- **keine** automatische Speicherung durch Auswahl eines Beispiels
- **kein** werblicher Carousel-Charakter
- **exakt ein** Beispielsatz gleichzeitig gut lesbar
- **sanfter Wechsel** — keine hektische oder dauerhaft ablenkende Animation
- **Barrierefreiheit** und **reduzierte Bewegung** (`prefers-reduced-motion`) respektieren

Die endgültige visuelle Animation ist **keine** Produktentscheidung dieses Schritts.

### 8. Abgrenzung zu Unterseiten

| | Startseite (Offene Unterhaltung) | Unterbereich (Geführte Erfassung) |
|---|----------------------------------|-----------------------------------|
| Intent | zunächst unbekannt | vorgegeben (z. B. Dünger erfassen) |
| Mikrofon | freistehend = Gespräch | im Feld = Diktat → lokaler Flow |
| Routing | global in Fachflows | nur aktueller Fachflow |
| Rückfragen | dialogisch, gesprochen oder geschrieben | primär **textlich** |
| Beispiel | „Ich habe heute gemäht“ → Mähflow | „Stressmanager gekauft“ → lokale Produkt-/Mengenfragen |

Details: [CM-015](./conversation-model.md#cm-015--offene-unterhaltung-und-geführte-erfassung), [home-experience](./home-experience.md) (dieser Abschnitt).

---

## Zusammenfassung

| ID | Prinzip | Kurz |
|----|---------|------|
| **HE-001** | Eigener Garten | Persönliches Foto im Mittelpunkt – sofort erkennbar als „mein Garten“ |
| **HE-002** | Spracheingabe dominiert | Zentrale Frage: „Was hast du heute gemacht?“ – wichtigste Aktion der Seite |
| **HE-003** | Letzte Aktivitäten | Wenige aktuelle Einträge unter der Spracheingabe, keine langen Listen |
| **HE-004** | Mehrere Rasenflächen | Horizontal wischbar unter „Rasenflächen“ – Foto, Name, Mikrofon, letzte Aktivität je Fläche |
| **HE-005** | Eine Fläche = einfach | Keine erklärte Hierarchie Garten/Rasenfläche – interne Struktur bleibt unsichtbar |
| **HE-006** | Sprache vor Kontext | Aktueller Flächenkontext ergänzt, begrenzt aber nie – z. B. „beide Flächen“ aus einem Kontext |
| **HE-007** | Dokumentation first | Startseite dient dem nächsten Journaleintrag – nicht Verwaltung, Analyse oder Lesen |
| — | Offene Unterhaltung | Einziger Ort freies Gespräch; Intent-Erkennung; Orchestrator bestehender Fachflows ([CM-015](./conversation-model.md#cm-015--offene-unterhaltung-und-geführte-erfassung)) |
