# Kingshot Discord Bot

Gift-code AUTOREDEEM + Event reminders + Interactive / versus games.

## Features

### Gift Codes (original)
- `/register player` / `/register alliance`
- `/codes`, `/roster`, `/show`, `/myregistrations`
- `/auto start|stop|status|scan` (owner)
- Automatic redeem loop for registered targets

### Event Reminders
- `/eventreminder setup` — dropdowns + form: one-time, daily, every X days, weekly, monthly (UTC)
- Events with 2 slots: Bear Trap 1/2, Swordland Legion 1/2, Viking Vengeance 1/2, Tri-Alliance Legion 1/2 (+ Arena, Castle Battle, KVK, Cesares, SG, Alliance Brawl, Custom — Custom asks for a name)
- The reminder is a plain message: `<event emoji> **Arena** @everyone` + **only the text you wrote** + small footer
- Each reminder has its own emoji (default ⚔️); admins can change it with `/eventreminder edit`. No generated text
- Multiple offsets (e.g. 60 + 10 min before). Footer: `PXD_BOT · Event: HH:MM UTC`
- **Auto-removal:** the 10-min reminder replaces the 60-min one; leftovers are deleted when the event starts
- `/eventreminder list|edit|delete|toggle|test` — edit name, UTC time, offsets, emoji, and reminder text without recreating the schedule

### Event Blogs
- `/eventblog post` / `quick` — preview, pick channel + mention, then **Post now** or **Schedule…**
- Same schedule types as reminders; `/eventblog list|delete|toggle` to manage them

### Games
| Command | Type |
|---------|------|
| `/games trivia` | Solo — 5 multiple-choice questions, timer, streak bonus |
| `/games guess` | Solo — narrowing range bar, hearts, hint |
| `/games hangman` | Solo — gallows art + A–M / N–Z letter menus |
| `/games scramble` | Solo — rounds, hints, speed points |
| `/games daily` | Solo — same number for everyone, 7 tries, saved streak |
| `/games rps` | 1v1 — first to 2, hidden picks |
| `/games tictactoe` | 1v1 — button board, winning line highlight |
| `/games connect4` | 1v1 — emoji board, winning four highlighted |
| `/games reaction` | 1v1 — first to 2, false-start penalty, ms timing |
| `/games stats` · `/games leaderboard` | Points, win rate, streaks |

Trivia (all Kingshot: troops, resources, buildings, heroes, events, pets) and words live in `games/data.js` — edit freely.

## Setup

1. Copy `.env.example` → `.env` and fill values
2. Enable **Message Content Intent** in Discord Developer Portal (Bot → Privileged Gateway Intents)
3. Install & run:
```bash
npm install
npm run register
npm start
```

## Environment

```env
DISCORDTOKEN=
CLIENTID=
AUTOREDEEM=true
AUTOINTERVALMINUTES=15
NOTIFYCHANNELID=
ERRORADMINUSERID=
REDEEMDELAYMS=2500
MAXPLAYERSPERUSER=5
MAXALLIANCESPERUSER=3
DATADIR=./data
REMINDERSDIR=/tmp/kingshot-bot
```

## Permissions needed
- Send Messages
- Embed Links
- Mention @everyone (for reminders)
- Use Application Commands

## Reminder storage note

Reminder JSON is stored separately at `/tmp/kingshot-bot/reminders.json` by default. Existing
`/tmp/reminders.json` and project `data/reminders.json` files are migrated automatically on
first start if found. The bot does not delete reminder definitions when they fire; it only
removes sent Discord notification messages according to the configured auto-removal behavior.

**Important:** `/tmp` is temporary on many hosting providers and may be cleared on redeploy or
machine replacement. For reminders to survive those events, configure `REMINDERSDIR` to a
persistent mounted disk or use a database. Keeping data in `/tmp` cannot guarantee persistence
across a host that wipes temporary storage.

---

## Kingshot Discord Activity (Tic-Tac-Toe)

This project now includes a first Discord Activity frontend in `activity/` and a same-process Activity server in `activity-server.js`. The existing `/games tictactoe` Discord-button game is unchanged; the graphical Activity is launched through Discord's App Launcher / Activity Entry Point in this first milestone.

### Required environment variables

Add these to your hosting environment (do not commit `.env`):

```env
CLIENTID=your_discord_application_id
DISCORD_CLIENT_SECRET=your_discord_oauth2_client_secret
VITE_CLIENT_ID=your_discord_application_id
```

`DISCORD_CLIENT_SECRET` must remain server-side. `VITE_CLIENT_ID` is a public application ID embedded in the frontend at build time; it is not a secret.

