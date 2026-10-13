# WhatsApp Group Auto-Reply Bot — Implementation Plan

A Node.js bot that runs WhatsApp Web inside a real Chrome browser on Windows and
posts a custom plain-text message into a WhatsApp group every time anyone sends a message.

**Status:** Steps 1–6 implemented. Windows login confirmed by the user; the reply
engine is covered by automated tests and awaits a live test in an enabled group.

---

## 1. Confirmed decisions

| Decision | Choice |
| --- | --- |
| Trigger scope | New eligible messages in explicitly allowed WhatsApp groups |
| Reply style | **Plain message** (not a quote-reply) |
| Mention the sender back | **No** |
| Language | Plain JavaScript (CommonJS) |
| Runtime | Node.js 22 LTS |
| Platform | Windows 11, WhatsApp Web in local Google Chrome |
| Session persistence | `LocalAuth` |

---

## 2. Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | whatsapp-web.js v1 requires Node >= 18; LTS for stability |
| Language | JavaScript, CommonJS | Matches the official docs and `example.js` verbatim; no build step |
| WhatsApp driver | `whatsapp-web.js` ^1.34 | Documents and supports pointing Puppeteer at a real Chrome install |
| Browser | Locally installed Google Chrome via `executablePath` | Bundled Puppeteer Chromium lacks H.264/AAC and breaks WhatsApp Web more often |
| QR rendering | `qrcode-terminal` | Prints a scannable QR in the console |
| Session | `LocalAuth` (built into the library) | Persists to `.wwebjs_auth/`. No database, no extra dependency |
| Config | `.env` + `dotenv` | Standard, trivially gitignored |
| State | Plain `fs` + JSON files | A database is unjustified for this workload |
| Process supervision | `pm2` (optional, phase 7) | Auto-restart on crash |

**Total runtime dependencies: 3** — `whatsapp-web.js`, `qrcode-terminal`, `dotenv`.

### Rejected alternatives

- **Baileys** — pure-protocol library with no browser. Lighter and faster, but the
  requirement is explicitly WhatsApp Web in Chrome, and Baileys has a worse
  breakage record against WhatsApp server changes with no documentation support.
- **Express / a web control panel** — nothing in this bot needs an HTTP surface.
  Adding one would only create a local attack surface for no benefit.

---

## 3. Proposed file layout

```
whatsapp-meal-bot/
├── START-HERE.bat           # one-click: check Node -> install -> configure -> run
├── RESET-SESSION.bat        # one-click: wipe the saved login and re-link
├── package.json
├── .env.example              # template; real .env is never committed
├── .gitignore
├── README.md
├── PLAN.md                   # this file
├── USER-MANUAL.md            # end-user documentation
├── config/
│   ├── index.js              # loads config, applies defaults, validates
│   └── bot.json              # auto-reply behaviour configuration
├── src/
│   ├── index.js              # entry point / bootstrap
│   ├── client.js             # Client construction (Chrome path, LocalAuth, options)
│   ├── chrome.js             # Windows Chrome path auto-detection
│   ├── auth.js               # qr / code / authenticated / auth_failure / ready / disconnected
│   ├── events.js             # serialized reply queue and message lifecycle listeners
│   ├── filters.js            # shouldIgnore(msg, chat) -> boolean
│   ├── reply.js              # builds and sends the plain reply message
│   ├── ratelimit.js          # cooldown + flood guard + auto-pause
│   └── logger.js
├── test/                    # startup and reply-engine regression tests
└── data/
    ├── messages.json         # the custom replies; hot-editable, no restart needed
    └── state.json            # rate-limit timestamps (gitignored)
```

Runtime-generated and gitignored:

```
.wwebjs_auth/                 # LocalAuth session + dedicated Chrome profile
logs/
```

---

## 4. Behaviour specification

### 4.1 Trigger

The bot posts a reply into an explicitly allowed group for each eligible new
message, subject to duplicate suppression and the fixed rate limits. The empty
default allowlist sends nothing. Group IDs are printed at each successful login.
`enabled: false` disables replies after restart.

Listener selection, verified against `src/Client.js` in the library source:

