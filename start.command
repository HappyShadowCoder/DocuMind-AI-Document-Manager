#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
chmod +x ./start.sh
exec ./start.sh
