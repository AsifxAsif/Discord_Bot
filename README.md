# Kingshot Discord Bot

Gift-code AUTOREDEEM + Event reminders + Interactive / versus games.

## Features

### Gift Codes (original)
- `/register player` / `/register alliance`
- `/codes`, `/roster`, `/show`, `/myregistrations`
- `/auto start|stop|status|scan` (owner)
- Automatic redeem loop for registered targets

### Event Reminders (new)
- `/eventreminder create` — supports:
  - One-time
  - Daily
  - Every X days
  - Weekly (choose days)
  - Monthly
- UTC timezone
- `@everyone` or custom role
- Multiple offsets (e.g. 60 min + 10 min before)
- Admin + bot owner only

### Games (new)
| Command | Type |
|---------|------|
| `/games trivia` | Solo |
| `/games guess` | Solo |
| `/games hangman` | Solo |
| `/games scramble` | Solo |
| `/games daily` | Solo (1/day) |
| `/games rps` | 1v1 |
| `/games tictactoe` | 1v1 |
| `/games connect4` | 1v1 |
| `/games reaction` | 1v1 |

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
