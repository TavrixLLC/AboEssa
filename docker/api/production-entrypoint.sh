#!/bin/sh
set -eu

database_password="$(cat /run/secrets/postgres_password)"
redis_password="$(cat /run/secrets/redis_password)"

export DATABASE_URL="$(ABOESSA_SECRET_VALUE="$database_password" node -e "process.stdout.write('postgresql://postgres:' + encodeURIComponent(process.env.ABOESSA_SECRET_VALUE) + '@postgres:5432/live_commerce?schema=public')")"
export REDIS_URL="$(ABOESSA_SECRET_VALUE="$redis_password" node -e "process.stdout.write('redis://:' + encodeURIComponent(process.env.ABOESSA_SECRET_VALUE) + '@redis:6379')")"

unset database_password redis_password ABOESSA_SECRET_VALUE

npx prisma migrate deploy
exec node dist/src/main.js
