# whatsapp-meal-bot

A Windows bot that runs WhatsApp Web in your Chrome browser and posts a custom
message into a WhatsApp group every time someone writes in it.

> ⚠️ **WhatsApp does not allow bots. Use a spare number/SIM.** See the warning at
> the top of [`USER-MANUAL.md`](./USER-MANUAL.md) before running anything.

## Status

Login, group filtering, reply templates, and persisted rate limits are implemented.
Windows login has been confirmed. Replies are limited to the group IDs you enable
in `config/bot.json`; the default empty allowlist sends nothing.

## Quick start

1. Install Google Chrome.
2. Double-click **`START-HERE.bat`**.
3. Scan the QR code with your spare phone (WhatsApp → Settings → Linked devices).
4. Add the bot number to your group. Restart the bot to print the available group
   names and IDs, then copy your target ID into `allowedGroups` in `config/bot.json`.
5. Edit the text in `data/messages.json`, then restart the bot to apply the group
   selection. Send a new text message from another member to test the reply.

No manual Node.js install needed — the launcher handles it.

## Commands

```bash
npm start     # run the bot
npm run dev   # run with auto-restart on file changes
npm test      # regression tests; no WhatsApp connection or messages sent
```

For example, set `"allowedGroups": ["123456789@g.us"]` using the actual ID printed
by your bot. Set `"enabled": false` and restart to disable replies.

Templates rotate in order for each group and support `{author}`, `{group}`,
`{body}`, and `{time}`. Saved template edits take effect on the next send without
restarting. Replies are plain messages with no quotes or sender mentions.

Replies wait 2–6 seconds, are spaced at least 8 seconds apart globally, and are
limited to 20 per group in a rolling 10-minute window. Repeated bodies and echoed
replies are ignored for 5 minutes. A group pauses at its cap and resumes when the
window frees space. These limits persist in `data/state.json` across restarts.

## Documentation

| Document | Contents |
| --- | --- |
| [`USER-MANUAL.md`](./USER-MANUAL.md) | Installation, first login, configuration, troubleshooting |
| [`PLAN.md`](./PLAN.md) | Architecture, design decisions, risk register, build order |

## License

MIT
