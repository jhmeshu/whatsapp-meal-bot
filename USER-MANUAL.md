# User Manual — WhatsApp Meal Bot

A Windows bot that runs WhatsApp Web inside your Chrome browser and posts a custom
message into a WhatsApp group every time someone writes in it.

---

> ## ⚠️ Read this before you start
>
> WhatsApp **does not allow bots**. Using an unofficial client is against their
> terms and can get your number permanently banned — the phone number, not just
> this program.
>
> Auto-replying to *every* message in a group is exactly the pattern their abuse
> detection is tuned to catch. This bot therefore ships with hard rate limits and
> randomised delays (see [Safety settings](#5-safety-settings)), but those only
> reduce the risk. They do not remove it.
>
> **Use a spare number and a spare SIM.** Never point this at a number you care
> about. Never run it on your main WhatsApp.
>
> If you need this for anything business-critical, use the official
> [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/)
> instead — it is the only supported route.

---

## Current status

| Area | State |
| --- | --- |
| One-click Windows launcher | ✅ Ready |
| Node.js auto-install / version check | ✅ Ready |
| Chrome detection | ✅ Ready |
| QR login and session persistence | ✅ Ready |
| Group allowlist and message filters | ✅ Ready |
| Plain-text replies and editable templates | ✅ Ready |
| Persisted rate limits and automatic pauses | ✅ Ready |

### Status

This build completes **steps 1–6** of [`PLAN.md`](./PLAN.md):

- The project installs and launches with one click.
- It logs into WhatsApp and stays logged in across restarts.
- It prints a **QR code** for you to scan.
- It replies to new messages in groups listed in `config/bot.json`.
- It rotates editable templates and preserves rate-limit state across restarts.

Windows login has been confirmed by the user. The reply engine has automated
coverage; a live reply still needs testing in your selected Windows group.
The empty default group allowlist sends nothing until you select a group.

---

## 1. Requirements

| Requirement | Notes |
| --- | --- |
| **Windows 10 or 11** | x64 or ARM64 |
| **Google Chrome** | Must be installed. The bot drives your real Chrome. |
| **Node.js 18+** | The launcher installs this for you via `winget` if it is missing. |
| **A spare phone number** | Not yet linked to WhatsApp. Read the warning above. |
| **Internet** | Required at install time. |

You do **not** need to install Node.js or Chrome by hand — the launcher handles
Node.js, and Chrome is detected automatically.

---

## 2. Quick start

### Step 1 — Double-click `START-HERE.bat`

Put the folder somewhere permanent and predictable, for example:

```
C:\whatsapp-meal-bot\
```

Avoid OneDrive, `Program Files`, or deeply nested paths. Some antivirus products
mishandle batch files in those locations.

### Step 2 — Wait for the QR code

The launcher works through four stages:

```
  [1/4]  Node.js v22 detected. OK.
  [2/4]  Installing dependencies...
         Dependencies installed.
  [3/4]  Created .env from .env.example
  [4/4]  Starting the bot.
```

Stage 2 downloads roughly 5 MB and takes one to two minutes **the first time**.
Every run after that takes a few seconds.

A QR code then prints in the same window. A Chrome window also opens — leave it
open. It is the browser running WhatsApp Web.

### Step 3 — Scan the QR code

On the **phone that will become the bot** (your spare number):

1. Open **WhatsApp**
2. **Settings** → **Linked devices**
3. Tap **Link a device**
4. Point the camera at the QR code in the launcher window

Within a few seconds the launcher prints:

```
  [2026-10-13 09:31:02] INFO   Client is ready.
  [2026-10-13 09:31:02] INFO   Connected as Meal Bot (15551234567)
```

You are logged in. **This happens once.** The session is saved to `.wwebjs_auth\`
and reused on every future launch.

### Step 4 — Add the bot number to your group

On the bot phone, create or join the target group, then add the bot number as a
member.

The bot must be a **member** of the group to read its messages. Being linked is
not enough.

### Step 5 — Select the groups and reply text

Restart the bot after it has joined the group. The launcher prints lines like:

```
Group: Meals | 123456789@g.us
```

Copy the actual ID into `config/bot.json`:

```json
"allowedGroups": ["123456789@g.us"]
```

If no groups are listed or you see `Could not list groups`, send a new message
from another member in the target group while the bot is running. It prints
`Group ID from incoming message: ...` even when replies are disabled or the
allowlist is empty. This does not send a reply to an unlisted group.

Keep the surrounding JSON valid, including commas between settings. Multiple
groups can be listed, separated by commas. An empty array means no replies.

Edit the template text in `data/messages.json`. Restart to apply changes to
`config/bot.json`, then send a new text message from another group member. Expect
a 2–6 second delay for the first reply, and at least 8 seconds between later
replies. The bot's own messages, old messages synced at login, and private chats
do not trigger replies.

---

## 3. Everyday use

| Task | Do this |
| --- | --- |
| Start the bot | Double-click `START-HERE.bat` |
| Stop the bot | Click the window, press **Ctrl+C** |
| Force a fresh login | Double-click `RESET-SESSION.bat` |
| Update dependencies | Run `START-HERE.bat` (it always runs `npm install`) |
| Change reply text | Edit `data/messages.json`; no restart needed |
| Disable replies | Set `enabled` to `false` in `config/bot.json`, then restart |

**The launcher window must stay open.** Closing it kills the bot. There is no
background service or auto-start in this version.

To keep it running independently of a terminal window, use Task Scheduler
(see [Run it in the background](#7-run-it-in-the-background)).

---

## 4. Configuration

### `.env` — connection settings

Created automatically from `.env.example` on first run. **Never commit this file.**

| Variable | Default | What it does |
| --- | --- | --- |
| `CHROME_PATH` | *(empty)* | Full path to Chrome. Leave empty for auto-detection. |
| `DEVICE_NAME` | `Meal Bot` | Name shown under **Linked devices** on the phone. |
| `BROWSER_NAME` | `Chrome` | One of `Chrome`, `Firefox`, `IE`, `Opera`, `Safari`, `Edge`. |
| `DATA_PATH` | `.wwebjs_auth` | Where the session is stored. Must survive restarts. |
| `HEADLESS` | `false` | `true` hides the Chrome window. Leave `false` while debugging. |

### `config/bot.json` — identity and reply behavior

| Key | Default | What it does |
| --- | --- | --- |
| `deviceName` | `Meal Bot` | Fallback if `DEVICE_NAME` is unset. |
| `browserName` | `Chrome` | Fallback if `BROWSER_NAME` is unset. |
| `dataPath` | `.wwebjs_auth` | Fallback if `DATA_PATH` is unset. |
| `headless` | `false` | Fallback if `HEADLESS` is unset. |
| `webVersion` | `null` | Pin a WhatsApp Web version. See below. |
| `enabled` | `true` | Enables auto-replies only in the allowed groups. |
| `allowedGroups` | `[]` | Actual group IDs ending in `@g.us`. Empty means no replies. |
| `ignoreNonText` | `true` | Ignore photos, audio, stickers, polls, and other non-text messages. |
| `ignoreEphemeral` | `true` | Ignore disappearing messages. |
| `ignoreEmpty` | `true` | Ignore messages with no body or caption. |

Restart after editing `config/bot.json`. To reply to media-only messages, set
both `ignoreNonText` and `ignoreEmpty` to `false`. Media is not downloaded;
`{body}` is the caption if one exists, otherwise empty. Own messages, system
notices, statuses, private chats, and groups outside the allowlist are always
ignored.

**On `webVersion`.** While `null`, the bot tracks whatever WhatsApp Web currently
serves. If WhatsApp ships a change that breaks the bot one day with no code
update on your side, pin the last version you know worked.

Every successful startup prints the version in use:

```
  [2026-10-13 09:31:03] INFO   WhatsApp Web version: 2.3000.10xxxxx
  [2026-10-13 09:31:03] INFO   Tip: pin this in config/bot.json -> "webVersion": "..."
```

Copy that number into `config/bot.json` to freeze it. To go back to tracking the
live version, set `"webVersion": null`.

### `data/messages.json` — reply templates

```json
{
  "templates": [
    { "name": "acknowledge", "text": "Thanks, {author}! Received: {body}" },
    { "name": "confirm", "text": "Received in {group} at {time}: {body}" }
  ]
}
```

Each template needs a unique name and nonempty text. The bot cycles through them
in order for each group; that position survives restarts. A single template is
also supported. Save edits to change the next reply without restarting.

| Placeholder | Meaning |
| --- | --- |
| `{author}` | Sender's display name, falling back to their identifier. No mention is added. |
| `{group}` | Group name. |
| `{body}` | Incoming message text or caption. |
| `{time}` | Incoming message time in the computer's local time zone. |

The reply is a new plain-text message, with no quoted original. A malformed
template file logs an error and sends nothing for that trigger. Fix and save it
to resume.

---

## 5. Safety settings

These limits are implemented in code and cannot be lowered through configuration.

| Setting | Limit | Purpose |
| --- | --- | --- |
| Cooldown between replies | 8 s | Stops rapid-fire bursts |
| Random delay before sending | 2–6 s | Jitter is the strongest anti-spam signal |
| Per-group cap | 20 replies / 10 min | Stops runaway loops |
| Auto-pause on breach | yes | Halts replies and logs a warning |
| Duplicate suppression | 5 min | Stops echo loops between members |
| Queue length | 100 messages | Bounds memory during a flood; excess messages are dropped |

The queue sends one message at a time. At the per-group cap, that group pauses
until the rolling window frees space; other groups can continue. Messages skipped
while paused are not replayed. The bot also discards queued messages after a
disconnect, so reconnecting does not send an old backlog.

Budgets, recent message IDs, hashes of message bodies, and template positions are
saved to `data/state.json` before sending. Message text is not stored there. An
uncertain send error consumes one attempt and is not retried, because the message
may already have reached WhatsApp. Do not delete this file to bypass a pause.

**Do not lower these to make the bot faster.** They are the only thing standing
between you and a banned number.

---

## 6. Troubleshooting

### Nothing happens when I run it

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Node.js is too old` | Node < 18 installed | Install LTS from nodejs.org, run again |
| `Could not find a Google Chrome executable` | Chrome not installed, or in a non-standard location | Install Chrome, or set `CHROME_PATH` in `.env` |
| `npm install failed` | No internet, or antivirus blocked Node | Check connection; allow the folder in your AV |
| The window closes instantly | Folder was moved or deleted | Put it back at a permanent path |

### The QR code never scans

- Make sure you scan from **Linked devices → Link a device**, not a normal QR scanner.
- The QR refreshes every 30 seconds — scan the current one, not a screenshot.
- Restart the bot and try a fresh code.
- If you have scanned before and it still fails, run `RESET-SESSION.bat`.

### The QR scans but never reaches "Client is ready"

Check the log lines. Each points somewhere different:

| Log line | Meaning | Fix |
| --- | --- | --- |
| `WhatsApp state: CONFLICT` | WhatsApp Web is open elsewhere with the same account | Close every other WhatsApp Web tab/session |
| `WhatsApp state: UNPAIRED` | The link was revoked from the phone | Run `RESET-SESSION.bat`, scan again |
| `WhatsApp state: TOS_BLOCK` | WhatsApp flagged the account | **Stop.** Unlink from the phone. Do not retry repeatedly |
| `Authentication failed` | Saved session is stale | Run `RESET-SESSION.bat` |
| `Disconnected: CONFLICT` then restarts | Two bots sharing one session | Only run one instance at a time |

> **`TOS_BLOCK` means stop.** It is WhatsApp's terms-violation flag. Retry loops
> here escalate the problem. Unlink the device on the phone and reconsider the
> approach.

### Chrome opens but stays blank

- Close **all** Chrome windows first. One instance of a profile locks the others out.
- Antivirus sometimes blocks Puppeteer's automation. Add an exclusion for this folder.
- Check `HEADLESS=false` in `.env` — you need the window visible to see anything.

### Connected, but no replies arrive

- Check that `enabled` is `true` and `allowedGroups` contains the exact group ID
  printed at startup. Restart after changing these settings.
- Test with a new text message from another member, not the bot's linked phone.
- Repeated bodies, disappearing messages, media, and empty messages are ignored
  by default. Try different text.
- Wait for the 8-second cooldown or a group pause to expire. Debug logs explain
  skipped messages when `LOG_LEVEL=debug` is set in `.env`.
- Check for a template error and repair `data/messages.json` if necessary.

### The rate-limit state cannot be loaded

The bot stops when `data/state.json` is malformed, rather than resetting its
budget silently. Stop the bot and restore the file from a valid backup. If none
exists, wait at least 10 minutes after the last attempted reply before moving the
damaged file aside and starting again. A session reset does not reset rate limits.

### It worked yesterday and not today

Almost always a WhatsApp Web release. See [`webVersion`](#configbotjson--identity-and-reply-behavior).

### npm reports security warnings

`npm install` prints 12 high-severity advisories. **This is expected. Ignore them.**

They come from Puppeteer's Chrome-download helper libraries, which this bot never
executes — it drives your already-installed Chrome instead. npm's suggested fix is
to *downgrade* `whatsapp-web.js`, which would break things. Do not run
`npm audit fix --force`.

---

## 7. Run it in the background

The bot is a console program. To keep it running when you close the window, use
Task Scheduler:

1. **Task Scheduler** → **Create Task**
2. **General** tab → tick **Run whether user is logged on or not**
3. **Triggers** → **New** → **At startup**
4. **Actions** → **New** → Program: `C:\Program Files\nodejs\node.exe`
5. Arguments: `"C:\whatsapp-meal-bot\src\index.js"`
6. **Start in:** `C:\whatsapp-meal-bot`
7. **Settings** → tick **If the task fails, restart every 1 minute**

Keep `HEADLESS=false` if you want to see it; use `true` if it runs while nobody is
logged in.

---

## 8. Uninstall

1. Stop the bot with **Ctrl+C**
2. Delete the whole folder

That is the entire uninstall. Nothing is installed outside it except Node.js and
Chrome.

**Also unlink the device from your phone:** WhatsApp → **Settings** →
**Linked devices** → tap the bot → **Log out**. Until you do, the phone keeps
showing a session that no longer exists.

---

## 9. Files in this folder

| File | Safe to delete? | Notes |
| --- | --- | --- |
| `START-HERE.bat` | No | The launcher |
| `RESET-SESSION.bat` | No | Session reset |
| `src\`, `config\` | No | Bot source and behavior settings |
| `data/messages.json` | No | Your reply templates |
| `data/state.json` | No | Persisted reply limits; do not delete to bypass a pause |
| `.env` | No | Your settings. Delete to regenerate |
| `.env.example` | No | Template |
| `node_modules\` | Yes | Re-downloaded on next launch |
| `.wwebjs_auth\` | Yes | **Deletes the WhatsApp login.** You will re-scan a QR |
| `package-lock.json` | No | Pins exact dependency versions |
| `PLAN.md`, `USER-MANUAL.md` | Yes | Documentation |

---

## 10. FAQ

**Can it reply in private chats too?**
Not in this build. Group-only, per the plan.

**Can different groups get different messages?**
All allowed groups share the same templates, with a separate rotation position
for each group. Different template sets per group are outside v1.

**Will it work if I close the launcher window?**
No. The bot dies with it. See [Run it in the background](#7-run-it-in-the-background).

**Can I use my personal WhatsApp number?**
Technically yes. I would not. Read the warning at the top of this document.

**Does it send photos or files?**
Replies are plain text. Photos or files can trigger a text reply if you enable
non-text triggers in the configuration.

**How do I stop it replying without deleting it?**
Set `enabled` to `false` in `config/bot.json` and restart. Clearing `allowedGroups`
also disables replies. `HEADLESS` only controls browser visibility.

**Something is broken and I do not know why.**
Set `LOG_LEVEL=debug` in `.env` and run `START-HERE.bat`. The verbose log shows
Chrome path detection, WhatsApp state transitions, and load progress.

---

## 11. Reference

- [`PLAN.md`](./PLAN.md) — architecture, design decisions, risk register
- [`USER-MANUAL.md`](./USER-MANUAL.md) — this document
- [whatsapp-web.js documentation](https://docs.wwebjs.dev/)
- [whatsapp-web.js guide](https://guide.wwebjs.dev/guide/)
- [Node.js downloads](https://nodejs.org/en/download)
- [Official WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/)
