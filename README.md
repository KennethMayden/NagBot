# 🔔 Nag Bot — Slack-Hosted (Deno SDK / ROSI)

A Slack app that runs entirely on **Slack's own infrastructure** (ROSI) — no server, no hosting costs. Built with the Deno Slack SDK for paid Slack plans.

---

## Features

| Trigger | What it does |
|---|---|
| 🔔 **Send a Nag** shortcut | Opens a modal — pick specific people or tick **Nag everyone** to tag the whole channel; choose a nag type, write what you need, post to the channel |
| 🔍 **Check Nag Reactions** shortcut | Shows reaction progress on recent nags with a one-click **Re-nag** button and option to cancel recurring nags |
| 📊 **Nag Stats** shortcut | Private stats showing most/least nagged people plus the reaction speed points leaderboard |
| 🏆 **Reaction Speed Leaderboard** (automatic) | Pinned public message in the nag-bot channel — posted on first reaction, updated in-place on every subsequent one |
| 🔁 **Daily Recurring Nag** (scheduled) | Automatically re-nags pending users at 08:00 UTC every day for active recurring nags |
| 🏁 **Nag Completion Check** (scheduled) | Runs hourly — detects when everyone has reacted, deletes the nag record, and sends the nagger a DM |

Triggers appear as **link triggers** in Slack (bookmarkable URLs or slash commands you configure). Every response is **ephemeral** (only visible to you) except the actual nag messages.

---

## Nag Types

When sending a nag you choose one of three types:

### Standard (one-time)
The original behaviour. Sends a nag message once. No automatic follow-ups — use the **Check Nag Reactions** shortcut to manually re-nag.

### 🔁 Do Now — re-nag daily until done
- Sends the nag immediately
- Automatically re-nags anyone who hasn't reacted **every day at 08:00 UTC**
- Stops automatically once **everyone has reacted**
- Can be stopped early via the **🚫 Cancel Recurring** button in Check Nag Reactions

### ⏰ Do By Deadline — nag toward a date
- Sends the nag immediately
- Set a **deadline date** (required; must be today or in the future)
- The deadline and days-before fields only appear in the modal after selecting this nag type
- Optionally set **X days before the deadline** (integers only) — daily re-nags begin that many days out
- If no days-before is set, re-nags begin on the deadline day itself
- Continues daily **after** the deadline until everyone has reacted or the nag is cancelled
- Can be stopped early via the **🚫 Cancel Recurring** button in Check Nag Reactions

---

## Points System

Every nag has a built-in race to react. When someone adds any reaction to a nag message:

- **Points awarded = (number of nagged people) − (position)**
- The first person to react in a nag with N people gets **N−1 points**, the second gets **N−2**, and so on down to **0 points** for the last
- Points accumulate globally across all nags over time
- Each person can only earn points **once per nag** — adding multiple reactions to the same message doesn't award extra points
- The bot's own ✅ reaction (auto-added when a nag is posted) does not count

### Viewing the leaderboard

**Pinned message** — the first time anyone earns points, a public 🏆 Reaction Speed Leaderboard message is posted in the nag-bot channel and pinned automatically. It updates in-place every time points change, so everyone can see the live standings via the 📌 Pins icon at any time.

**Nag Stats shortcut** — the ephemeral stats response also includes the points leaderboard at the bottom, alongside the existing most/least nagged counts.

---

## Prerequisites

- A **paid Slack workspace** (Pro, Business+, or Enterprise+)
- **Deno** installed: https://deno.com/manual/getting_started/installation
- **Slack CLI** installed: https://api.slack.com/tools/slack-cli

---

## Setup

### 1. Install the Slack CLI and log in

```bash
# Install the CLI (Mac/Linux)
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash

# Log in to your workspace
slack login
```

### 2. Create the app

```bash
# From the project directory
slack create nag-bot --template .

# Or if you already have the files:
cd nag-bot-deno
slack run       # for local development
```

### 3. Add an icon

Drop a 512×512 PNG named `icon.png` into the `assets/` folder before deploying. Any square image works.

### 4. Create the triggers

After running `slack run` or `slack deploy`, create each trigger:

```bash
slack triggers create --trigger-def triggers/nag.ts
slack triggers create --trigger-def triggers/nag_check.ts
slack triggers create --trigger-def triggers/nag_stats.ts
slack triggers create --trigger-def triggers/reaction_added.ts
slack triggers create --trigger-def triggers/recurring_nag.ts
slack triggers create --trigger-def triggers/nag_completion_check.ts
```

The first three output a **link trigger URL** (looks like `https://slack.com/shortcuts/...`). Share these in your workspace:

- Post them in a channel
- Add them to your Slack sidebar as bookmarks
- Or configure them as slash commands via the app dashboard

> **Note:** `reaction_added`, `recurring_nag`, and `nag_completion_check` are background triggers — they have no URL and require no sharing. `reaction_added` fires automatically whenever someone reacts in the nag-bot channel. `recurring_nag` and `nag_completion_check` fire on their schedules — update `start_time` in each file to a future date before creating them.

### 5. Deploy to Slack's infrastructure

```bash
slack deploy
```

That's it. Slack hosts everything — no server needed.

---

## Project Structure

