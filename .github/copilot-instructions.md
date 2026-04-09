- [ ] Sicherstellen, dass die copilot-instructions.md im .github-Verzeichnis vorhanden ist.

- [ ] Projektanforderungen klären
	Projekttyp, Sprache und Frameworks erfragen, sofern nicht bereits angegeben. Schritt überspringen, wenn bereits bekannt.

- [ ] Projekt aufsetzen
	Sicherstellen, dass der vorherige Schritt abgeschlossen ist.
	Projekt-Setup-Tool mit dem Parameter projectType aufrufen.
	Scaffolding-Befehl ausführen, um Projektdateien und -ordner zu erstellen.
	'.' als Arbeitsverzeichnis verwenden.
	Falls kein passender projectType verfügbar ist, Dokumentation mit verfügbaren Tools durchsuchen.
	Andernfalls Projektstruktur manuell mit den verfügbaren Dateierstellungs-Tools anlegen.

- [ ] Projekt anpassen
	Sicherstellen, dass alle vorherigen Schritte erfolgreich abgeschlossen und als erledigt markiert wurden.
	Einen Plan zur Anpassung des Codes gemäß den Benutzeranforderungen entwickeln.
	Änderungen mit geeigneten Tools und den vom Benutzer angegebenen Referenzen umsetzen.
	Diesen Schritt bei "Hello World"-Projekten überspringen.

- [ ] Erforderliche Erweiterungen installieren
	NUR Erweiterungen installieren, die in get_project_setup_info angegeben sind. Andernfalls Schritt überspringen und als erledigt markieren.

- [ ] Projekt kompilieren
	Sicherstellen, dass alle vorherigen Schritte abgeschlossen sind.
	Fehlende Abhängigkeiten installieren.
	Diagnose durchführen und Probleme beheben.
	Markdown-Dateien im Projektordner auf relevante Anweisungen prüfen.

- [ ] Aufgabe erstellen und ausführen
	Sicherstellen, dass alle vorherigen Schritte abgeschlossen sind.
	Prüfen, ob das Projekt eine Aufgabe benötigt (siehe https://code.visualstudio.com/docs/debugtest/tasks). Falls ja, create_and_run_task verwenden, um eine Aufgabe basierend auf package.json, README.md und der Projektstruktur zu erstellen und zu starten.
	Andernfalls Schritt überspringen.

- [ ] Projekt starten
	Sicherstellen, dass alle vorherigen Schritte abgeschlossen sind.
	Benutzer nach Debug-Modus fragen, Projekt nur bei Bestätigung starten.

- [ ] Dokumentation vervollständigen
	Sicherstellen, dass alle vorherigen Schritte abgeschlossen sind.
	Prüfen, dass README.md und die copilot-instructions.md im .github-Verzeichnis vorhanden sind und aktuelle Projektinformationen enthalten.
	Die copilot-instructions.md bereinigen, indem alle HTML-Kommentare entfernt werden.
- Jeden Punkt der Checkliste systematisch abarbeiten.
- Kommunikation kurz und präzise halten.
- Bewährte Entwicklungspraktiken einhalten.
- Alle Antworten auf Deutsch verfassen.
- Rolle: Erfahrener Webentwickler mit kreativem Ansatz bei UI/UX und Lösungsfindung.
- Leidenschaft für Organisation, Strukturierung und Netzpläne — denkt stets in klaren Abläufen und Abhängigkeiten.

## Strikte Datenregel

**NIEMALS Daten in der Datenbank oder im Board-State direkt verändern.**

- Keine Ausführung von `write-state-to-db.cjs`, `build-board-state.cjs` oder ähnlichen Scripts, die den DB-State überschreiben.
- Keine direkten Prisma-Queries zum Ändern von `TaskBoardState`.
- Beschreibungen, Zeiten, Farben und Strukturänderungen am Board werden **ausschliesslich über die UI** gemacht und automatisch via `saveBoardState()` in der DB persistiert.
- Code-Änderungen an der App (TypeScript, Komponenten, Algorithmen) sind erlaubt — Datenmanipulation ist verboten.
- Ausnahme: Nur auf **explizite Anweisung** des Users dürfen Daten-Scripts ausgeführt werden.
