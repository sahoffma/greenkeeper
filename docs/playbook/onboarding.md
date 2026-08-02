# Onboarding

Verbindliche Regeln für die **Ersteinrichtung** von Greenkeeper. Technische Routen und Ist-Stand des Codes können sich entwickeln – die **Produktlogik** hier bleibt maßgeblich.

Verwandte Dokumente:

- [UX-Prinzipien](./ux-principles.md) – GP-001, GP-010
- [Design System](./design-system.md)
- [Entscheidung DL-001](../decisions/dl-001.md) – optionale Flächengröße
- [Entscheidung DL-004](../decisions/dl-004.md) – Anzahl Flächen vs. gemeinsame Pflege
- [Entscheidung DL-005](../decisions/dl-005.md) – Pflegepräferenz bei mehreren Flächen
- [Entscheidung DL-006](../decisions/dl-006.md) – Mehrflächen-Anzahl, Namen, Größe je Fläche
- [Entscheidung DL-007](../decisions/dl-007.md) – Pflegegruppen, atomarer Abschluss
- [Entscheidung DL-034](../decisions/dl-034.md) – Initialbestand, Bewegungsgründe Dünger
- [CM-014 – Sprachgeführter Initialbestand](./conversation-model.md#cm-014--sprachgeführter-initialbestand-im-onboarding)

---

## Ziel

Greenkeeper soll **ohne unnötige Hürden** nutzbar sein. Onboarding führt den Nutzer in den Garten ein – es prüft nicht wie ein Formular-Audit.

- Wenige, klare Schritte
- Freiwillige Angaben dort, wo sie nicht zwingend sind
- Kein Gefühl von „unvollständig“ oder Fehler bei legitimen Abkürzungen

---

## Ablauf (Ist-Stand)

### Vor dem Onboarding — Authentifizierung

| Schritt | Route | Inhalt |
|---------|-------|--------|
| Willkommen | `/` | Claim, „Garten einrichten“, Link zum Login |
| Registrierung | `/register` | E-Mail, Passwort, Bestätigung |
| Login | `/login` | Anmeldung, Passwort vergessen |
| E-Mail bestätigen | `/email-bestaetigen` | Hinweis, erneut senden, Spam-Hinweis |
| Passwort zurücksetzen | `/passwort-zuruecksetzen` | Neues Passwort nach Recovery-Link |

Details und Guards: [GA-009](../architecture/ga-009.md).

### Garten-Onboarding

| Schritt | Route | Inhalt |
|---------|-------|--------|
| 1 – Einstieg | `/onboarding` | Kurzer Einstieg, „Garten einrichten“ |
| 2 – Anzahl | `/onboarding/2` | **Einmalig:** 1, 2, 3 oder mehr als 3 Rasenflächen |
| 2b – Pflegepräferenz | `/onboarding/2/care` | Nur bei 2–20 Flächen: gemeinsam vs. einzeln pflegen |
| 3 – Größe | `/onboarding/3?areas=single\|multiple&…` | Größe (single); Größe je Fläche (multiple); **Abschluss mit „Los geht’s“** |
| 4 – Legacy | `/onboarding/4` | Nur noch Abwärtskompatibilität für alte URLs (Speichern → Startseite) |
| 5 – Dünger *(optional, Zielbild)* | *(noch nicht implementiert)* | Sprachgeführte Erfassung — siehe [Sprachgeführte Erfassung](#sprachgeführte-erfassung-vorhandener-düngerbestände) |

Die frühere Route `/onboarding/2/count` leitet auf den passenden Schritt weiter (Abwärtskompatibilität).

Query-Parameter transportieren den **laufenden** Onboarding-State (`areas`, `count`, `care`, `index`, `name1…`, optional `size` / `size1…`). Nach erfolgreichem Abschluss werden die Flächen in Supabase gespeichert und der Nutzer gelangt zur Startseite (`/`).

---

## Schritt 2 – Anzahl Rasenflächen (gemeinsamer Auswahl-Schritt)

Headline: **„Wie viele Rasenflächen hat dein Garten?“**

Direkte Auswahl:

- **1 Rasenfläche** → Größeneingabe (Einzelfläche)
- **2**, **3 Rasenflächen** → Pflegefrage
- **Mehr als 3** → Eingabe **4–20**, danach Pflegefrage

Die frühere Unterscheidung „Eine Rasenfläche“ / „Mehrere Rasenflächen“ und der separate spätere Anzahl-Schritt entfallen.

Siehe [DL-004](../decisions/dl-004.md), [DL-006](../decisions/dl-006.md).

---

## Schritt 3 – Flächengröße (single)

### Headline und Ton

- Headline: **„Wie groß ist deine Rasenfläche?“**
- Untertitel erklärt Quadratmeter – sachlich, ohne Druck
- Hinweis zur Flächenmessungs-App bleibt **informativ**, nicht warnend

### Eingabe

- Nur **positive Ganzzahlen** (Quadratmeter)
- Placeholder **„50“** in Eingabe-Typografie, reduzierte Deckkraft (~28 %)
- Zahl und **m²** als gemeinsame, zentrierte Einheit
- Feste, kompakte Unterstreichung – unabhängig von Eingabelänge
- **Kein Autofokus** – Tastatur öffnet erst beim Tippen
- Bei Fokus: sanftes Scrollen, damit Button sichtbar bleibt

### Weiter-Button

- Aktiv nur bei gültiger positiver Ganzzahl
- Auf dem **letzten Schritt** heißt der Button **„Los geht’s“** (statt „Weiter“)
- Speichert atomar über **`complete_onboarding`** (Flächen, Pflegegruppen, Abschlussstatus) und navigiert zur **Startseite** (`/`)

### Später eingeben

- Dezenter Textlink **„Später eingeben“** unter dem Button
- Auf dem letzten Schritt ebenfalls **Abschluss** — ohne gespeicherte Größe für diese Fläche
- Flächengröße = `null` / unbekannt → später unter **Meine Flächen** ergänzbar
- **Keine** Warnung, kein Hinweis auf „unvollständiges“ Onboarding

### Speicherfehler

- Ruhige Meldung: **„Das hat gerade nicht geklappt. Bitte versuche es noch einmal.“**
- Eingaben bleiben erhalten; erneuter Versuch über denselben Button

Siehe [DL-001](../decisions/dl-001.md).

---

## Mehrere Rasenflächen – Produktlogik (DL-004, DL-005, DL-006)

1. Nutzer wählt **einmalig** die Anzahl: **1**, **2**, **3** oder **mehr als 3** (4–20) — [DL-006](../decisions/dl-006.md)
2. Bei **1 Fläche** → direkt freiwillige Größenangabe ([DL-001](../decisions/dl-001.md))
3. Bei **2–20 Flächen** → **„Wie pflegst du deine Rasenflächen?“** ([DL-005](../decisions/dl-005.md))
   - **Meistens gemeinsam** (`together`)
   - **Lieber einzeln** (`separate`)
   - Hinweis: **Du kannst das später jederzeit ändern.**
4. **Automatische Namen** — `Rasenfläche 1`, `Rasenfläche 2`, … (keine Namenseingabe; Umbenennung nach Onboarding geplant)
5. **Größe je Fläche** — nacheinander, freiwillig, mit Orientierung „Rasenfläche X von Y“ und **Später eingeben** pro Fläche
6. **Abschluss** — auf dem letzten Größen-Screen mit **„Los geht’s“** direkt zur Startseite (`/`); keine sichtbare Zusammenfassung — [DL-007](../decisions/dl-007.md)
7. Jede Rasenfläche bleibt **fachlich eigenständig**. `together` / `separate` sind **Onboarding-Eingaben** und werden in **Pflegegruppen** übersetzt (internes Modell, keine sichtbare UX).

**Begründung:** Mehrere räumlich getrennte Flächen können identisch gepflegt werden. Die Anzahl wird nur einmal abgefragt — ohne Wiederholung.

Entwurfsidee: [GK-013](../ideas/gk-013.md)

---

## Schritt 1 – Onboarding-Einstieg

- Ruhige Fortsetzung nach Registrierung/Login
- Primäraktion: **Garten einrichten** → `/onboarding/2`
- Kein Login-Link (Nutzer ist bereits angemeldet)

Die öffentliche Willkommensseite liegt unter `/` — siehe Authentifizierungsreise oben.

---

## Was Onboarding nicht ist

- Kein Pflicht-Formular für alle Stammdaten
- Keine Produkt- oder Geräte-Erfassung in den ersten Schritten
- Keine Social- oder Marketing-Funnel-Logik

---

## Zukünftig – Einstieg mit bestehendem Inventar

> **Leitsatz:** Greenkeeper setzt keinen Neustart voraus. Nutzer können jederzeit mit bereits vorhandenen Produkten und angebrochenen Vorräten einsteigen.

**Status:** 📋 **Vertrag festgelegt** — fachlicher Ablauf in [Sprachgeführte Erfassung vorhandener Düngerbestände](#sprachgeführte-erfassung-vorhandener-düngerbestände); **noch nicht implementiert**. Bewegungstyp `initial_stock`: [DL-034](../decisions/dl-034.md).

Greenkeeper unterstützt sowohl Nutzer **ohne Historie** als auch Nutzer, die **mitten in einer Saison** oder mit **bereits angefangenen Vorräten** starten. Der Einstieg soll jederzeit möglich sein, ohne bestehende Arbeitsweisen oder vorhandene Bestände neu beginnen zu müssen.

### Fachliche Anforderungen

- Nach der Flächenerfassung kann optional ein **aktueller Restbestand** für vorhandene Dünger erfasst werden — primär **sprachgeführt** (Mikrofon).
- Ein **voller Originalsack** ist **keine Voraussetzung** — angebrochene Restmengen sind ausdrücklich vorgesehen.
- Die **Inventarführung bleibt freiwillig** und darf den Einstieg **nicht erschweren**.
- Der Nutzer kann Greenkeeper **jederzeit mitten in einer Saison** beginnen.

### Fachliche Klarstellung: Startbestand

Beim Einstieg kann Greenkeeper einen **fachlichen Startbestand** erfassen.

Dieser dient **ausschließlich** dazu, bereits vorhandene Dünger in Greenkeeper zu übernehmen.

Ein Startbestand ist **kein Benutzerereignis** aus der realen Welt (kein Kauf, keine Ausbringung, keine Korrektur). Er ist ausschließlich ein **Onboarding-Sonderfall** und gehört deshalb **nicht** in [DL-009](../decisions/dl-009.md) (ereignisbasierte Verarbeitung).

Technische Modellierung: positive Bewegung **`initial_stock`** auf kompatiblem Produktbestand ([DL-034](../decisions/dl-034.md)) — **kein** physisches Gebindeobjekt.

### Abgrenzung zu laufenden Benutzerereignissen

| Vorgang | Bedeutung | DL-009 / CM-011 |
|---------|-----------|--------|
| Kauf | Neues Gebinde durch Erwerb | Ja |
| Inventurkorrektur | Abweichung nach Zählung gegenüber berechnetem Saldo | Ja |
| **Startbestand** | Erstmalige Übernahme eines bereits vorhandenen Restbestands beim Einstieg | **Nein** — Onboarding-Sonderfall |

Verwandt: [GM-008](../model/gm-008.md), [GA-012](../architecture/ga-012.md), [CM-014](./conversation-model.md#cm-014--sprachgeführter-initialbestand-im-onboarding).

---

## Sprachgeführte Erfassung vorhandener Düngerbestände

Verbindlicher Onboarding-Vertrag für den optionalen Dünger-Initialbestand. Persistenz: [DL-034](../decisions/dl-034.md). Dialogzustände: [CM-014](./conversation-model.md#cm-014--sprachgeführter-initialbestand-im-onboarding).

**Status:** 📋 Zielbild — **nicht** als produktiv umgesetzt behauptet (kein funktionierendes Onboarding-Mikrofon, keine NLU-Pipeline, kein persistierter Conversation Draft).

### 1. Ziel

Nutzer mit **bereits vorhandenem Dünger** können Restbestände **ohne Formular** erfassen. Greenkeeper versteht eine **freie Spracheingabe**, klärt nur Unklares und bucht nach **ausdrücklicher Bestätigung** `initial_stock`.

### 2. Position im Onboarding

Reihenfolge im Zielbild:

1. **Verpflichtende Flächenerfassung** (Name, optional Größe, Betrachtung/Gruppierung, Zusammenfassung)
2. **Optionaler Dünger-Initialbestand** (dieser Abschnitt)
3. Abschluss beziehungsweise weitere freiwillige Einrichtung

Der Schritt liegt **nach** der Flächen-Zusammenfassung und **vor** oder **beim** finalen Onboarding-Abschluss — exakte Route und Timing sind **Implementierungsdetail**.

### 3. Optionaler Charakter

- Der Schritt ist **überspringbar**; Überspringen blockiert das Onboarding **nicht**.
- Später muss derselbe fachliche Flow über die **Startseite** erreichbar sein (Zugang/`initial_stock` — [DL-034](../decisions/dl-034.md)).
- Onboarding ist **nur ein Einstiegspunkt**, kein eigener Bestandsvertrag.

### 4. Voice-First-Einstieg

Das **Hauptmedium** der Interaktion mit Greenkeeper ist das **Mikrofon** ([DL-010](../decisions/dl-010.md), [home-experience](./home-experience.md)).

- Freistehendes Mikrofon = **Gespräch** mit Greenkeeper.
- Der Nutzer soll **nicht zuerst** in einer klassischen Produktsuche tippen müssen.
- Texteingabe ist **Fallback** („Lieber schreiben“), kein primärer Weg.

### 5. Primärer Prompt

Greenkeeper lädt ein:

> „Sag mir, welchen Dünger Du zu Hause hast und wie viel ungefähr noch vorhanden ist.“

Alternativ kurz:

> „Hast Du bereits Dünger zu Hause?“

— gefolgt von der freien Spracheingabe.

### 6. Freie Nutzeraussage

Der Nutzer antwortet in **einem natürlichen Satz**, zum Beispiel:

> „Ich habe noch ungefähr drei Kilo Stressmanager von Rasendoktor.“

Mögliche Angaben in einer Aussage:

- Hersteller
- Produktname
- Produktvariante / Zusammensetzung
- Form (Granulat / Flüssig)
- Menge
- Einheit

Nicht alle Angaben müssen in einem Satz enthalten sein — fehlende Teile werden **gezielt** nachgefragt.

### 7. Informationsextraktion

Greenkeeper extrahiert aus der Aussage strukturiert:

| Feld | Beispiel (Referenzdialog) |
|------|---------------------------|
| Hersteller | Rasendoktor |
| Produktname | Stressmanager |
| Menge | 3 |
| Einheit | kg |
| Form | *(noch offen)* |
| Produktvariante | *(noch offen)* |
| Offene Punkte | Form, Variante |

Greenkeeper darf ein Produkt **niemals stillschweigend festlegen**.

### 8. Produktrecherche

Recherche ist **unterstützend**, nicht entscheidend.

Greenkeeper darf im Hintergrund:

- den Produktkatalog durchsuchen
- Hersteller und Produktnamen abgleichen
- Varianten und Form vergleichen
- Base Unit prüfen (`kg` / `ml`)
- bestehende Saved Product Profiles und Erkennungslogik nutzen
- später Web- oder Katalogrecherche, sofern technischer Vertrag dies vorsieht

Greenkeeper darf **nicht**:

- aus unsicherem Treffer automatisch einen Produktbestand anlegen
- Hersteller oder Varianten erfinden
- Granulat und Flüssig gleichsetzen
- Produktwerte von ähnlichen Produkten übernehmen
- Produktidentität nur aus der Menge ableiten

Rechercheergebnis ist immer: **Kandidat**, **Kandidatenmenge**, **Unsicherheit**, **offene Klärungsfrage** — kein direkter Bestandswrite.

### 9. Produktkandidaten

Vor Speicherung existiert höchstens ein **bestätigter Produktkandidat** (Saved Product Profile oder belastbarer Recognition-Pfad gemäß Readiness — [GM-009](../model/gm-009.md)).

- **Ein** belastbarer Kandidat → benennen und bestätigen lassen (Zustand A).
- **Mehrere** plausible Kandidaten → **eine** gezielte Unterscheidungsfrage (Zustand B).
- **Kein** belastbarer Kandidat → weitere Informationen einholen (Zustand H).

### 10. Rückfragen

Rückfragen sind **minimal** — nur was zur eindeutigen Produktidentität, Menge und Base Unit nötig ist ([CM-004](./conversation-model.md#cm-004--rückfrageregeln), [CM-006](./conversation-model.md#cm-006--greenkeeper-ergänzt-er-erfindet-nichts)).

Keine vollständige Trefferliste vorlesen, wenn **eine** fachliche Frage genügt (z. B. „Granulat oder Flüssigprodukt?“).

### 11. Mengenklärung

Fehlt die Menge:

> „Wie viel ist ungefähr noch vorhanden?“

Natürliche Mengenangaben sollen verstanden werden, z. B.:

- „ungefähr drei Kilo“
- „etwa ein halbes Kilo“
- „noch 800 Milliliter“
- „circa ein Liter“

Schätzungen sind **zulässig**; der Schätzungscharakter darf sprachlich kenntlich bleiben. **Persistierte** Kennzeichnung „geschätzt“ bleibt offene Architekturfrage ([DL-034](../decisions/dl-034.md)).

### 12. Einheitenklärung

Für den Bestandsvertrag gelten nur **`kg`** und **`ml`** ([DL-021](../decisions/dl-021.md)).

Fehlt die Einheit:

> „Meinst Du 3 kg oder 3 ml?“

Wenn die Produktform die Einheit **belastbar** vorgibt, darf Greenkeeper bestätigen:

> „Das Produkt ist ein Granulat. Meinst Du ungefähr 3 kg?“

**Widerspruch Einheit ↔ Form** (z. B. Nutzer nennt ml, Kandidat ist Granulat):

> „Du hast Milliliter genannt, das gefundene Produkt ist aber ein Granulat. Meinst Du ein anderes Produkt oder möchtest Du die Menge in Kilogramm angeben?“

**Keine kg↔ml-Umrechnung.** Keine Umrechnung zwischen Masse und Volumen.

**Eingabenormalisierung** (vor Persistenz, gleiche Dimension):

| Nutzereingabe | Persistenz (Base Unit) | Vertrag |
|---------------|------------------------|---------|
| Gramm | kg | Massen-Eingabe → kg ([DL-021](../decisions/dl-021.md): intern kg für Granulat) |
| Liter | ml | Volumen-Eingabe → ml ([DL-021](../decisions/dl-021.md): intern ml für Flüssig; Liter nur Darstellung/Eingabe) |

Präzision: maximal vier Nachkommastellen ([DL-021](../decisions/dl-021.md)). Menge muss **positiv** sein.

### 13. Bestätigung

Vor `initial_stock` müssen **bestätigt** sein:

- konkretes Produkt (Saved Product Profile / belastbare Identität)
- Hersteller, soweit Teil der Produktidentität
- Variante beziehungsweise Form
- Menge
- Base Unit

Bevorzugte Abschlussbestätigung:

> „Ich trage Rasendoktor Stressmanager 00-30, Granulat, mit ungefähr 3 kg als Anfangsbestand ein. Stimmt das?“

Regeln ([CM-005](./conversation-model.md#cm-005--zusammenfassung-vor-dem-speichern)):

- **Keine** implizite Bestätigung durch Schweigen
- **Keine** Speicherung direkt nach dem ersten freien Satz
- Erst nach **bestätigendem** Nutzerinput speichern

### 14. Speicherung als `initial_stock`

Nach Bestätigung:

1. find-or-create kompatibler **Produktbestand** ([DL-033](../decisions/dl-033.md))
2. **eine** positive Bewegung `initial_stock`
3. **kein** physisches Gebindeobjekt
4. **Idempotenz** — wiederholte Bestätigung desselben Entwurfs darf nicht doppelt buchen ([DL-034](../decisions/dl-034.md))

Greenkeeper bestätigt:

> „Alles klar. Ich trage 3 kg als Deinen vorhandenen Anfangsbestand ein.“

### 15. Mehrere Produkte

Nach jeder erfolgreichen Buchung:

> „Hast Du noch weiteren Dünger?“

Antworten: **Ja**, direkte Nennung des nächsten Produkts, **Nein**, **Später**, **Fertig**.

**Mehrere Produkte in einem Satz** (Version 1):

> „Ich habe drei Kilo Stressmanager und noch einen Liter Herbstaktiv.“

Greenkeeper erkennt beide Nennungen, bearbeitet sie **nacheinander**, bestätigt **jedes Produkt einzeln**, erzeugt **pro Produkt** eine eigene `initial_stock`-Buchung — **keine** Sammelbuchung über verschiedene Produktbestände.

### 16. Abschlusszusammenfassung

Nach mehreren Produkten zeigt oder nennt Greenkeeper eine **kompakte Übersicht** der bereits bestätigten Buchungen — **keine** neue Sammelbuchung:

> „Ich habe zwei Dünger erfasst:
> Stressmanager — 3 kg
> Herbstaktiv — 1.000 ml“

### 17. Fallback „Lieber schreiben“

Textalternative zum Mikrofon ([DL-010](../decisions/dl-010.md), Startseite: „Stattdessen schreiben“).

- Wechsel erhält den **aktuellen Dialogzustand**, soweit technisch möglich
- **Derselbe** fachliche Vertrag — Extraktion, Recherche, Rückfragen, Bestätigung, `initial_stock`
- Keine parallele Onboarding-Logik

### 18. Produktsuche und Verpackungserkennung als Rückfall

Wenn Sprache oder Recherche nicht ausreichen:

- klassische **Produktsuche**
- **Verpackungsfoto** / Erkennung
- **Barcode** *(Zielbild — nicht als Ist-Zustand)*
- manuelle Korrektur des erkannten Texts

Alle Rückfälle führen in **dieselben** Dialogzustände und **dieselbe** Produktidentitätsprüfung — kein stiller Direktimport ohne Bestätigung.

### 19. Fehlerzustände

| Situation | Verhalten |
|-----------|-----------|
| **Mikrofon nicht verfügbar** | Wechsel zu „Lieber schreiben“; Dialogzustand erhalten; kein Neustart des gesamten Onboardings |
| **Spracheingabe nicht verstanden** | „Das habe ich noch nicht sicher verstanden. Sag mir bitte noch einmal Produkt, Hersteller und ungefähr vorhandene Menge.“ |
| **Produkt nicht eindeutig** | Gezielte Rückfrage; **keine** Speicherung |
| **Recherche nicht verfügbar** | Suche oder manuelle Eingabe; **kein** unbestätigtes Produkt speichern |
| **Verbindungsabbruch** | Bestätigte Buchungen bleiben; unbestätigter Entwurf wird **nicht** gebucht; Reload-Resilienz = offene technische Frage |
| **Doppel-Submit** | Idempotenz verhindert doppelte `initial_stock`-Buchung |

### 20. Abbruch und Überspringen

| Aktion | Verhalten |
|--------|-----------|
| **Überspringen** | Onboarding fortsetzbar; kein Zwang |
| **Abbrechen** (aktueller Entwurf) | Unbestätigtes Produkt **nicht** buchen |
| **Bereits bestätigte Produkte** | Bleiben gespeichert |
| **Nutzer korrigiert sich** | Vorherige Kandidatenannahme verwerfen; Bestätigung **erneut** — keine Buchung mit veraltetem Entwurf |

### 21. Keine parallele Logik

- **Ein** fachlicher Initialbestandsvertrag für Mikrofon, Text, Suche und Foto
- **Derselbe** `initial_stock`-Persistenzvertrag wie [DL-034](../decisions/dl-034.md)
- Recognition identifiziert; Enrichment ergänzt — **getrennt** von der Bestandsbuchung (siehe unten)
- Keine abweichende Bestandslogik im Onboarding


### Abgrenzung zur offenen Startseitenunterhaltung

- Sprachgeführter Dünger-Onboarding-Dialog = **geführte Erfassung** ([CM-015](../playbook/conversation-model.md#cm-015--offene-unterhaltung-und-geführte-erfassung)), kein offenes Startseitengespräch
- Voice-First erlaubt; Intent und Aufgabe sind im Schritt vorgegeben
- Derselbe Dialog später über **Startseite** (Intent aus freier Aussage) und **Ausrüstung → Dünger erfassen** (Scoped Capture) erreichbar
- Einstiegspunkte unterscheiden sich; Produktidentifikation, Recognition, Enrichment und `initial_stock`-Vertrag bleiben identisch ([DL-034](../decisions/dl-034.md))

### 22. Nicht Teil von Version 1 *(Ist-Zustand)*

Nicht als produktiv umgesetzt behaupten:

- funktionierendes Onboarding-Mikrofon für Dünger
- automatische Webrecherche
- Barcode-Scan
- Fotoerkennung im Onboarding
- persistierter Conversation Draft über Reload
- Offline-Synchronisierung
- automatische Mehrproduktzerlegung in Produktivcode
- vollständige NLU-Pipeline
- Schätzungskennzeichen in der Datenbank

Diese Punkte dürfen als **Zielbild**, Fallback oder offene Umsetzung beschrieben werden.

### 23. Offene technische Fragen

| # | Frage |
|---|-------|
| 1 | Exakte Onboarding-Route und Einbindung in `complete_onboarding` |
| 2 | Persistierter Conversation Draft vs. stateless Re-Entry nach Reload |
| 3 | Idempotency Key pro bestätigtem Initialbestands-Entwurf |
| 4 | Automatische Zerlegung mehrerer Produkte in einem Satz — Parser-Grenzen |
| 5 | Readiness-Gate: wann darf ohne vollständiges Enrichment gespeichert werden? ([GM-009](../model/gm-009.md)) |
| 6 | Dauerhafte Kennzeichnung „geschätzt“ |
| 7 | Voice-UI vs. rein sprachliche Ausgabe (TTS) |

### Referenzdialog (vollständig)

| # | Sprecher | Inhalt |
|---|----------|--------|
| 1 | Greenkeeper | „Sag mir, welchen Dünger Du zu Hause hast und wie viel ungefähr noch vorhanden ist.“ |
| 2 | Nutzer | „Ich habe noch ungefähr drei Kilo Stressmanager von Rasendoktor.“ |
| — | *(Extraktion)* | Hersteller: Rasendoktor · Produkt: Stressmanager · Menge: 3 · Einheit: kg · Form: offen · Variante: offen |
| 3 | Greenkeeper | „Ich habe Rasendoktor Stressmanager verstanden. Meinst Du den granulierten Dünger oder das Flüssigprodukt?“ |
| 4 | Nutzer | „Den granulierten.“ |
| 5 | Greenkeeper | „Meinst Du Rasendoktor Stressmanager 00-30 als Granulat?“ |
| 6 | Nutzer | „Ja.“ |
| 7 | Greenkeeper | „Und davon sind ungefähr 3 kg vorhanden?“ |
| 8 | Nutzer | „Genau.“ |
| 9 | Greenkeeper | „Alles klar. Ich trage 3 kg als Deinen vorhandenen Anfangsbestand ein.“ |
| 10 | Greenkeeper | „Hast Du noch weiteren Dünger?“ |

### Dialogzustände A–K (Kurzübersicht)

| ID | Situation | Vertrag |
|----|-----------|---------|
| **A** | Eindeutiger Produktkandidat | Kandidat nennen/zeigen → Nutzer bestätigt → Menge/Einheit bestätigen → speichern |
| **B** | Mehrere plausible Kandidaten | Eine gezielte Unterscheidungsfrage; keine lange Liste |
| **C** | Hersteller fehlt | „Von welchem Hersteller ist …?“ |
| **D** | Produktname zu ungenau | Nach Hersteller/Produkt fragen oder wenige Kandidaten — **kein** Default auf beliebtes Produkt |
| **E** | Menge fehlt | „Wie viel ist ungefähr noch vorhanden?“ |
| **F** | Einheit fehlt | „Meinst Du … kg oder … ml?“ bzw. Form-basierte Bestätigung |
| **G** | Einheit widerspricht Form | Klären: anderes Produkt oder Menge in passender Base Unit — **keine** Umrechnung kg↔ml |
| **H** | Produkt unbekannt | Keine erfundene Identität; weitere Infos, Foto, Suche |
| **I** | Nutzer korrigiert sich | Entwurf verwerfen, neu bestätigen |
| **J** | Mehrere Produkte in einem Satz | Nacheinander, je einzeln bestätigen und buchen |
| **K** | Abbrechen / Überspringen | Unbestätigtes verwerfen; Bestätigtes bleibt; Onboarding nicht blockieren |

Details und Implementierungszustände: [CM-014](./conversation-model.md#cm-014--sprachgeführter-initialbestand-im-onboarding).

### Recognition und Enrichment

| Schritt | Rolle |
|---------|-------|
| **Recognition** | Produkt identifizieren — Kandidat, nicht finale Wahrheit |
| **Enrichment** | Produktdaten ergänzen — **nicht** mit Bestandsbuchung vermischen |
| **Bestätigung** | Produktidentität muss vor `initial_stock` bestätigt sein |
| **Readiness** | Nutzer wartet nicht auf vollständiges Enrichment, wenn belastbare Anlage erlaubt ist ([GM-009](../model/gm-009.md)); sonst transparent führen |
| **Verboten** | Unbestätigte Product-Profile-Anlage; stille Produktwahl |

---

## Offene Punkte

- Einstieg mit bestehendem Inventar — [Sprachgeführte Erfassung vorhandener Düngerbestände](#sprachgeführte-erfassung-vorhandener-düngerbestände)
- Freundliche Erinnerung bei fehlender Flächengröße nach Onboarding – siehe [GK-014](../ideas/gk-014.md)
- Umbenennung von Rasenflächen nach dem Onboarding
- Sichtbare Verwaltung von Pflegegruppen (Zusammenführen/Trennen)
- Free-/Pro-Abgrenzung — siehe [GK-015](../ideas/gk-015.md) (noch keine Umsetzung)

Neue Onboarding-Ideen → [ideas/](../ideas/index.md). Getroffene Entscheidungen → [decisions/](../decisions/index.md).
