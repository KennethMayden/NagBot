import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const NagStatsFunctionDefinition = DefineFunction({
  callback_id: "nag_stats_function",
  title: "Nag stats leaderboard",
  description: "Show who has been nagged the most and least",
  source_file: "functions/nag_stats_function.ts",
  input_parameters: {
    properties: {
      channel: {
        type: Schema.slack.types.channel_id,
        description: "Channel to send the stats to",
      },
      requester: {
        type: Schema.slack.types.user_id,
        description: "User who asked for stats",
      },
    },
    required: ["channel", "requester"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

function miniBar(val: number, max: number, width = 8): string {
  const filled = max > 0 ? Math.round((val / max) * width) : 0;
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

export default SlackFunction(
  NagStatsFunctionDefinition,
  async ({ inputs, client }) => {
    const { channel, requester } = inputs;

    // Fetch all nag counts
    const res = await client.apps.datastore.query({
      datastore: "nag_counts",
      limit: 50,
    });

    if (!res.ok || !res.items?.length) {
      await client.chat.postEphemeral({
        channel,
        user: requester,
        text:
          "📭 No nag data yet — send some nags first with `/nag`, then check back!",
      });
      return { outputs: {} };
    }

    const stats = (res.items as Record<string, unknown>[]).sort(
      (a, b) => (b.total_nags as number) - (a.total_nags as number),
    );

    const medals = ["🥇", "🥈", "🥉"];
    const maxNags = stats[0].total_nags as number;

    const topRows = stats
      .slice(0, 15)
      .map((s, i) => {
        const bar = miniBar(s.total_nags as number, maxNags);
        const medal = medals[i] ?? `${i + 1}.`;
        const lastDate = s.last_nagged
          ? new Date((s.last_nagged as number) * 1000).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short" },
            )
          : "never";
        return `${medal} <@${s.user_id}> ${bar} *${s.total_nags}* nag${
          s.total_nags !== 1 ? "s" : ""
        } _(last: ${lastDate})_`;
      })
      .join("\n");

    const leastNagged = [...stats]
      .sort((a, b) => (a.total_nags as number) - (b.total_nags as number))
      .slice(0, 3);

    const leastRows = leastNagged
      .map(
        (s) =>
          `• <@${s.user_id}> — ${s.total_nags} nag${
            s.total_nags !== 1 ? "s" : ""
          }`,
      )
      .join("\n");

    await client.chat.postEphemeral({
      channel,
      user: requester,
      text: "Nag leaderboard",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 Nag Leaderboard",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Most Nagged* 🔔\n${topRows}`,
          },
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Least Nagged* 😇\n${leastRows}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Showing ${Math.min(stats.length, 15)} of ${stats.length} tracked people_`,
            },
          ],
        },
      ],
    });

    return { outputs: {} };
  },
);