### Discord Developer Portal setup

1. Open your existing bot application at https://discord.com/developers/applications.
2. Open **Activities** and configure URL Mappings.
3. Under **OAuth2 → General**, add `https://127.0.0.1` as a Redirect URI and save. The Embedded App SDK handles the in-Activity authorization return.
4. Under **Activities → URL Mappings**, map prefix `/` to the public HTTPS hostname serving this bot (hostname only; no `https://`).
5. Under **Activities → Settings**, enable Activities and save. Discord creates a default **Launch** Entry Point command.
6. Enable **Developer Mode** in Discord User Settings → Advanced while testing an unpublished Activity.
7. Launch the Kingshot Activity from the App Launcher in a voice channel. A second player must join that same Activity instance.

The public hostname must serve this same Node process over HTTPS. Configure your hosting provider's HTTPS domain/proxy to forward to the app's `PORT`.

### Deploy on the same host as the bot

Build the frontend during deployment, before starting the bot:

```bash
npm install
npm run build
npm start
```

`npm run build` installs the Activity's small Vite dependency set and writes static assets to `activity/dist`. The existing Node bot process serves those assets, handles Discord's OAuth code exchange at `/api/activity/token`, and hosts the multiplayer WebSocket endpoint at `/ws` on the same port.

Do not expose `DISCORD_CLIENT_SECRET` in frontend variables or source files. Do not copy your real `.env` into a public repository or share it in a ZIP.

### Local development on Windows / PowerShell

1. In the project root, create or update `.env` with `CLIENTID`, `DISCORD_CLIENT_SECRET`, and `VITE_CLIENT_ID`.
2. In terminal 1, run the bot/API server:

   ```powershell
   npm install
   npm start
   ```

3. In terminal 2, run the Activity dev server:

   ```powershell
   cd activity
   npm install
   npm run dev
   ```

4. In terminal 3, expose the Activity dev server with a temporary HTTPS tunnel:

   ```powershell
   cloudflared tunnel --url http://localhost:5173
   ```

5. Set the Discord Activity URL Mapping prefix `/` target to the tunnel hostname (hostname only, without `https://`). Vite reads `VITE_CLIENT_ID` from the project-root `.env` and proxies `/api` and `/ws` to the bot server on port 8080. If your bot uses another port, set `BOT_API_ORIGIN` before starting Vite, for example `$env:BOT_API_ORIGIN='http://127.0.0.1:9000'`.
6. Launch the Activity from Discord's App Launcher / generated Launch Entry Point. Open the same Activity instance with a second Discord account to test the two-player game.

A normal browser tab can show the Vite page, but the Discord SDK authorization requires the Activity to be opened inside Discord.

### Current game behavior / limitations

- Two Discord users in the same Activity instance share one server-authoritative Tic-Tac-Toe board. The server verifies the Discord OAuth identity and checks the active Activity instance with Discord's Activity Instance API before allowing play.
- The server validates whose turn it is and whether a cell is already occupied.
- A third user is rejected for now; spectator mode is a later improvement.
- Rematch resets the board for both players.
- Rooms are in memory and are not persisted across bot restarts. This is appropriate for live game sessions; reminder persistence remains separate.
- The Activity is currently launched through Discord's App Launcher / Launch Entry Point. Wiring the existing `/games tictactoe` subcommand to launch an Activity is a separate follow-up integration.


## Kingshot Activity — all games

The vanilla-JavaScript Discord Activity includes all nine games from the bot's existing game modules:
- 1v1: Tic-Tac-Toe, Connect Four, Rock Paper Scissors, Reaction Duel
- Party/puzzle: Kingshot Trivia, Guess the Number, Hangman, Word Scramble, Daily Challenge

The Activity uses the same Discord OAuth2 credentials and Node.js hosting process as the bot. Build with `npm install` then `npm run build`; start with `npm start` (or `npm run dev` for local development). The Activity is served by the bot on `PORT` and communicates over `/ws`.

The original Discord slash-command game interfaces remain available. The Activity game session is room-scoped to the Discord Activity instance and currently supports up to two participants. The five puzzle/party modes are shared turn-based room games (Trivia and Rock Paper Scissors allow both players to submit simultaneously). Game rooms are in-memory and reset if the bot restarts.

For local development, use an HTTPS tunnel to the Vite dev server and configure the Discord Activity URL mapping as described in the Discord Developer Portal setup section above.

Copy `.env.example` to `.env` and fill in your own credentials. Never commit or share `.env`.
