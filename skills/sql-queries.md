---
id: sql-queries
name: SQL and queries
category: Data
icon: ⌸
triggers: sql, query, select, join, database, postgres, mysql, sqlite, index, slow query, group by, migration sql, schema query
summary: Write correct, fast SQL — inspect schema first, explain the plan, never guess a column.
---
## When to use
- Writing or fixing SQL queries, views, indexes; debugging slow queries; answering questions from a database.

## Approach
Read the schema before writing a single query — table definitions, real column names, existing indexes. A query that references a guessed column name is wrong before it runs.

## Steps
1. Inspect schema (read migrations, schema files, or run `sqlite3 .schema` / information_schema queries via tools).
2. Write the smallest query that answers the question; explicit JOINs with ON conditions, no SELECT * in production code.
3. For slow queries: explain/analyze first, fix second — add the index the plan is missing, not the index you assume helps.
4. Aggregate with GROUP BY and validate counts against the raw rows; a join fan-out silently multiplies rows.
5. Wrap destructive statements (UPDATE/DELETE) in a transaction and confirm the WHERE clause matches a bounded set; preview with SELECT first.
6. Save multi-query work as a .sql file in the workspace and present it.

## Pitfalls
- Implicit cross joins from missing ON conditions; NULL comparisons with = instead of IS NULL.
- SELECT DISTINCT to hide fan-out — it masks the bug instead of fixing it.
- Indexing every column: writes pay for every read gain.

## Verify
- Run a SELECT preview before any mutation and use a transaction plus a bounded predicate for writes.
- Compare result counts with a simple baseline and inspect the query plan for performance changes.
- Report the database engine/version and whether the query ran against real data or a fixture.
