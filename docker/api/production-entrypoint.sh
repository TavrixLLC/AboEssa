#!/bin/sh
set -eu

database_password="$(cat /run/secrets/postgres_password)"
redis_password="$(cat /run/secrets/redis_password)"

export DATABASE_URL="$(ABOESSA_SECRET_VALUE="$database_password" node -e "process.stdout.write('postgresql://postgres:' + encodeURIComponent(process.env.ABOESSA_SECRET_VALUE) + '@postgres:5432/live_commerce?schema=public')")"
export REDIS_URL="$(ABOESSA_SECRET_VALUE="$redis_password" node -e "process.stdout.write('redis://:' + encodeURIComponent(process.env.ABOESSA_SECRET_VALUE) + '@redis:6379')")"

unset database_password redis_password ABOESSA_SECRET_VALUE

# Normal restarts may inspect migration state but must not silently change schema.
# The reviewed one-shot deploy-only command is an explicit final-GO operation.
case "${ABOESSA_MIGRATION_MODE:-status}" in
  status) npx --no-install prisma migrate status ;;
  status-only) npx --no-install prisma migrate status; exit 0 ;;
  diff-only)
    npx --no-install prisma migrate diff \
      --from-schema-datasource prisma/schema.prisma \
      --to-schema-datamodel prisma/schema.prisma --exit-code
    exit 0 ;;
  deploy-only) npx --no-install prisma migrate deploy; exit 0 ;;
  *) echo 'Unsupported migration mode; refusing startup.' >&2; exit 1 ;;
esac
exec node dist/src/main.js
