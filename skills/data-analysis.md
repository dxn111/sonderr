---
id: data-analysis
name: Data analysis
category: Data
icon: ▤
triggers: analyze data, dataset, csv, statistics, stats, trends, correlation, mean, median, distribution, insights, explore data, survey, metrics
summary: Turn raw data into verified findings — profile first, compute honestly, quantify uncertainty.
---
## When to use
- The user hands you a dataset (CSV, JSON, logs, exports) and asks what it says.
- Questions like "what are the trends", "is X related to Y", "summarize this data".

## Approach
Profile before you analyze. Never compute on data you have not inspected; never report a number you have not reproduced.

## Steps
1. Inspect the raw file: columns, dtypes, row count, missing values, obvious outliers. State the shape of the data before any conclusion.
2. Ask what decision the analysis serves; pick metrics that answer that, not metrics that merely fill a report.
3. Compute with scripts (Python/Node), not by eye. Print intermediate results so each number is auditable.
4. Distinguish correlation from causation in the wording; flag small sample sizes and confounders.
5. Show the top findings with the concrete numbers attached (counts, percentages, deltas), plus one caveat per finding.
6. Deliver results as a file when they are substantial: write an analysis report or a cleaned dataset and present it with present_file.

## Pitfalls
- Averages without distributions — one outlier can invent a trend.
- Silently dropping rows with missing values; report how many were excluded and why.
- Presenting a hypothesis as a finding. Label speculation as speculation.

## Verify
- Recompute headline values from the source and reconcile totals with row counts.
- State exclusions, units, time range, sample size, and uncertainty beside the finding.
- Keep cleaned data separate from the untouched source file.
