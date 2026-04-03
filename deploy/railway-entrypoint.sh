#!/bin/sh
set -eu

: "${PORT:=7350}"
: "${NAKAMA_SOCKET_PORT:=7350}"
: "${NAKAMA_SOCKET_ADDRESS:=127.0.0.1}"

export PORT
export NAKAMA_SOCKET_PORT
export NAKAMA_SOCKET_ADDRESS

/usr/local/bin/railway-start.sh &
nakama_pid=$!

cleanup() {
  kill "$nakama_pid" 2>/dev/null || true
}

trap cleanup INT TERM

exec /usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
