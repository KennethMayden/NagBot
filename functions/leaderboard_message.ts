// Utility — posts or edits-in-place the public leaderboard message in the
// nag-bot channel. Called from reaction_points_function after points are awarded.

const NAG_BOT_CHANNEL_ID = "C0BDN88PS00";
const CONFIG_ID = "leaderboard";

function miniBar(val: number, max: number, width = 8): string {
  const filled = max > 0 ? Math.round((val / max) * width) : 0;
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function buildBlocks(items: Record<string, unknown>[]): unknown[] {
  const medals = ["🥇", "🥈", "🥉"];
  const sorted = [...items].sort(
    (a, b) => (b.total_points as number) - (a.total_points as number),
  );
  const maxPts = sorted.length > 0 ? (sorted[0].total_points as number) : 0;

  const rows = sorted.length > 0
    ? sorted
        .slice(0, 15)
        .map((s, i) => {
          const bar = miniBar(s.total_points as number, maxPts);
          const medal = medals[i] ?? `${i + 1}.`;
          return `${medal} <@${s.user_id}> ${bar} *${s.total_points}* pt${
            (s.total_points as number) !== 1 ? "s" : ""
          }`;
        })
        .join("\n")
    : "_No points yet — react to nags early to get on the board!_";

  const now = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🏆 Leaderboard", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_First to react earns the most points. In a nag with N people: 1st gets N−1 pts, last gets 0._\n\n${rows}`,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `_Last updated: ${now}_` },
      ],
    },
  ];
}

// deno-lint-ignore no-explicit-any
export async function refreshLeaderboard(client: any): Promise<void> {
  // Fetch all points data
  const pointsRes = await client.apps.datastore.query({
    datastore: "reaction_points",
    limit: 50,
  });
  const items = (pointsRes.ok
    ? (pointsRes.items as Record<string, unknown>[])
    : []);
  const blocks = buildBlocks(items);

  // Look up the stored message ts
  const configRes = await client.apps.datastore.get({
    datastore: "leaderboard_config",
    id: CONFIG_ID,
  });
  const existingTs = configRes.item?.message_ts as string | undefined;

  if (existingTs) {
    // Edit the existing pinned message in-place
    await client.chat.update({
      channel: NAG_BOT_CHANNEL_ID,
      ts: existingTs,
      text: "🏆 Leaderboard",
      blocks,
    }).catch(() => {});
  } else {
    // First run — post a new message, store its ts, and pin it
    const postRes = await client.chat.postMessage({
      channel: NAG_BOT_CHANNEL_ID,
      text: "🏆 Leaderboard",
      blocks,
    });

    if (postRes.ok && postRes.ts) {
      await client.apps.datastore.put({
        datastore: "leaderboard_config",
        item: {
          id: CONFIG_ID,
          message_ts: postRes.ts as string,
          channel_id: NAG_BOT_CHANNEL_ID,
        },
      });

      // Pin the message so it's always easy to find
      await client.pins.add({
        channel: NAG_BOT_CHANNEL_ID,
        timestamp: postRes.ts as string,
      }).catch(() => {});
    }
  }
}
