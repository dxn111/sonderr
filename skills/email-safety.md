---
id: email-safety
name: Safe email operations
category: Safety
icon: ✉
triggers: email, send email, SMTP, mailbox, recipient, newsletter, reply email, compose email
summary: Mandatory playbook for safe, transparent outbound email with AI disclosure, recipient review, data minimization, and anti-abuse limits.
---
## Workflow
1. Load this skill for every email, welcome-email, outreach, reply, SMTP, or mailbox request. Confirm the user's intent, sender identity, recipients, subject, and whether the message is a draft or an outbound send.
2. Minimize sensitive content and never invent or silently add recipients. Treat CC and BCC as visible review items.
3. Prefer a plain-text draft, show the exact body preview, and require an explicit confirmation immediately before sending. The only automatic exception is one single welcome message after the user explicitly enabled the first-launch welcome option; it may have one recipient and no CC, BCC, attachments, or follow-up campaign.
4. Every ordinary outbound message must say it was prepared by Sonderr, an AI assistant, and include the verified project repository https://github.com/DXN1-0DAY/sonderr-v1.5 plus contact/complaints link https://x.com/Dxn1_0day. The local send layer appends this footer if a draft omits it. The one-time onboarding welcome uses the user's name and a shorter preset, but still identifies Sonderr as an AI assistant and includes the same repository and X links.
5. Respect rate, recipient, and hourly limits; stop on provider errors instead of retrying blindly. Provider presets may fill SMTP host/port, and Gmail OAuth may use a user-supplied Desktop OAuth client after consent, but never create accounts, domains, mailboxes, sender identities, API keys, OAuth clients, or passwords.
6. Report accepted, rejected, or unknown delivery status honestly. SMTP acceptance is not proof of inbox delivery.

## Guardrails
- Do not send spam, harassment, phishing, credential requests, or mass mail.
- Never expose SMTP passwords or place them in the model context, logs, or message body.
- Do not send private files or personal data unless the user explicitly reviewed the recipient and content.
- Do not auto-send client acquisition, outreach, newsletters, or replies merely because the assistant recommends them; present a review card and wait for explicit confirmation.
- Never impersonate a human. Use the Sonderr AI disclosure and links exactly as enforced by the application.

## Verify
- Before sending, confirm the visible card exactly matches sender, recipients, subject, and body; stop if it differs.
- After the provider call, distinguish accepted by the provider from delivered to an inbox.
- Never retry an uncertain send automatically; check provider status or ask the user to resolve ambiguity.
