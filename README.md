# Otto Perso

**Your digital employee. Lives on your computer.**

Otto is an autonomous agent — not a chatbot. You talk to it in chat, and it actually does things: reads files, searches the web, writes notes, creates tasks, spawns new Otto brains for parallel work, sends SMS and email. It's like having a digital employee that never sleeps.

---

## Download

**Option 1: Native installer** (recommended)
- [macOS (.dmg)](https://github.com/ottoperso/otto-perso/releases/latest) — Apple Silicon + Intel
- [Windows (.exe)](https://github.com/ottoperso/otto-perso/releases/latest)
- [Linux (.AppImage + .deb)](https://github.com/ottoperso/otto-perso/releases/latest)

**Option 2: Portable** (no install)
- [otto-perso-portable.zip](https://github.com/ottoperso/otto-perso/releases/latest) — unzip, double-click, done

**Option 3: Build from source**
```bash
git clone https://github.com/ottoperso/otto-perso.git
cd otto-perso
bun run setup
bun run dev
```

---

## Quick start

1. **Download** Otto for your OS (or build from source)
2. **Open** the app (or run `otto.sh` / `otto.bat` for portable)
3. **Sign in** — use the default account or create your own at `/register`
4. **Start talking** — tell Otto what to do

Otto ships with a bundled brain key. It works the moment you install. No setup, no API key needed.

---

## What Otto can do

### Tools (34 built-in)
Otto calls these autonomously when you ask it to do something:

| Category | Tools |
|----------|-------|
| **Memory** | `vault_read`, `vault_write` — Obsidian-compatible notes on disk |
| **Files** | `file_read`, `file_write`, `file_list` — sandboxed workspace |
| **Web** | `web_search` (DuckDuckGo), `web_fetch`, `web_page_reader` |
| **Tasks** | `task_create`, `task_list`, `task_update` — with dependency DAG |
| **Agents** | `agent_spawn`, `agent_spawn_multi`, `agent_status`, `agent_list` |
| **Recipes** | `recipe_create`, `recipe_list`, `recipe_run` |
| **Real-world** | `hotel_search`, `restaurant_search`, `event_search`, `calendar_book`, `ride_estimate`, `flight_search`, `maps_directions`, `music_play`, `payment_charge` |
| **No-key info** | `weather`, `news_search`, `stock_crypto`, `translate`, `wikipedia`, `currency_convert` |
| **Comms** | `sms_send`, `email_send` (per-user, in-app) |
| **State** | `system_state`, `activity_log`, `activity_log_custom`, `autonomy_get` |

## API keys — every one is FREE, no credit card

You never have to enter a credit card to use any of Otto's providers. The app
ships with a bundled brain key and 13 tools that need **zero keys** — they work
on first run. The optional keys below just unlock extra capabilities, and every
one is free with no card:

| Provider | Unlocks | Free tier | Card? | Signup |
|----------|---------|-----------|-------|--------|
| (bundled) Gemini | the brain | free | NO | ships in the app |
| Geoapify | richer hotels/restaurants/directions | 3,000/day | NO | geoapify.com |
| Ticketmaster | event_search | 5,000/day | NO | developer.ticketmaster.com |
| Travelpayouts | flight_search | free | NO | travelpayouts.com |
| YouTube Data v3 | exact-song music_play | 10,000 units/day | NO | console.cloud.google.com (enable YouTube Data API v3 — no billing) |
| Finnhub | stock prices | 60/min | NO | finnhub.io |
| Stripe (test key) | payment_charge | unlimited test | NO | dashboard.stripe.com/register |
| Resend | email_send | 3,000/month | NO | resend.com |

**Zero-key tools** (work with nothing configured): hotel_search, restaurant_search,
ride_estimate, maps_directions, calendar_book, music_play, weather, news_search,
stock_crypto, translate, wikipedia, currency_convert, web_search.

**Removed providers** (they required a card or paid account — replaced with the
free alternatives above): Google Places (card required), Uber (server tokens
discontinued), Spotify (Premium now required), Kiwi Tequila (closed to new devs),
Google Calendar (key can't write events — .ics works with every calendar app).
See `.env.example` for the full audit table and removal reasons.

### Multi-agent orchestration
Give Otto a complex request, and it decomposes into parallel subtasks:

> "Look at my inbox and take care of background tasks, check my socials, I have an event tonight — book a seat and find a restaurant near it."

Otto spawns 4 new Otto brains (Inboxer, Scout, Vex, Atlas), each runs autonomously with its own tools, and Otto reports back when they're done. You can ping Otto mid-flight: "What's Vex up to?" → it checks the spawned brain and reports.

### 5-tier autonomy
- **L1 — Ask Before Editing**: suggests only, asks before doing
- **L2 — Mild Edits Only**: small safe corrections without asking (default)
- **L3 — Chosen Edits**: executes exactly what you asked
- **L4 — Bypass All Approvals**: decisive, you review later
- **L5 — Vacation Mode**: runs your digital life, still asks for money/legal/irreversible

### Obsidian-compatible vault
Otto's memory is real Markdown files with YAML frontmatter. Open the vault in Obsidian and edit alongside Otto. Changes sync both ways.

### 4-panel chat UI
- **Left**: what Otto is controlling (agents, tasks, activity, brain budget)
- **Center**: the chat with Markdown + tool-call cards + autonomy picker
- **Right tab A**: Otto's internal thoughts (live reasoning stream)
- **Right tab B**: vault browser (searchable, filterable)

---

## Configuration

Otto works out of the box. To customize:

### Brain key (optional)
Otto ships with a bundled key (500 requests/day free). To use your own:
- **In the app**: Settings → Brain → paste your key
- **In .env**: set `GEMINI_API_KEY=your_key_here`

Get a free key at [aistudio.google.com](https://aistudio.google.com).

### Phone (optional, for SMS)
Settings → Phone → add Telnyx/Twilio/Vonage/Plivo credentials.
- ~$1/month for a number
- ~$0.004–0.008 per SMS

### Email (optional, for sending)
Settings → Email → add Resend/SendGrid/SMTP credentials.
- Resend: 3k/month free, then $0.0001/email
- SendGrid: 100/day free
- SMTP: use Gmail/Fastmail/etc.

---

## Build

### Prerequisites
- [Bun](https://bun.sh) (runtime + package manager)
- [Rust](https://rustup.rs) (only for native desktop builds)
- [Node.js](https://nodejs.org) 20+ (for the portable build)

### Build the native desktop app
```bash
bun run setup              # first time: install deps + create DB
bun run build:desktop      # builds for your current OS
```

Output: `src-tauri/target/release/bundle/` with `.dmg` / `.exe` / `.AppImage` + `.deb`

### Build the portable zip
```bash
bun run setup
bun run build:portable
```

Output: `build/otto-perso-1.0.0-<platform>-<arch>.zip`

### Cross-compile
```bash
bun run build:desktop:mac          # Apple Silicon
bun run build:desktop:mac-intel    # Intel Mac
bun run build:desktop:windows      # Windows
bun run build:desktop:linux        # Linux
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Otto Perso (Next.js 16 + Tauri shell)      │
│                                              │
│  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Chat UI    │  │  Brain (Otto Perso) │  │
│  │  4 panels   │  │  + 26 tools         │  │
│  └──────┬──────┘  └──────────┬──────────┘  │
│         │                     │              │
│         │     ┌───────────────┴────────┐    │
│         │     │  Spawned Otto brains   │    │
│         │     │  (each a full Otto)    │    │
│         │     └────────────────────────┘    │
│         │                                    │
│  ┌──────┴──────────────────────────────┐   │
│  │  Local storage                       │   │
│  │  - SQLite (db/custom.db)            │   │
│  │  - Vault (~/otto-vault/, .md files) │   │
│  │  - Workspace (~/otto-workspace/)    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

- **Brain**: Google Gemini (hidden from users — they see "Otto Perso")
- **Database**: SQLite via Prisma ORM
- **Vault**: real Markdown files on disk, Obsidian-compatible
- **Auth**: NextAuth with credentials provider (local, bcrypt-hashed)
- **Realtime**: Socket.io for live agent updates
- **Rate limiting**: time-bucketed counters (per-minute, hourly, daily, peak-hour, monthly tokens)

---

## Data location

| What | Where |
|------|-------|
| Database | `db/custom.db` (in the app folder) |
| Vault (memory) | `~/otto-vault/` (your home directory) |
| Workspace (files) | `~/otto-workspace/` |
| Activity log | in the database |
| Brain key | in the database (obfuscated) |

Everything stays on your computer. Nothing is sent anywhere except brain API calls (required for Otto to think).

---

## License

MIT — do whatever you want. Attribution appreciated but not required.

---

## Contributing

PRs welcome. Fork, branch, push. The usual.

For bugs: [github.com/ottoperso/otto-perso/issues](https://github.com/ottoperso/otto-perso/issues)
