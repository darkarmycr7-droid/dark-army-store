#!/bin/sh
# Starts both halves of the demo container. See Dockerfile.demo for the layout.
set -e

# No JWT secret is committed. Generating one per boot means sign-ins do not
# survive a restart, which is the right trade for a throwaway demo: no secret
# in a public repository, and nothing long-lived to leak.
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  export JWT_SECRET
fi

# The API binds 4000 inside the container. PORT is set per-process so it does
# not disturb the PORT the host assigns to the public web server below.
echo "[demo] starting API on 4000"
cd /app/api
PORT=4000 node dist/index.js &
api_pid=$!

# If the API dies, the container should die too rather than serve a storefront
# with no data behind it.
trap 'kill -TERM "$api_pid" 2>/dev/null' TERM INT

# Give Express a moment to bind, so the first server-rendered page finds it.
sleep 2

echo "[demo] starting web on ${PORT:-10000}"
cd /app/web
exec node server.js
