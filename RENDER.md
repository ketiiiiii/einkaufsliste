# Render Deployment (Web Service + SQLite Persistenz)

## Ziel
- Deploy als Render **Web Service**
- SQLite DB liegt auf einer Render **Persistent Disk** (damit Daten bleiben)

## Setup
1. Repo nach GitHub pushen.
2. In Render: **New +** → **Blueprint** → Repo auswählen.
3. Render erkennt `render.yaml` und legt den Service an.

## Wichtige Env Vars
Im Render Service unter **Environment**:
- `NEXTAUTH_SECRET` setzen (zufälliger String)
- `NEXTAUTH_URL` setzen (z.B. `https://<dein-service>.onrender.com`)

Die anderen Variablen kommen aus `render.yaml`:
- `DATABASE_URL=file:/var/data/app.db`

## DB / Migration
Beim Start läuft automatisch:
- `npx prisma migrate deploy`

## Hinweise
- Disk ist auf `/var/data` gemountet.
- SQLite File ist `/var/data/app.db`.
