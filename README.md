# Multiplayer Tic-Tac-Toe with Nakama

This project is a server-authoritative multiplayer Tic-Tac-Toe game built with a React frontend and a Nakama backend. Players can create private rooms, join open rooms, use automatic matchmaking, play in classic or timed mode, and view a persistent leaderboard.

## Submission Deliverables

- Source code repository: `https://github.com/KathanShah6503/tic-tac-toe`
- Deployed game URL: `https://tic-tac-toe-frontend-gold.vercel.app`
- Deployed Nakama server endpoint: `https://nakama-runtime-production.up.railway.app`

## Tech Stack

- Frontend: React 19, TypeScript, Vite
- Multiplayer backend: Nakama 3.32.1 with TypeScript runtime logic
- Database: PostgreSQL
- Backend hosting: Railway
- Frontend hosting: Vercel
- Reverse proxy: Caddy inside the Nakama container for Railway ingress and CORS handling

## Repository Structure

- `frontend/`: React client UI, realtime socket integration, room list, matchmaking, leaderboard, and gameplay screens
- `nakama/`: authoritative match logic, RPC handlers, leaderboard creation, and player stat persistence
- `deploy/railway-start.sh`: generates Nakama config from environment variables, waits for PostgreSQL, runs migrations, then starts Nakama
- `deploy/railway-entrypoint.sh`: starts Nakama behind Caddy on Railway
- `deploy/Caddyfile`: proxy and CORS configuration for Railway traffic
- `Dockerfile`: production backend image used for Railway deployment
- `docker-compose.yml`: local PostgreSQL + Nakama stack for development and testing

## Setup and Installation

### Prerequisites

- Node.js 22 or later
- npm
- Docker Desktop or Docker Engine

### 1. Install dependencies

```bash
npm install
```

### 2. Create local environment variables

Create an untracked root `.env` file with the following values:

```bash
NAKAMA_SERVER_KEY=devkey
NAKAMA_SESSION_ENCRYPTION_KEY=replace-with-a-long-random-string
NAKAMA_HTTP_KEY=replace-with-a-long-random-string
NAKAMA_CONSOLE_USERNAME=admin
NAKAMA_CONSOLE_PASSWORD=replace-with-a-strong-password

PGDATABASE=nakama
PGUSER=postgres
PGPASSWORD=postgres
```

### 3. Build the Nakama runtime bundle

```bash
npm run build --workspace nakama
```

### 4. Start PostgreSQL and Nakama locally

```bash
docker compose up --build
```

Local backend endpoints:

- Nakama API and socket: `http://127.0.0.1:7350`
- Nakama console: `http://127.0.0.1:7351`

### 5. Run the frontend locally

In a separate terminal:

```bash
npm run dev --workspace frontend
```

Use these frontend environment variables locally:

```bash
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SSL=false
VITE_NAKAMA_SERVER_KEY=devkey
```

The frontend will then connect to the local Nakama instance over WebSockets.

## Architecture and Design Decisions

### High-level architecture

The system is split into two deployable parts:

1. A React frontend responsible for user interaction, device authentication, room discovery, matchmaking initiation, realtime socket subscriptions, and rendering board state.
2. A Nakama backend responsible for authoritative game state, move validation, room creation, matchmaking callbacks, leaderboard writes, and player stat persistence.

### Why Nakama is authoritative

The game logic runs on the server instead of trusting the client. This prevents users from:

- playing out of turn
- overwriting occupied cells
- modifying the board locally and claiming illegal moves
- bypassing timeout and disconnect rules

All player moves are sent to Nakama as intents, and Nakama broadcasts the validated state back to both clients.

### Frontend design choices

- Device authentication is used so players can join quickly without a full signup flow.
- A nickname gate stores the chosen username locally and updates the Nakama account profile.
- A shared socket connection avoids repeatedly reconnecting when React components remount.
- Lobby and match views are separated so the UI stays focused during gameplay.

### Backend design choices

- Authoritative matches are implemented with Nakama match handlers.
- RPC endpoints are used for creating rooms, listing open rooms, and reading leaderboard data with player stats.
- Match labels expose searchable metadata such as mode, openness, and player count for room discovery.
- Timed mode uses server-side tick-based countdown logic, so timeout wins are enforced consistently.

### Persistence model

- Global wins are tracked in the `wins_global` Nakama leaderboard.
- Per-player wins, losses, draws, streaks, and total games are stored in Nakama storage under `player_stats/summary`.
- Disconnects and timeouts are recorded as forfeits/losses where applicable.

## API and Server Configuration Details

### Frontend configuration

The client reads these variables:

```bash
VITE_NAKAMA_HOST=<backend hostname>
VITE_NAKAMA_PORT=<backend port>
VITE_NAKAMA_SSL=<true or false>
VITE_NAKAMA_SERVER_KEY=<same public server key configured in Nakama>
```

### Backend configuration

The Nakama service expects:

```bash
DATABASE_URL=<preferred Railway Postgres connection string>
NAKAMA_SERVER_KEY=<public client key>
NAKAMA_SESSION_ENCRYPTION_KEY=<secret>
NAKAMA_HTTP_KEY=<secret>
NAKAMA_CONSOLE_USERNAME=<console username>
NAKAMA_CONSOLE_PASSWORD=<console password>
NAKAMA_CORS_ALLOWED_ORIGIN=<frontend URL>
```

