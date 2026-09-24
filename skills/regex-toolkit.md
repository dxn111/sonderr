---
id: regex-toolkit
name: Regex construction & debugging
category: Engineering
icon: ⁂
triggers: regex, regular expression, pattern matching, grep, replace pattern, wildcard, capture group, regexp, sed
summary: Write regex that matches what you mean — anchored, escaped, and tested against good and bad inputs.
---
## When to use
- Building, fixing, or explaining regular expressions for search, validation, or transformation.
- Patterns that match too much, too little, or catastrophically backtrack.

## Approach
A regex is a program written in one line — treat it with the same rigor: define the input classes, anchor to reality, test both directions (must match AND must NOT match). The most dangerous regex is the one that silently matches the wrong thing.

## Steps
1. Write down 5+ positive examples and 5+ negative examples before writing the pattern.
2. Anchor to real structure (`^$`, word boundaries `\b`, delimiters) instead of loose substring matching.
3. Escape metacharacters deliberately (`.`, `+`, `?`, `(`, `)`, `[`, `]`, `{`, `}`, `|`, `^`, `$`, `\`) — a raw dot matches everything.
4. Prefer specific character classes (`[a-z]{2,10}`) over greedy `.*`; make greediness lazy (`*?`) when the next token must win.
5. Name capture groups where the language supports it — `(?<year>\d{4})` reads itself.
6. Check for catastrophic backtracking on adversarial input (nested quantifiers like `(a+)+`).
7. Test the pattern against the positive AND negative examples; quote the results.

## Pitfalls
- Regex-as-validation for emails/HTML — use a real parser where one exists.
- Case sensitivity forgotten; multiline mode misunderstood (`^` per-line vs per-string).
- Replacing with `$1` when the group index shifted after an edit.

## Verify
- Pattern run against all prepared examples with results shown; no false matches on the negative set.
