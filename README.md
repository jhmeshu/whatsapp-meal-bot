# whatsapp-meal-bot

A Windows bot that runs WhatsApp Web in your Chrome browser and posts a custom
message into a WhatsApp group every time someone writes in it.

> ⚠️ **WhatsApp does not allow bots. Use a spare number/SIM.** See the warning at
> the top of [`USER-MANUAL.md`](./USER-MANUAL.md) before running anything.

## Status

Login and session handling are done. **The auto-reply engine is not built yet** —
running this today connects the bot and does nothing else. See
[Current status](./USER-MANUAL.md#current-status).

## Quick start

1. Install Google Chrome.
2. Double-click **`START-HERE.bat`**.
3. Scan the QR code with your spare phone (WhatsApp → Settings → Linked devices).

No manual Node.js install needed — the launcher handles it.

## Commands

```bash
npm start     # run the bot
npm run dev   # run with auto-restart on file changes
```

## Documentation

| Document | Contents |
| --- | --- |
| [`USER-MANUAL.md`](./USER-MANUAL.md) | Installation, first login, configuration, troubleshooting |
| [`PLAN.md`](./PLAN.md) | Architecture, design decisions, risk register, build order |

## License

MIT