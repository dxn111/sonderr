---
id: spreadsheets
name: Spreadsheet models
category: Data
icon: ▦
triggers: spreadsheet, excel, xlsx, google sheets, formula, vlookup, pivot table, budget model, forecast, cells, workbook
summary: Build spreadsheets that survive contact with users — clean inputs, auditable formulas, no hardcodes.
---
## When to use
- Creating or fixing spreadsheets: budgets, forecasts, trackers, pivot-style summaries, CSV exports for Excel users.

## Approach
Separate inputs, calculations, and outputs. A model where numbers are typed into formula rows is a model nobody can trust.

## Steps
1. Clarify the model's job: what varies (inputs), what is computed, what decision it supports.
2. Structure sheets: an Inputs sheet (typed values, one per row, labeled), a Calc area (formulas only referencing Inputs), a Summary/Output view.
3. Use whole-column references and named ranges instead of A1 chains; never embed constants inside formulas — every assumption lives in a cell the user can change.
4. Prefer simple functions (SUMIFS, INDEX/MATCH, IF) over exotic ones; document non-obvious formulas in an adjacent note column.
5. Generate .xlsx/.csv programmatically with a script (openpyxl or similar) and verify by re-opening and recomputing totals.
6. Present the finished workbook with present_file and list the assumptions in chat.

## Pitfalls
- VLOOKUP with unsorted ranges or volatile full-table lookups; broken references after row inserts.
- Hiding errors with IFERROR instead of fixing the cause.
- Merged cells inside data ranges — they destroy sorting, pivots, and scripts.

## Verify
- Reopen the saved workbook and recalculate; test representative edge values and blank inputs.
- Reconcile key totals independently and confirm formulas, validation, and number formats cover the intended range.
- State assumptions and unsupported spreadsheet features that were not verified in the target application.
