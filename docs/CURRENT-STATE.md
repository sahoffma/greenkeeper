# Current Project State

Version 1.2

## Zweck

Dieses Dokument beschreibt den aktuellen Entwicklungsstand von Greenkeeper.

Es ergänzt das Manifest, den Greenkeeper Architect und das Project Handbook.

Während diese Dokumente Vision, Arbeitsweise und Entwicklungsprozess definieren, beschreibt dieses Dokument den aktuellen Projektstatus.

Der Greenkeeper Architect nutzt dieses Dokument als Einstieg in die laufende Entwicklung.

---

# Projektstatus

Greenkeeper befindet sich in einer aktiven Entwicklungsphase.

Die grundlegende Architektur steht. Zentrale Infrastruktur, Authentifizierung, Datenmodell und KI-Anbindung sind bereits umgesetzt.

Der Onboarding-Flow ist auf Dev vollständig verifiziert (RPC, Browser-E2E, Route-Guards) und **production-freigabefähig**.

**Betriebsentscheidung (verbindlich):** greenkeeper-prod wird bis zum geplanten öffentlichen Rollout **nicht weiter verändert**. Entwicklung und Tests laufen ausschließlich gegen greenkeeper-dev. Supabase bleibt in der Entwicklungsphase im **Free-Plan**; vor dem ersten öffentlichen Production-Rollout ist **mindestens Pro** erforderlich (ca. 25 USD/Monat — Kosten erst bei tatsächlich bevorstehendem Production-Betrieb). Details: [database-bootstrap.md](./database-bootstrap.md#betriebsentscheidung-supabase-plan-und-production-freeze).

---

# Bereits umgesetzt

## Infrastruktur

- GitHub Repository eingerichtet
- Cursor als Entwicklungsumgebung
- Supabase integriert (Production + separates Dev-Projekt)
- **Supabase Free-Plan** während der Entwicklungsphase (Upgrade auf Pro erst vor öffentlichem Rollout)
- Lokale Entwicklung nutzt ausschließlich Supabase Dev (siehe [GA-010](./architecture/ga-010.md))
- **greenkeeper-prod eingefroren** bis zum öffentlichen Rollout — keine Migrationen, kein Deploy ohne Freigabe, Pro-Plan und bestätigtes Backup
- Dev-Datenbank (`amyounxrsxgujsfutshx`): vollständig migriert; chronologischer Neuaufbau verifiziert ([database-bootstrap.md](./database-bootstrap.md))
- Datenbankstruktur aufgebaut
- Authentifizierung eingerichtet
- OpenAI API angebunden

## Benutzerverwaltung

- Registrierung
- Login
- Onboarding-Prozess mit atomarem Abschluss über `complete_onboarding`
- Pflegegruppen-Datenmodell (`care_groups`, `care_group_areas`)
- Onboarding-Abschlussstatus (`profiles.onboarding_completed_at`)
- **Route-Guards:** Session- und Onboarding-Status (siehe [GA-009](./architecture/ga-009.md))
- **Startseite:** echte Rasenflächen aus Supabase (keine Dummy-Flächen mehr)

## KI

- OpenAI erfolgreich integriert
- Erste KI-Workflows umgesetzt
- Verarbeitung von Produktinformationen vorbereitet
- Grundlage für KI-gestützte Produkterkennung geschaffen

## Produktdaten

- Erstes Produktmodell aufgebaut
- Erste Dünger erfasst (z. B. Springstart)
- Strukturierte Speicherung von Produktinformationen vorbereitet

## Dokumentation

- MANIFEST.md
- GREENKEEPER-ARCHITECT.md
- PROJECT-HANDBOOK.md
- GPT-INSTRUCTIONS.md

---

# Aktueller Entwicklungsschwerpunkt

Der aktuelle Schwerpunkt ist die Erweiterung der Multi-Lawn-Funktionen über das Onboarding hinaus:

- Navigation zwischen Rasenflächen vertiefen
- Sichtbare Verwaltung von Pflegegruppen
- KI-gestützte Produkterkennung aus Fotos vervollständigen

---

# Geplante nächste Entwicklungsschritte

- Sichtbare Verwaltung von Pflegegruppen
- KI-gestützte Produkterkennung aus Fotos vervollständigen
- Automatische Übernahme erkannter Produktdaten
- Pflegeempfehlungen auf Basis erkannter Produkte
- Weitere intelligente KI-Unterstützung für Rasenpflege

---

# Hinweise für den Greenkeeper Architect

Dieses Dokument beschreibt ausschließlich den aktuellen Projektstand.

Es wird regelmäßig aktualisiert und dient als Einstieg in die laufende Entwicklung.

Manifest, Greenkeeper Architect und Project Handbook bleiben die übergeordneten Referenzdokumente.
