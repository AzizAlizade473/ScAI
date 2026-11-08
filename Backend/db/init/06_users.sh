#!/bin/bash
# Creates the two database users, each with only the rights it needs (least privilege).
# Names and passwords come from Backend/.env through docker-compose.yml. Nothing is hard-coded.
#   app user      -> reads/writes the app tables, reads gold (number risk)
#   pipeline user -> reads the app tables, writes bronze / silver / gold / ops
set -euo pipefail

: "${MYSQL_APP_USER:?set MYSQL_APP_USER in Backend/.env}"
: "${MYSQL_APP_PASSWORD:?set MYSQL_APP_PASSWORD in Backend/.env}"
: "${MYSQL_PIPELINE_USER:?set MYSQL_PIPELINE_USER in Backend/.env}"
: "${MYSQL_PIPELINE_PASSWORD:?set MYSQL_PIPELINE_PASSWORD in Backend/.env}"

# Escape for a single-quoted SQL string: \ -> \\ and ' -> ''
sql_str() { printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"; }
APP_USER=$(sql_str "$MYSQL_APP_USER");           APP_PASS=$(sql_str "$MYSQL_APP_PASSWORD")
PIPE_USER=$(sql_str "$MYSQL_PIPELINE_USER");     PIPE_PASS=$(sql_str "$MYSQL_PIPELINE_PASSWORD")

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<SQL
CREATE USER IF NOT EXISTS '${APP_USER}'@'%' IDENTIFIED BY '${APP_PASS}';
GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO '${APP_USER}'@'%';
GRANT SELECT ON gold.* TO '${APP_USER}'@'%';

CREATE USER IF NOT EXISTS '${PIPE_USER}'@'%' IDENTIFIED BY '${PIPE_PASS}';
GRANT SELECT ON app.* TO '${PIPE_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.* TO '${PIPE_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON silver.* TO '${PIPE_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON gold.*   TO '${PIPE_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.*    TO '${PIPE_USER}'@'%';
FLUSH PRIVILEGES;
SQL
echo "[init] database users created: ${MYSQL_APP_USER}, ${MYSQL_PIPELINE_USER}"