```js
this.emit(Events.MESSAGE_CREATE, message);

if (msg.id.fromMe) return;

this.emit(Events.MESSAGE_RECEIVED, message);   // -> client.on('message')
```

`message` is emitted only when `msg.id.fromMe` is false, so it already excludes the
bot's own messages. The handler still guards with `if (msg.fromMe) return;` as
belt-and-braces, because a self-reply loop is the single worst failure mode here.

### 4.2 Messages that are ignored

`ignoreNonText`, `ignoreEphemeral`, and `ignoreEmpty` are configurable in
`config/bot.json`. Own messages, non-groups, unlisted groups, statuses, and system
notices are always ignored:

| Rule | Reason |
| --- | --- |
| `msg.fromMe` | Prevent the bot replying to itself in an infinite loop |
| `!chat.isGroup` | This bot is group-only by design |
| `status@broadcast` | Status broadcasts are not group messages |
| `msg.type === 'notify'` | Join / leave / promote / pin system notices |
| `msg.type !== 'chat'` | Images, video, audio, stickers, polls, locations, contacts |
| `msg.isEphemeral` | Disappearing messages are not reliably replayable |
| Media only, empty body | Nothing to acknowledge |

### 4.3 Reply construction

- Template loaded from `data/messages.json`.
- Supports the placeholders `{author}`, `{group}`, `{body}`, `{time}`.
- Support for multiple named templates with a deterministic selection policy, so the
  group does not receive an identical line 400 times in a row.
- Sent as a **plain message** — no quote, no mention of the sender.
- Templates are named entries in `data/messages.json` and rotate in file order
  for each group. Saved edits take effect on the next send without restarting.
- Replayed messages older than the current login are ignored. Disconnects cancel
  queued replies; reconnects do not send a backlog.

### 4.4 Safety rails

These are **hard-coded, not configuration**, because they are what keeps the number alive.

| Rail | Default | Purpose |
| --- | --- | --- |
| Global cooldown between replies | 8 s | Prevents rapid-fire bursts |
| Random pre-send delay | 2–6 s | Jitter is the strongest single anti-spam signal |
| Per-group rolling cap | 20 replies / 10 min | Stops runaway loops |
| Auto-pause on cap breach | yes | Halts replies and logs a loud warning |
| Serialised reply queue | always | Concurrent messages cannot race or double-send |
| Duplicate body suppression | 5 min window | Stops ping-pong echo loops between members |
| Maximum queued triggers | 100 | Bounds memory; excess messages are dropped |

Rate-limit state is persisted to `data/state.json` so restarts do not reset the budget.
The per-group pause ends when the rolling window frees space. State is written
atomically before sending, and includes hashes of bodies rather than their text.
Uncertain network failures are never retried automatically: this prevents double
posting but cannot guarantee delivery. Invalid state blocks startup until repaired.

---

## 5. Windows-specific configuration

```js
puppeteer: {
  executablePath: detectedChromePath,
  headless: false,            // keep the window visible for debugging
  defaultViewport: null,      // respect the real window size
  args: ['--start-maximized'],
}
```

Chrome path detection order (`src/chrome.js`):

