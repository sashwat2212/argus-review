#!/bin/bash
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/argus_neon_$TIMESTAMP.sql.gz"
mkdir -p backups

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
echo "✅ Neon backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
