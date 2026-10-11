#!/bin/sh
set -eu

export PRODUCTION_DOMAIN=shanasheel.tavrixllc.com
export ABOESSA_PRODUCTION_ENV_FILE=/etc/aboessa/production.env
export POSTGRES_PASSWORD_FILE=/etc/aboessa/secrets/postgres-password
export REDIS_PASSWORD_FILE=/etc/aboessa/secrets/redis-password
export FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/etc/aboessa/secrets/firebase-admin.json
export TLS_FULLCHAIN_FILE=/etc/letsencrypt/live/shanasheel.tavrixllc.com/fullchain.pem
export TLS_PRIVATE_KEY_FILE=/etc/letsencrypt/live/shanasheel.tavrixllc.com/privkey.pem

compose_file=/opt/aboessa/current/docker-compose.prod.yml

case "$(basename "$0")" in
  aboessa-nginx-stop)
    exec docker compose -f "$compose_file" stop nginx
    ;;
  aboessa-nginx-start)
    exec docker compose -f "$compose_file" up -d --no-deps --no-build --force-recreate nginx
    ;;
  *)
    echo "Unsupported hook name." >&2
    exit 2
    ;;
esac
