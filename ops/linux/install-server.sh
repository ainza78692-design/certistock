#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
APP_ROOT="${APP_ROOT:-/opt/apps/certistock}"
SHARED_ROOT="$APP_ROOT/shared"
LOG_DIR="${LOG_DIR:-/opt/logs/certistock}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/certistock}"
DATA_ROOT="${DATA_ROOT:-/srv/certistock/data}"

sudo apt-get update
sudo apt-get install -y nginx postgresql postgresql-client git curl jq rsync zstd fail2ban ufw python3 python3-venv

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

sudo adduser --system --group --home "$APP_ROOT" certistock || true
sudo mkdir -p "$APP_ROOT" "$SHARED_ROOT" "$LOG_DIR" "$BACKUP_ROOT" "$DATA_ROOT/files" "$DATA_ROOT/updates"
sudo chown -R certistock:certistock "$APP_ROOT" "$LOG_DIR" "$BACKUP_ROOT" "$DATA_ROOT"

if [[ ! -f "$SHARED_ROOT/env" && -f "$ROOT_DIR/ops/linux/certistock.env.example" ]]; then
  sudo install -m 600 "$ROOT_DIR/ops/linux/certistock.env.example" "$SHARED_ROOT/env"
  sudo chown certistock:certistock "$SHARED_ROOT/env"
fi

sudo install -m 644 "$ROOT_DIR/ops/nginx/certistock.conf" /etc/nginx/sites-available/certistock.conf
sudo ln -sfn /etc/nginx/sites-available/certistock.conf /etc/nginx/sites-enabled/certistock.conf

sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-ocr.service" /etc/systemd/system/certistock-ocr.service
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-backup-daily.service" /etc/systemd/system/certistock-backup-daily.service
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-backup-daily.timer" /etc/systemd/system/certistock-backup-daily.timer
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-backup-weekly.service" /etc/systemd/system/certistock-backup-weekly.service
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-backup-weekly.timer" /etc/systemd/system/certistock-backup-weekly.timer
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-retention.service" /etc/systemd/system/certistock-retention.service
sudo install -m 644 "$ROOT_DIR/ops/systemd/certistock-retention.timer" /etc/systemd/system/certistock-retention.timer

sudo install -m 755 "$ROOT_DIR/ops/linux/deploy-certistock.sh" /usr/local/bin/deploy-certistock.sh
sudo install -m 755 "$ROOT_DIR/ops/linux/rollback-certistock.sh" /usr/local/bin/rollback-certistock.sh
sudo install -m 755 "$ROOT_DIR/ops/linux/certistock-backup.sh" /usr/local/bin/certistock-backup.sh
sudo install -m 755 "$ROOT_DIR/ops/linux/certistock-health-check.sh" /usr/local/bin/certistock-health-check.sh
sudo install -m 755 "$ROOT_DIR/ops/linux/certistock-retention.sh" /usr/local/bin/certistock-retention.sh
sudo install -m 755 "$ROOT_DIR/ops/linux/setup-postgres.sh" /usr/local/bin/setup-postgres.sh

sudo systemctl daemon-reload
sudo systemctl enable --now nginx
sudo systemctl enable --now certistock-backup-daily.timer certistock-backup-weekly.timer certistock-retention.timer

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

echo "Install complete. Next steps: populate $SHARED_ROOT/env, run /usr/local/bin/setup-postgres.sh with DB_PASSWORD, then register the GitHub runner on this server."
