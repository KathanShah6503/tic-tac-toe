# Multiplayer Tic-Tac-Toe with Nakama

This repository implements the Lila backend assignment as a server-authoritative Tic-Tac-Toe game using Nakama and a React frontend. The implementation follows the roadmap order: authoritative match lifecycle, matchmaking and room discovery, reducer-driven realtime UI sync, timed mode, persistent leaderboard and streak tracking, and containerized deployment assets.

## Project structure

- `nakama/`: Nakama TypeScript runtime with authoritative match logic, matchmaking hooks, room discovery RPCs, timed mode, and stat persistence.
- `frontend/`: React + Vite client with device authentication, WebSocket-based realtime updates, manual room flow, matchmaker flow, and leaderboard view.
- `deploy/`: Nakama config and Nginx reverse proxy files for production-style deployment.
- `docker-compose.yml`: CockroachDB + Nakama + Nginx local deployment stack.

## Roadmap alignment

1. `matchInit`, `matchJoinAttempt`, `matchJoin`, `matchLeave`, `matchLoop`, `matchSignal`, and `matchTerminate` are implemented in `nakama/src/main.ts`.
2. Move validation is fully server-side and clients only submit board positions.
3. Matchmaking isolates `classic` and `timed` sessions through matchmaker properties and query strings.
4. Concurrent rooms are isolated by Nakama authoritative match instances and match labels.
5. Timed mode uses a tick-based deadline instead of JavaScript timers.
6. Wins and streak data are persisted through Nakama leaderboard and storage APIs.
7. React UI uses a reducer-based socket hook to mirror authoritative broadcasts.
8. Docker and Nginx deployment files are included for cloud deployment.

## Local setup

### Frontend

1. Install workspace dependencies:

```bash
npm install
```

2. Run the frontend:

```bash
npm run dev --workspace frontend
```

3. Configure frontend environment variables if your Nakama host differs from local defaults:

```bash
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SSL=false
VITE_NAKAMA_SERVER_KEY=defaultkey
```

### Nakama runtime build

1. Build the runtime bundle:

```bash
npm run build --workspace nakama
```

2. The compiled runtime is emitted to `nakama/build/index.js`.

### Container stack

1. Replace the placeholder secrets in `deploy/config.yml`.
2. Provide TLS certificates in `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`.
3. Start the stack:

```bash
docker compose up --build
```

CockroachDB now includes a health check, and Nakama waits for the database service to become healthy before starting. This avoids the common race where Nakama starts first and fails its initial database migration.

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

## Deployment notes

- The provided `docker-compose.yml` matches the roadmap recommendation of CockroachDB + Nakama + Nginx.
- Nginx terminates TLS and forwards secure WebSocket traffic to Nakama on the internal Docker network.
- The included config intentionally uses placeholders for production secrets; replace them before deploying.

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
