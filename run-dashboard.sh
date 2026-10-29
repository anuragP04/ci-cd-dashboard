#!/bin/bash
# Keeps the dashboard up: if next exits for any reason, restart it after 3s.
cd "$(dirname "$0")"
while true; do
  echo "[$(date '+%H:%M:%S')] starting dev server on :3000"
  npm run dev -- --port 3000
  code=$?
  echo "[$(date '+%H:%M:%S')] exited (code $code) — restarting in 3s"
  sleep 3
done
