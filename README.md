# Multiplayer Tic-Tac-Toe with Nakama

This repository implements a server-authoritative Tic-Tac-Toe game using Nakama and a React frontend.

Recommended deployment:

- Railway for the Nakama backend and PostgreSQL
- Vercel Hobby for the React frontend

## Project structure

- `nakama/`: Nakama TypeScript runtime with authoritative match logic, matchmaking hooks, room discovery RPCs, timed mode, and stat persistence.
- `frontend/`: React + Vite client with device authentication, WebSocket-based realtime updates, manual room flow, matchmaker flow, and leaderboard view.
- `deploy/railway-start.sh`: Startup script used by both local Docker and Railway. It generates Nakama config from environment variables and waits for PostgreSQL.
- `Dockerfile`: Backend image for Railway that builds the Nakama runtime and launches Nakama.
- `docker-compose.yml`: Local PostgreSQL + Nakama development stack.

## Local development

1. Install workspace dependencies:

```bash
npm install
```

2. Build the Nakama runtime bundle:

```bash
npm run build --workspace nakama
```

3. Start the local backend.

First provide local Nakama env vars from your shell or an untracked root `.env` file:

```bash
NAKAMA_SERVER_KEY=<value used by the frontend>
NAKAMA_SESSION_ENCRYPTION_KEY=<strong random value>
NAKAMA_HTTP_KEY=<strong random value>
NAKAMA_CONSOLE_USERNAME=<console username>
NAKAMA_CONSOLE_PASSWORD=<console password>
```

Then start the local backend:

```bash
docker compose up --build
```

4. Run the frontend:

```bash
npm run dev --workspace frontend
```

5. Use these frontend values locally:

```bash
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SSL=false
VITE_NAKAMA_SERVER_KEY=<same value as NAKAMA_SERVER_KEY>
```

Local Docker and Railway now use the same database architecture: PostgreSQL plus the same Nakama startup script. Nakama retries database migration every 2 seconds until PostgreSQL is ready.

For local Docker, the Nakama console is exposed on `http://127.0.0.1:7351`. On Railway, keep the console bound to `127.0.0.1` so it is not publicly reachable.

## Railway backend deployment

### Architecture

- Railway PostgreSQL service
- Railway backend service from this repository's root `Dockerfile`

### Railway setup

1. Create a new Railway project.
2. Add a PostgreSQL service from Railway.
3. Add a new service from this GitHub repository.
4. Configure that service to build from the root `Dockerfile`.
5. Enable Public Networking for the Nakama service.
6. If Railway asks which port to expose, choose `7350`.

### Railway variables

Set these variables on the Nakama service:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
NAKAMA_SERVER_KEY=<strong random value>
NAKAMA_SESSION_ENCRYPTION_KEY=<strong random value>
NAKAMA_HTTP_KEY=<strong random value>
NAKAMA_CONSOLE_USERNAME=<console username>
NAKAMA_CONSOLE_PASSWORD=<console password>
```

`DATABASE_URL` should reference the Railway PostgreSQL service variable. The startup script also supports `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`, but `DATABASE_URL` is the easiest path.

Do not commit `NAKAMA_SESSION_ENCRYPTION_KEY`, `NAKAMA_HTTP_KEY`, or `NAKAMA_CONSOLE_PASSWORD` to Git. They should live only in Railway environment variables or in your local untracked env files.

### Backend notes

- Railway handles HTTPS on the public service domain, so the frontend should connect with SSL enabled.
- The Nakama console is bound to `127.0.0.1:7351` inside the container and is not exposed publicly.
- The backend image builds `nakama/build/index.js` during the Docker build, so no separate Railway build command is needed.

## Vercel frontend deployment

1. Import this repository into Vercel.
2. Set the project root to `frontend/`.
3. Configure these environment variables in Vercel:

```bash
VITE_NAKAMA_HOST=<your Railway backend domain without https://>
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SSL=true
VITE_NAKAMA_SERVER_KEY=<same value as NAKAMA_SERVER_KEY on Railway>
```

4. Deploy the frontend.

`VITE_NAKAMA_SERVER_KEY` is expected to be present in the client bundle, so treat it as a public client key rather than a secret. The sensitive values are `NAKAMA_SESSION_ENCRYPTION_KEY`, `NAKAMA_HTTP_KEY`, and your console credentials.

## Gameplay flows

### Automatic matchmaking

- Choose `Classic` or `Timed`.
- Click `Auto Matchmake`.
- The client submits a matchmaker ticket with `mode` properties and query filtering.
- Nakama creates an authoritative room when two compatible players are matched.

### Manual room discovery

- Click `Create Room` to create an authoritative room directly.
- Other players click `Refresh Rooms` and join an open room from the list.

### Multiplayer validation

- All moves are sent as board indices.
- The Nakama match loop validates turn order, board bounds, and cell occupancy.
- Only validated state is broadcast back to clients.

## Persistence

- Global wins are recorded in the authoritative `wins_global` leaderboard.
- Per-player wins, losses, current streak, and best streak are stored in `player_stats/summary`.
- Timeout and disconnect forfeits count as losses for the abandoning player.

## Testing multiplayer

1. Start Nakama and the frontend.
2. Open the frontend in two browser windows or devices.
3. Authenticate automatically through device ID login.
4. Create or matchmake into a room from one window and join from the other.
5. Verify:
   - moves only apply on the correct turn
   - duplicate cell selections are rejected
   - timed mode forfeits after the deadline
   - disconnecting one player ends the match as a forfeit
   - wins appear on the leaderboard after a completed game
