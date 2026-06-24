# 🔔 Nag Bot — Slack-Hosted (Deno SDK / ROSI)

A Slack app that runs entirely on **Slack's own infrastructure** (ROSI) — no server, no hosting costs. Built with the Deno Slack SDK for paid Slack plans.

---

## Features

| Trigger | What it does |
|---|---|
| 🔔 **Send a Nag** shortcut | Opens a modal — pick who to nag, write what you need, post to the channel |
| 🔍 **Check Nag Reactions** shortcut | Shows reaction progress on recent nags with a one-click **Re-nag** button |
| 📊 **Nag Stats** shortcut | Private leaderboard of most/least nagged people |

Triggers appear as **link triggers** in Slack (bookmarkable URLs or slash commands you configure). Every response is **ephemeral** (only visible to you) except the actual nag message.

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
```

Each command outputs a **link trigger URL** (looks like `https://slack.com/shortcuts/...`). Share these in your workspace:

- Post them in a channel
- Add them to your Slack sidebar as bookmarks
- Or configure them as slash commands via the app dashboard

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
│   ├── nags.ts                    # Stores sent nag messages
│   └── nag_counts.ts              # Tracks nag counts per person
├── functions/
│   ├── send_nag_function.ts       # Posts nag + saves to datastore
│   ├── check_nag_function.ts      # Checks reactions, shows status, re-nags
│   └── nag_stats_function.ts      # Leaderboard of most/least nagged
├── workflows/
│   ├── send_nag.ts                # Wires trigger → send nag function
│   ├── check_nag.ts               # Wires trigger → check nag function
│   └── nag_stats.ts               # Wires trigger → stats function
└── triggers/
    ├── nag.ts                     # Link trigger for sending nags
    ├── nag_check.ts               # Link trigger for checking reactions
    └── nag_stats.ts               # Link trigger for leaderboard
```

---

## How to use

### Sending a nag

Click the **Send a Nag** link trigger (or slash command). A modal opens where you:
- Pick who to nag (multi-select user picker)
- Write what you need them to do

The bot posts a message tagging everyone, asking them to react (e.g. ✅) when done.

### Checking who hasn't reacted

Click **Check Nag Reactions**. You'll see (privately) a list of recent nags with:
- A progress bar: `████░░░░░░ 40%  2/5 reacted`
- Who is still pending
- A **🔔 Re-nag them** button — sends a follow-up message in the channel tagging only the non-reactors, with a link back to the original message

### Viewing the leaderboard

Click **Nag Stats**. You'll see (privately) who has been nagged the most and least across all workflows.

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
```

---

## Notes

- **Any reaction** counts — ✅, 👍, 🎉, whatever. The bot counts anyone who reacted at all.
- All check/stats results are **ephemeral** (only you see them).
- Data is stored in Slack's DynamoDB-backed datastores — no external database needed.
- The Deno SDK requires **TypeScript** (`.ts` files). No npm, no `node_modules`.
- Function timeout is **60 seconds** for deployed apps — more than enough for nag operations.
