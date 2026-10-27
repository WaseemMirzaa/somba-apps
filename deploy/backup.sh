#!/usr/bin/env bash
# Somba&Teka nightly backup: MySQL dump + uploads, kept for $KEEP_DAYS days.
# Installed by droplet-deploy.sh as /etc/cron.d/somba-backup (03:15 daily).
# Restore:  gunzip -c db-YYYYMMDD.sql.gz | mysql somba      tar -xzf uploads-YYYYMMDD.tgz -C /
# Copy the folder off the droplet too (rsync / rclone / DigitalOcean Spaces): a backup on the same disk is not a backup.
set -euo pipefail
DEST="${BACKUP_DIR:-/var/backups/somba}"
KEEP_DAYS="${KEEP_DAYS:-14}"
UPLOAD_DIR="${UPLOAD_DIR:-/opt/somba/uploads}"
PRIVATE_UPLOAD_DIR="${PRIVATE_UPLOAD_DIR:-/opt/somba/uploads-private}"
STAMP="$(date +%Y%m%d)"
umask 077
mkdir -p "$DEST"
mysqldump --single-transaction --routines --no-tablespaces somba | gzip -9 > "$DEST/db-$STAMP.sql.gz.tmp"
mv "$DEST/db-$STAMP.sql.gz.tmp" "$DEST/db-$STAMP.sql.gz"
[ -d "$UPLOAD_DIR" ] && tar -czf "$DEST/uploads-$STAMP.tgz" "$UPLOAD_DIR" 2>/dev/null || true
# KYC documents (private): same retention, kept out of the public archive.
[ -d "$PRIVATE_UPLOAD_DIR" ] && tar -czf "$DEST/uploads-private-$STAMP.tgz" "$PRIVATE_UPLOAD_DIR" 2>/dev/null || true
find "$DEST" -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tgz' -o -name 'uploads-private-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $(ls -1 "$DEST" | wc -l) files in $DEST"
