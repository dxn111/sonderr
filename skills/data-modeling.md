---
id: data-modeling
name: Data modeling
category: Engineering
icon: ◇
triggers: database, schema, model, migration, sql, table, query, index, storage, orm, prisma, relations, data model, entity
summary: Shape durable data models — ownership, constraints, migrations, and failure-safe reads and writes.
---
## When to use
- Introducing or changing persisted data: new entities, new fields, new relations.
- Debugging inconsistencies that trace back to unclear ownership or missing constraints.

## Approach
An entity is only defined once every question about its lifecycle has an answer: who creates it, who can change it, what happens when referenced things disappear. Prefer explicit schemas and reversible migrations over implicit drift.

## Steps
1. List entities and relations in plain language before writing schema code; mark cardinalities and nullability.
2. Define invariants (unique, required, ranges) and enforce them in the schema, not only in application code.
3. Design the access patterns first — the queries that matter most decide the indexes.
4. Write migrations that are small, ordered, and reversible; never edit history, always append.
5. Consider the ugly states explicitly: empty, partial, duplicate, concurrent writes, orphaned references.
6. Keep read and write paths symmetric: if a field is required on write, it must be safe to read everywhere.

## Pitfalls
- Indexes added after the fact with no measurement, or missing on every foreign key.
- Nullable fields whose null case no caller handles.
- Migrations that only work on a fresh database and fail on real data.

## Verify
- Migration runs cleanly on a copy of realistic data, and rolls back.
- Each query path in the feature was executed once against the new schema.
