# Task-Board Kickoff

## Kontext
- Einkaufsliste enthaelt heute nur Shopping-Positionen ohne Verknuepfung zu allgemeinen Todos.
- Ziel ist ein gemeinsamer Pool aus Positionen, die als klassischer Einkauf oder als Task erscheinen koennen.
- Ein Task kann aus einer Shopping-Position entstehen oder umgekehrt eine Einkaufsliste entlasten.

## Zielbild
1. Ein Positionsobjekt kennt `type = shopping | todo` und optionale Referenzen (Liste, Taskgruppe).
2. Todos koennen frei auf einem Board platziert, gruppiert und visuell verbunden werden.
3. Neue Todos entstehen entweder direkt auf dem Board oder aus bestehenden Einkaufspositionen.
4. Verbindungen dokumentieren Abhaengigkeiten ("Bevor ich X einkaufe, erledige Y").

## Iteration 1 (dieser PR)
- Stateless Datenmodell (Client State + Local Storage) um UX zu validieren.
- Neue Seite `/tasks` mit geschuetztem Zugriff.
- Features: Task erfassen, auf Board verschieben (Drag), Task hervorheben, Verbindung durch Long-Press + Click.
- Soft-Grid Hintergrund und reduzierte Farbpalette fuer schnelle Orientierung.

## Offene Punkte fuer Iteration 2
- Prisma-Modell `TaskNode` mit optionaler Beziehung `shoppingItemId`.
- Serverseitige Speicherung von Position, Inhalt und Verbindungen.
- Sync zwischen Board und Einkaufslisten (z.B. Button "Task in Einkauf umwandeln").
- Mobile-spezifische Controls (zusaetzlicher Drawer statt Drag).

## Definition of Done fuer Board-Funktion
- Task anlegen erfordert nur Titel (optional Notiz).
- Drag ist fluessig und klemmt Tasks innerhalb der Board-Flaeche ein.
- Long-Press zeigt klaren Linking-Modus; zweiter Klick erzeugt Linie.
- Reset-Action fuer Tests vorhanden (loescht Local Storage Eintrag `task-board:v1`).
