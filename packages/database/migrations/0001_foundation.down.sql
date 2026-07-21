-- Development/test recovery aid only. Production rollback requires an approved,
-- rehearsed change and coordinated data restore; do not run this against live data.
DROP SCHEMA IF EXISTS document CASCADE;
DROP SCHEMA IF EXISTS platform CASCADE;
DROP SCHEMA IF EXISTS project CASCADE;
DROP SCHEMA IF EXISTS iam CASCADE;
DROP SCHEMA IF EXISTS party CASCADE;
