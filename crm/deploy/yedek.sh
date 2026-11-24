#!/bin/sh
# Satal — gece yedeği: veritabanı + yüklenen belgeler. Son 30 günü saklar.
# Kullanım (sunucuda, cron ile her gece): /opt/satal/crm/deploy/yedek.sh
set -eu
cd "$(dirname "$0")/.."
HEDEF="${YEDEK_KLASORU:-/var/yedek/satal}"
GUN="$(date +%Y-%m-%d)"
mkdir -p "$HEDEF"
umask 077
docker compose exec -T veritabani pg_dump -U postgres -Fc satal > "$HEDEF/satal-$GUN.dump.tmp"
mv "$HEDEF/satal-$GUN.dump.tmp" "$HEDEF/satal-$GUN.dump"
docker compose exec -T uygulama tar -C /veri -czf - yuklemeler > "$HEDEF/belgeler-$GUN.tar.gz.tmp"
mv "$HEDEF/belgeler-$GUN.tar.gz.tmp" "$HEDEF/belgeler-$GUN.tar.gz"
find "$HEDEF" -type f -mtime +30 \( -name 'satal-*.dump' -o -name 'belgeler-*.tar.gz' \) -delete
echo "Yedek alındı: $HEDEF ($GUN)"
