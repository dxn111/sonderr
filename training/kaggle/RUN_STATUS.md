# Sonderr-v1 continuation run status

- **Active kernel:** [Sonderr-v1 Identity Continuation · 15 Epochs](https://www.kaggle.com/code/danipostma/sonderr-v1-identity-continuation-15-epochs)
- **Completed version:** 22 (Kaggle status: COMPLETE)
- **Accelerator:** Nvidia Tesla T4; run completed successfully.
- **Continuation:** continued the existing 7-epoch adapter for 15 more epochs, producing 22 total training epochs, then merged the learned weights into a single Transformers checkpoint.
- **Dataset:** 191 training rows and 17 validation rows, including 93 personality training conversations and 12 personality validation conversations.
- **Final output:** `sonderr-v1/merged-model/` and `sonderr-v1/training-summary.json` in Kaggle output. The model is merged; no PEFT adapter is needed for inference.

## Validation and checkpoint selection

The lowest validation loss in version 22 was at total epoch 10 (stage epoch 3): **2.42785**. The run continued to total epoch 22, where training loss was **0.0184** and validation loss was **4.72900**, consistent with substantial overfitting.

The notebook used `save_total_limit=2` during training, then deleted `recovery-checkpoints/` after creating the merged model. Kaggle saved the epoch-22 merged model and summary but no epoch-10 checkpoint. Therefore the exact epoch-10 weights cannot be selected from version 22; a new run from the epoch-7 adapter would be required to create an epoch-10-equivalent merged model and preserve its selected checkpoint. Such a rerun would not reproduce the exact epoch-10 weights from version 22 because its learning-rate schedule would differ.

Completed UTC: 2026-09-27T04:57:26.170209+00:00.
