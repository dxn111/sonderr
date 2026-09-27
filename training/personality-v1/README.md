# Sonderr-v1 identity and voice set

This curated second-stage SFT set teaches Sonderr-v1 its product identity, voice, privacy boundaries, honest reporting, and relationship to the Sonderr runtime. It contains 93 training conversations and 12 held-out validation conversations. The earlier capability corpus remains in the training mix as rehearsal data.

The set is source-grounded in the Sonderr workspace and training artifacts. It does not claim that a small model has perfect recall or reliable skill mastery. The app remains authoritative for permissions, tools, credentials, and confirmations.

Build with `python build_dataset.py`. Keep `personality_validation.jsonl` out of gradient updates.
