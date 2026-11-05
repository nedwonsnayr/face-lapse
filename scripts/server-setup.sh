#!/usr/bin/env bash
# One-time (idempotent) setup for the Face Lapse server.
# Target: Oracle Cloud A1.Flex, Ubuntu 24.04 aarch64. Run ON the server:
#   bash ~/face-lapse/scripts/server-setup.sh
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then echo "Run as your normal user (uses sudo)"; exit 1; fi

echo "==> Packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git restic sqlite3 unattended-upgrades rsync

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Automatic security updates"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Swap (2 GB) as a safety net"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> SSH: keys only, no root login"
sudo tee /etc/ssh/sshd_config.d/99-face-lapse.conf >/dev/null <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sudo systemctl reload ssh || sudo systemctl reload sshd

# Firewall: Oracle's Ubuntu image ships iptables rules that allow only SSH
# inbound, and the VCN security list does the same. We publish no ports
# (cloudflared dials out), so nothing else needs opening. Don't add ufw —
# it fights Oracle's netfilter-persistent rules.
echo "==> Inbound rules (expect only 22/tcp ACCEPT):"
sudo iptables -S INPUT | grep -E "dport|REJECT" || true

echo "==> Git checkout (used by the GitHub Actions deploy)"
mkdir -p ~/face-lapse
if [ ! -d ~/face-lapse/.git ]; then
  git -C ~/face-lapse init -q
  git -C ~/face-lapse remote add origin https://github.com/nedwonsnayr/face-lapse.git
fi

echo "==> Data dir owned by the container user (uid 1000)"
mkdir -p ~/face-lapse/data
sudo chown -R 1000:1000 ~/face-lapse/data

echo "==> Nightly backup at 03:17 server time"
CRON_LINE="17 3 * * * $HOME/face-lapse/scripts/backup.sh >> /var/log/face-lapse-backup.log 2>&1"
# `|| true`: with no crontab yet, `crontab -l` and `grep -v` exit non-zero under pipefail.
{ sudo crontab -l 2>/dev/null | grep -v face-lapse/scripts/backup.sh || true; echo "$CRON_LINE"; } | sudo crontab -

echo "Done. Log out and back in so the docker group applies."
