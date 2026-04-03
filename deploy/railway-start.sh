#!/bin/sh
set -eu

: "${PORT:=7350}"
: "${NAKAMA_CONSOLE_ADDRESS:=127.0.0.1}"
: "${NAKAMA_CONSOLE_PORT:=7351}"
: "${NAKAMA_SERVER_KEY:?set NAKAMA_SERVER_KEY}"
: "${NAKAMA_SESSION_ENCRYPTION_KEY:?set NAKAMA_SESSION_ENCRYPTION_KEY}"
: "${NAKAMA_HTTP_KEY:?set NAKAMA_HTTP_KEY}"
: "${NAKAMA_CONSOLE_USERNAME:?set NAKAMA_CONSOLE_USERNAME}"
: "${NAKAMA_CONSOLE_PASSWORD:?set NAKAMA_CONSOLE_PASSWORD}"

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_ADDRESS="${DATABASE_URL#postgres://}"
  DATABASE_ADDRESS="${DATABASE_ADDRESS#postgresql://}"
  DATABASE_ADDRESS="${DATABASE_ADDRESS%%\?*}"
else
  : "${PGHOST:?set PGHOST or DATABASE_URL}"
  : "${PGPORT:?set PGPORT or DATABASE_URL}"
  : "${PGUSER:?set PGUSER or DATABASE_URL}"
  : "${PGPASSWORD:?set PGPASSWORD or DATABASE_URL}"
  : "${PGDATABASE:?set PGDATABASE or DATABASE_URL}"
  DATABASE_ADDRESS="${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
fi

cat > /nakama/data/config.yml <<EOF
name: "tic-tac-toe"
database:
    address:
        - "${DATABASE_ADDRESS}"
socket:
    address: "0.0.0.0"
    port: ${PORT}
    server_key: "${NAKAMA_SERVER_KEY}"
session:
    encryption_key: "${NAKAMA_SESSION_ENCRYPTION_KEY}"
runtime:
    http_key: "${NAKAMA_HTTP_KEY}"
console:
    address: "${NAKAMA_CONSOLE_ADDRESS}"
    port: ${NAKAMA_CONSOLE_PORT}
    username: "${NAKAMA_CONSOLE_USERNAME}"
    password: "${NAKAMA_CONSOLE_PASSWORD}"
shutdown_grace_sec: 30
EOF

until /nakama/nakama migrate up --database.address "${DATABASE_ADDRESS}"; do
  echo "Waiting for PostgreSQL to accept connections..."
  sleep 2
done

exec /nakama/nakama --config /nakama/data/config.yml --database.address "${DATABASE_ADDRESS}"
