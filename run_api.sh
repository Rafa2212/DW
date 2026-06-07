#!/usr/bin/env bash
# run_api.sh — start the FastAPI server
set -e
cd "$(dirname "$0")"
uvicorn api.main:app --host 0.0.0.0 --port 8080 --reload
