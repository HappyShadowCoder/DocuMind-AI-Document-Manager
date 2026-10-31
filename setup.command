#!/usr/bin/env bash
# macOS double-clickable setup launcher
cd "$(dirname "$0")" || exit 1
chmod +x ./setup.sh
exec ./setup.sh