1. `CHROME_PATH` environment variable — manual override
2. `C:\Program Files\Google\Chrome\Application\chrome.exe`
3. `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
4. `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`

> The upstream docs list the `(x86)` path as the default. Modern Chrome installs to
> `C:\Program Files\`, so both are checked.

Additional Windows notes:

- The bot uses its **own** Chrome profile inside `.wwebjs_auth/`. It does not collide
  with, or read from, the everyday Chrome profile. Do not link a personal WhatsApp
  account into it.
- The bot appears under **Settings -> Linked devices** on the linked phone. Set
  `deviceName: 'Meal Bot'` and `browserName: 'Chrome'` so it is identifiable.
- Run in a dedicated terminal window. `Ctrl+C` triggers a clean `client.destroy()`.
- If running on a server rather than a desktop, add `args: ['--no-sandbox',
  '--disable-setuid-sandbox']`. Not required for local Windows use.

---

## 6. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **WhatsApp bans the number.** Auto-replying to every message in a group is textbook spam behaviour and is the fastest route to a ban. | High | Hard rate limits, 2-6 s jitter, per-group caps, auto-pause. Use a **spare number/SIM**, never a personal number. |
| WhatsApp Web UI changes break the injected selectors | Medium | Pin `webVersion` and `webVersionCache` once stable so a WhatsApp-side release cannot silently break the bot. |
| Device marked untrusted / `TOS_BLOCK` / `UNPAIRED` state | Medium | Log every `change_state` value loudly; alert and prompt for a manual QR re-scan. |
| Crash leaves a zombie Chrome process | Low | `pm2` supervision plus a `disconnected` handler that destroys and re-initialises with exponential backoff. |
| Secrets committed to git | Low | `.gitignore` covers `.env`, `.wwebjs_auth/`, `data/state.json`, `logs/`. |
| Accidentally posting the auto-reply outside the target group | Medium | Explicit group allowlist in `config/bot.json`; default is deny-all until populated. |

---

## 7. Build order

| Step | Deliverable | Gate |
| --- | --- | --- |
| 1 | `package.json`, deps, `.gitignore`, `.env.example` | ✅ Done |
| 2 | `src/client.js`, `src/chrome.js`, `src/auth.js` | ✅ Done; user confirmed Windows login works |
| 3 | `src/events.js`, `src/filters.js` | ✅ Done; group-only allowlist and filters tested |
| 4 | `src/ratelimit.js`, `src/reply.js` | ✅ Done; serialized sends, persistent limits, deduplication tested |
| 5 | `config/bot.json`, `data/messages.json` | ✅ Done; editable behavior and template reload tested |
| 6 | `README.md` with run and troubleshooting steps | ✅ Updated for auto-replies |
| 7 | Optional `pm2` ecosystem file | Superseded — `USER-MANUAL.md` documents Task Scheduler instead |

The user confirmed that Windows startup and login work. The remaining live
acceptance check is to enable a group, send a new message from another member,
and confirm the plain-text reply. `npm test` covers the local behavior without
connecting to WhatsApp or sending real messages.

---

## 7a. Windows one-click deployment

Added because deploying the bot should not require reading a terminal tutorial.

**`START-HERE.bat`** — the single-click entry point. Run order:

1. **Node.js check** — detects `node`; if absent, attempts
   `winget install OpenJS.NodeJS.LTS`, then patches `PATH` in-session (winget does
   not refresh the running shell). Falls back to opening nodejs.org.
2. **Version gate** — rejects Node < 18 via `node -p "process.versions.node..."`.
3. **Dependency install** — always runs `npm install --no-fund --no-audit` so the
   launch is also the update path.
4. **Config bootstrap** — copies `.env.example` to `.env` if absent, never
   overwriting an existing one.
5. **Run** — `npm start`, then `pause` so the window does not vanish on exit.

Sets `PUPPETEER_SKIP_DOWNLOAD=1` before installing, skipping Puppeteer's ~150 MB
bundled Chromium. The bot drives real Chrome, so that download is wasted time and
disk.

The window is held open on every exit path. A launcher that closes itself is the
most common way first-run debugging goes wrong.

**`RESET-SESSION.bat`** — guarded session wipe, with a typed `YES` confirmation,
for the "logged out remotely / switching numbers / corrupted session" path.

**Deliberately not done:**

- *A compiled `.exe`.* Node SEA / `pkg` bundling breaks against Puppeteer's on-disk
  Chromium and profile files. The complexity buys nothing.
- *A PowerShell `.ps1`.* Default execution policy (`Restricted`) silently blocks
  double-clicked scripts. Batch is more reliable for a literal one-click.
- *A Windows installer.* MSI/NSIS wrapping a folder of `.bat` and `.json` adds a
  build toolchain and an uninstaller for no benefit.

Windows startup/login has been confirmed by the user. The development environment
is macOS, so local regression checks use mocked WhatsApp clients and real temporary
state directories. Session reset is tested against the same configuration sources
as the client and deletes only `session-meal-bot` inside the configured data path.

---

## 8. Out of scope for v1

- Scheduled/pushed messages on a timer
- Menu or data management commands
- Web dashboard or remote control
- Multi-group differentiation of reply templates
- Reaction-based or keyword-triggered replies

These are noted so they can be added without a rewrite later.