```
nag-bot-deno/
├── manifest.ts                    # App definition (workflows, datastores, scopes)
├── deno.jsonc                     # Deno config + import map
├── assets/
│   └── icon.png                   # 512×512 app icon (add your own)
├── datastores/
│   ├── nags.ts                    # Stores sent nag messages (type, deadline, recurring state, reacted_users)
│   ├── nag_counts.ts              # Tracks nag counts per person
│   ├── reaction_points.ts         # Tracks accumulated leaderboard points per person
│   └── leaderboard_config.ts      # Stores the ts of the pinned leaderboard message
├── functions/
│   ├── send_nag_function.ts             # Posts nag + saves to datastore (all nag types)
│   ├── check_nag_function.ts            # Checks reactions, shows status, re-nags, cancel recurring
│   ├── nag_stats_function.ts            # Stats of most/least nagged + points leaderboard
│   ├── reaction_points_function.ts      # Awards points when a nag reaction is added
│   ├── leaderboard_message.ts           # Utility: posts/updates the pinned leaderboard message
│   ├── recurring_nag_function.ts        # Daily: re-nags pending users on active recurring nags
│   └── nag_completion_check_function.ts # Hourly: detects completed nags, cleans up, DMs nagger
├── workflows/
│   ├── send_nag.ts                # Wires trigger → send nag function
│   ├── check_nag.ts               # Wires trigger → check nag function
│   ├── nag_stats.ts               # Wires trigger → stats function
│   ├── reaction_added.ts          # Wires reaction_added event → points function
│   ├── recurring_nag.ts           # Wires scheduled trigger → recurring nag function
│   └── nag_completion_check.ts    # Wires scheduled trigger → completion check function
└── triggers/
    ├── nag.ts                     # Link trigger for sending nags
    ├── nag_check.ts               # Link trigger for checking reactions
    ├── nag_stats.ts               # Link trigger for stats + leaderboard
    ├── reaction_added.ts          # Event trigger — fires on reaction_added in nag-bot channel
    ├── recurring_nag.ts           # Scheduled trigger — daily at 08:00 UTC
    └── nag_completion_check.ts    # Scheduled trigger — hourly completion check
```

---

## How to use

### Sending a nag

Click the **Send a Nag** link trigger (or slash command). A modal opens where you:
- Pick who to nag — check **Nag everyone** to tag the whole channel, or pick specific people with the multi-select picker
- Write what you need them to do
- Choose a **nag type** (see [Nag Types](#nag-types) above):
  - **Standard** — one-time, no automatic follow-ups
  - **Do Now** — re-nags daily until everyone reacts
  - **Do By Deadline** — set a deadline date; optionally start nagging X days before it

**All nag @mentions are always posted in the `#nag-bot` channel** (`C0BDN88PS00`), regardless of which channel you triggered the command from. If any tagged users are not yet members of `#nag-bot`, they are automatically added before the message is posted.

The bot posts the message tagging everyone, asking them to react (e.g. ✅) when done.

### Checking who hasn't reacted

Click **Check Nag Reactions**. You'll see (privately) a list of recent nags with:
- The nag type badge (`🔁 Do Now` or `⏰ Due [date]`) where applicable
- A progress bar: `████░░░░░░ 40%  2/5 reacted`
- Who is still pending
- A **🔔 Re-nag them** button — sends a one-off follow-up tagging non-reactors with a link back to the original message; reacting to the reminder message also counts toward completion
- A **🚫 Cancel Recurring** button (for Do Now / Do By Deadline nags) — stops all future automatic re-nags

> Completed nags (everyone reacted) are automatically removed from this view and cleaned up.

### Automatic completion notifications

The **Nag Completion Check** runs hourly in the background. When it detects that everyone has reacted to a nag:
1. The nag record is deleted from the datastore
2. The person who sent the nag receives a **DM** with a link to the original message confirming completion

This means you don't need to manually run Check Nag Reactions to get notified — the bot will message you automatically within an hour of completion.

### Viewing the leaderboard

Click **Nag Stats**. You'll see (privately) who has been nagged the most and least, plus the full **reaction speed points leaderboard** at the bottom.

The **pinned 🏆 leaderboard message** in the nag-bot channel is always visible to everyone — find it via the 📌 Pins icon in the channel header. It is created automatically on the first reaction and updated in-place thereafter.

### Automatic daily re-nags

The scheduled trigger fires at **08:00 UTC every day** and processes all active recurring nags:
- **Do Now** — re-nags anyone who hasn't reacted yet; auto-cancels once everyone has reacted
- **Do By Deadline** — begins re-nagging from `deadline − days_before` (or on the deadline day if no days-before was set); continues daily after the deadline until all react or the nag is cancelled

---

## Local development

```bash
# Run locally with hot-reload
slack run

# View logs
slack activity

# Inspect datastore directly
slack datastore query '{"datastore": "nags"}'
slack datastore query '{"datastore": "nag_counts"}'
slack datastore query '{"datastore": "reaction_points"}'
slack datastore query '{"datastore": "leaderboard_config"}'
```

---

## Notes

- **Any reaction** counts — ✅, 👍, 🎉, whatever. The bot counts anyone who reacted at all.
- **NagBot auto-reacts ✅** on every new nag and every reminder (initial nags, re-nags, and daily recurring reminders), so the reaction is always primed on the message.
- **Reacting to a reminder message** also counts — not just the original nag.
- All check/stats results are **ephemeral** (only you see them).
- Recurring nags auto-cancel when everyone has reacted — no manual cleanup needed.
- **Completion DMs** are sent automatically within ~1 hour of everyone reacting.
- **Points are earned once per nag per person** — reacting multiple times to the same message only awards points on the first reaction.
- **The bot's own ✅ reaction does not earn points** — only nagged users are eligible.
- **Reacting to a reminder message earns the same points** as reacting to the original nag message.
- The pinned leaderboard message is created automatically on first use — no manual setup needed.
- Data is stored in Slack's DynamoDB-backed datastores — no external database needed.
- The Deno SDK requires **TypeScript** (`.ts` files). No npm, no `node_modules`.
- Function timeout is **60 seconds** for deployed apps — more than enough for nag operations.
