# Task Board Brief

## Hintergrund
- Einkaufspositionen sollen kuenftig nicht nur Items fuer eine Liste sein, sondern auch als Todos funktionieren.
- Jede Position erhaelt einen Positionstyp (z.B. `shopping-item`, `todo`, spaeter weitere Ableger).
- Listen und Tasks duerfen sich gegenseitig erzeugen: Ein Todo kann eine neue Einkaufsposition anlegen, eine Position kann als Todo uebernommen werden.

## Ziele
1. Gemeinsame Sprache fuer Aufgaben und Einkaufsschritte.
2. Visuelles Board, um Ideen, Listen und Todos frei zu platzieren.
3. Moeglichkeit, Beziehungen zwischen Tasks (Abhaengigkeiten, Gruppen) zu zeichnen.
4. Grundlage fuer spaetere Syncs mit konkreten Listen (z.B. Task -> Einkaufsliste pushen).

## Board v1 (jetzt umgesetzt)
- Freies Canvas, Karten lassen sich per Drag bewegen.
- Long-Press auf Karte aktiviert Link-Modus; Klick auf zweite Karte verbindet beide.
- Karten speichern Titel, optionale Kurznotiz, Position (x/y) und Farbtoken.
- State liegt lokal im Browser (`localStorage`) solange keine API dafuer existiert.

## Naechste Schritte
- Positionstyp in Prisma Modell einfuehren (enum) und UI ergaenzen.
- Mapping zwischen `shoppingItem` und TaskCard bauen (API + UI Sync).
- Verbindungen semantisch nutzen (z.B. "diese Todos gehoeren zu Liste X").
- Optional: Task Board per User auf Server speichern, damit mehrere Devices konsistent sind.

## Offene Fragen
- Wie streng sollen Todos und Einkaufspositionen gekoppelt sein? Eins-zu-eins oder locker?
- Wie sieht ein Flow fuer "Todo erzeugt Einkaufsliste" genau aus?
- Welche weiteren Positionstypen braucht es (z.B. Notiz, Erinnerung)?
