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
- The reminder is a plain message: `⚔️ **Arena** @everyone` + **only the text you wrote** + small footer. No generated text
- Multiple offsets (e.g. 60 + 10 min before). Footer: `PXD_BOT · Event: HH:MM UTC`
- **Auto-removal:** the 10-min reminder replaces the 60-min one; leftovers are deleted when the event starts
- `/eventreminder list|delete|toggle|test`

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
```

## Permissions needed
- Send Messages
- Embed Links
- Mention @everyone (for reminders)
- Use Application Commands
