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
| `/games` | Opens the full Arcade lobby; choose any of the nine games inside the Activity |

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

## Kingshot Discord Activity

This project includes the graphical Kingshot Arcade frontend in `activity/` and a same-process Activity server in `activity-server.js`. The single `/games` command launches this Activity; players choose any of the nine games from its in-Activity lobby.

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
- The single `/games` command launches the graphical Activity. The Activity can also be opened from Discord's App Launcher.

## Kingshot Arcade Activity — all games

The graphical Discord Activity now includes these nine games:

- Tic-Tac-Toe
- Connect Four
- Rock Paper Scissors (first to two round wins)
- Reaction Duel
- Kingshot Trivia
- Guess the Number
- Hangman
- Word Scramble
- Daily Challenge (the question set and answer order are date-seeded)

### Launching the Activity in Discord

1. In Discord Developer Portal, open the same application used by the bot.
2. Under **Activities → Settings**, enable Activities.
3. Add an Activity URL Mapping with prefix `/` pointing to the public HTTPS hostname serving this bot. The mapping target is the hostname only, without `https://`.
4. Under **OAuth2 → General**, add `https://127.0.0.1` as a redirect URI for local development if required by the Discord Activity setup.
5. Put `CLIENTID`, `DISCORDTOKEN`, `DISCORD_CLIENT_SECRET`, and `VITE_CLIENT_ID` in the root `.env`. `VITE_CLIENT_ID` is the same application Client ID as `CLIENTID`.
6. Install and build from the project root:

   ```bash
   npm install
   npm run build
   ```

7. Register commands:

   ```bash
   npm run register
   ```

   The registration script preserves the existing chat-input commands and updates Discord's single global Entry Point command to **Kingshot Arcade**.

8. Start the bot:

   ```bash
   npm start
   ```

9. In Discord, run `/games` to launch the graphical Activity from the slash command, or open the App Launcher and choose **Kingshot Arcade**. Invite another participant to the same Activity instance for 1v1 play.

### Gameplay command behavior

There is now one game slash command: `/games`. It opens the complete Kingshot Arcade Activity, where players select from all nine games. Individual game subcommands have been removed. The PXD-themed interface uses a dark medieval war-room palette with stone, iron, parchment, and royal-gold accents.

### Game behavior and limitations

- Tic-Tac-Toe and Connect Four enforce alternating turns on the server.
- Rock Paper Scissors is a first-to-two-rounds match.
- Reaction Duel uses a server-side random start delay and determines the first valid tap.
- Trivia and Daily Challenge use the existing Kingshot trivia pool in `games/data.js`; Daily Challenge uses a date-based deterministic question set.
- Guess the Number, Hangman, and Word Scramble use the existing Kingshot word/question data.
- Rooms are scoped to the Discord Activity instance and kept in memory. A bot restart ends active matches; long-term match persistence is not implemented.
- The Activity supports up to two participants per instance. Hangman is cooperative; trivia, guess, and scramble support a solo participant as well.
- The existing `/games stats` and `/games leaderboard` continue to reflect the legacy slash-command game statistics; Activity match results are not yet written into that statistics store.
