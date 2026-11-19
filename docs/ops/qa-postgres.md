# Running AIGIS Postgres suites (QA)

The Vitest files named `*-schema.test.ts` and `*-fks.test.ts` apply SQL from `supabase/migrations` and `supabase/sql` against a local Postgres database. They create and drop throwaway databases. They never connect to production.

## What you need

- Postgres 14 or newer on the same machine, with `psql`, `createdb`, and `dropdb` on PATH.
- Peer or password-less access as the OS user that runs `pnpm test` (typical local install: your user is a superuser).
- Repo dependencies: `pnpm install`.

Check:

```
psql --version
createdb --version
```

## How to run

From the repo root:

```
pnpm test
```

That runs every Vitest file, including the Postgres suites. `vitest.config.mts` sets `fileParallelism: false` so the suites do not share a database.

To run only the Postgres files:

```
pnpm exec vitest run lib/identity/graph-schema.test.ts
pnpm exec vitest run lib/identity/governance-fks.test.ts
pnpm exec vitest run lib/identity/owner-schema.test.ts
pnpm exec vitest run lib/ai/explain-schema.test.ts
pnpm exec vitest run lib/identity/identity-first-schema.test.ts
pnpm exec vitest run lib/identity/provision-governance-ids.test.ts
```

## Database names

Each suite uses its own database and drops it in `afterAll`. Override the name if you need to:

| Suite | Default database | Env override |
| --- | --- | --- |
| 0004 identity graph | `aigis_pr1_test` | `AIGIS_PR1_TEST_DB` |
| 0005 governance FKs | `aigis_pr3_test` | `AIGIS_PR3_TEST_DB` |
| 0006 owner identity | `aigis_pr4_test` | `AIGIS_PR4_TEST_DB` |
| 0007 explanations | `aigis_pr7_test` | `AIGIS_PR7_TEST_DB` |
| 0008 identity-first | `aigis_pr8_test` | `AIGIS_PR8_TEST_DB` |
| 0008a governance trigger | `aigis_0008a_test` | `AIGIS_0008A_TEST_DB` |

## Owner precheck / migration / postcheck (not QA CI)

Production apply is still owner-run. The Vitest suite replays the same files against a schema built from `0001` through `0008`, then `0008a_precheck.sql`, `0008a_fix_provision_governance_ids.sql`, `0008a_postcheck.sql`, and `0008a_rollback.sql`. Do not point these scripts at prod from this environment.

## If a suite fails to start

- `createdb: command not found`: install Postgres client packages and retry.
- `permission denied to create database`: grant CREATEDB to the user, or run as a superuser.
- leftover database after a killed run: `dropdb --if-exists aigis_pr8_test` (or the name in the table above).