If `DATABASE_URL` is not provided, the startup script can also build the database connection from:

```bash
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE
```

### Important configuration notes

- `VITE_NAKAMA_SERVER_KEY` is a client-visible key and must match `NAKAMA_SERVER_KEY`.
- `NAKAMA_SESSION_ENCRYPTION_KEY`, `NAKAMA_HTTP_KEY`, and console credentials are secrets and must not be committed.
- Railway terminates HTTPS publicly, so the frontend should use `VITE_NAKAMA_SSL=true` and `VITE_NAKAMA_PORT=443`.
- The Nakama console should stay bound to `127.0.0.1` in production so it is not publicly exposed.
- `NAKAMA_CORS_ALLOWED_ORIGIN` should be set to your deployed frontend URL after Vercel deployment.

## Deployment Process Documentation

### Backend deployment on Railway

Architecture used in production:

- one Railway PostgreSQL service
- one Railway service built from this repository's root `Dockerfile`

Steps:

1. Push this repository to GitHub or GitLab.
2. Create a new Railway project.
3. Add a PostgreSQL service.
4. Add a new service from the source repository.
5. Point Railway at the root `Dockerfile`.
6. Enable public networking for the backend service.
7. Expose port `7350` if Railway asks which port to publish.
8. Add these environment variables to the backend service:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
NAKAMA_SERVER_KEY=<your-public-client-key>
NAKAMA_SESSION_ENCRYPTION_KEY=<long-random-secret>
NAKAMA_HTTP_KEY=<long-random-secret>
NAKAMA_CONSOLE_USERNAME=<admin-username>
NAKAMA_CONSOLE_PASSWORD=<strong-password>
NAKAMA_CORS_ALLOWED_ORIGIN=<your Vercel frontend URL>
```

After deployment, Railway will provide a public domain such as:

```text
https://your-backend-name.up.railway.app
```

Use only the hostname portion of that URL when configuring the frontend.

### Frontend deployment on Vercel

Steps:

1. Import the same repository into Vercel.
2. Set the project root to `frontend/`.
3. Add these environment variables:

```bash
VITE_NAKAMA_HOST=<your Railway hostname without https://>
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SSL=true
VITE_NAKAMA_SERVER_KEY=<same value as NAKAMA_SERVER_KEY>
```

4. Deploy the project.
5. Copy the generated frontend URL.
6. Update Railway `NAKAMA_CORS_ALLOWED_ORIGIN` to that exact frontend URL and redeploy the backend if needed.

### Final submission checklist

- Repository is pushed to GitHub or GitLab
- Frontend is publicly accessible
- Railway backend endpoint is publicly accessible
- README contains the final repository URL, game URL, and backend endpoint
- CORS origin matches the deployed frontend URL
- Frontend and backend use the same server key

## Gameplay and Multiplayer Flow

### Manual room flow

1. Player A chooses a mode and clicks `Create Room`.
2. Nakama creates an authoritative match through the `create_match` RPC.
3. Player B refreshes rooms and joins an open room from the list.
4. When two players are present, the server starts the match automatically.

### Matchmaker flow

1. A player chooses `Classic` or `Timed`.
2. The client submits a Nakama matchmaker request with the selected mode in properties.
3. When two compatible players are available, Nakama creates an authoritative room through the matchmaker callback.
4. Both clients join the assigned match and receive the server state over the socket.

### Server validation rules

- only the current player can move
- positions must be within the 3x3 board
- occupied cells cannot be played again
- timeouts in timed mode end the match on the server
- disconnects during a live match are treated as forfeits

## How to Test the Multiplayer Functionality

### Local test

1. Start the backend with `docker compose up --build`.
2. Start the frontend with `npm run dev --workspace frontend`.
3. Open the game in two browser windows, two browsers, or two devices on the same network.
4. Enter different nicknames for each player.
5. Test manual room creation:
   - create a room in one window
   - refresh and join it from the second window
6. Test automatic matchmaking:
   - choose the same mode on both clients
   - click `Auto Matchmake`
7. Verify gameplay rules:
   - turns alternate correctly
   - invalid or duplicate moves are rejected
   - wins and draws end the match correctly
8. Verify timed mode:
   - select timed mode
   - wait for one player to run out of time
   - confirm the other player is awarded the win
9. Verify disconnect handling:
   - close one player window during an active match
   - confirm the remaining player receives a forfeit win
10. Verify persistence:
   - refresh the leaderboard
   - confirm completed results affect wins, losses, draws, and streaks

### Deployed test

Repeat the same flow using:

- one browser window on your laptop
- one incognito window, second browser, or mobile device

This demonstrates that the live frontend and live Nakama backend can communicate correctly over the public deployment.

## Notes for Evaluators

- The frontend authenticates players automatically using Nakama device authentication.
- The server is authoritative, so multiplayer rules are enforced centrally rather than trusted from the client.
- The leaderboard and player statistics persist across matches through Nakama storage and leaderboard APIs.
