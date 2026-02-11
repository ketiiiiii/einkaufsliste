# Änderungslog

> Jede Änderung am Projekt wird hier kurz eingetragen (Datum, was/warum).

## 2026-02-11
- Initial: VORGABE.md und LOG.md angelegt.
- Next.js (TS + Tailwind + ESLint + App Router) scaffold in Temp erstellt und ins Projekt übernommen.
- Copied build output `.next/` wieder entfernt.
- Prisma hinzugefügt (Schema + Migration) inkl. NextAuth-Tabellen und ShoppingList/ShoppingItem.
- Auth umgestellt: Registrierung + Email/Passwort Login (Credentials Provider) statt GitHub OAuth.
- Prisma: User.email verpflichtend + passwordHash ergänzt, Migration erstellt.
- Pages: / (Login), /register (Registrierung) ergänzt.
- Fix: NextAuth auf v4 kompatibel gemacht (Credentials + App Router Route Handler, Login/Logout Client-Buttons).
- Fix: Prisma auf v6 gepinnt (Prisma 7 Adapter-Requirement im Build vermieden).
- Render: render.yaml + RENDER.md vorbereitet (Web Service, Disk unter /var/data, SQLite: file:/var/data/app.db, Start: migrate deploy + next start).
- Cleanup: HTML Kommentare aus .github/copilot-instructions.md entfernt.
- Fix: Env-Var-Namen für NextAuth v4 vereinheitlicht (NEXTAUTH_URL/NEXTAUTH_SECRET) in .env/.env.example/render.yaml/RENDER.md.
- Erste UI: Login-Landing, Listenübersicht, Listen-Detail (Positionen, erledigt, erledigte ein-/ausblenden, Nächste 10).
- .env.example ergänzt (Render/Local vorbereitete Variablen).
