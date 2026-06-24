import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { refreshLeaderboard } from "./leaderboard_message.ts";

export const ClearLeaderboardFunctionDefinition = DefineFunction({
  callback_id: "clear_leaderboard_function",
  title: "Clear leaderboard",
  description: "Reset all reaction speed points to zero",
  source_file: "functions/clear_leaderboard_function.ts",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["interactivity", "channel", "user_id"],
  },
  output_parameters: { properties: {}, required: [] },
});

export default SlackFunction(
  ClearLeaderboardFunctionDefinition,
  async ({ inputs, client }) => {
    const modalResponse = await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: {
        type: "modal",
        callback_id: "clear_leaderboard_modal",
        title: {
          type: "plain_text",
          text: "🗑️ Clear Leaderboard",
          emoji: true,
        },
        submit: { type: "plain_text", text: "Yes, clear it", emoji: true },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: JSON.stringify({
          channel: inputs.channel,
          user_id: inputs.user_id,
        }),
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Are you sure you want to clear the leaderboard?*\n\nThis will permanently reset all reaction speed points to zero for everyone. The pinned leaderboard message will be updated to reflect the cleared state.\n\n⚠️ *This cannot be undone.*",
            },
          },
        ],
      },
    });

    if (modalResponse.error) {
      return { error: `Failed to open modal: ${modalResponse.error}` };
    }

    return { completed: false };
  },
).addViewSubmissionHandler(
  "clear_leaderboard_modal",
  async ({ view, client }) => {
    const meta = JSON.parse(view.private_metadata);
    const { channel, user_id } = meta;

    // Delete all reaction_points records (paginated to handle large datasets)
    let cursor: string | undefined;
    do {
      const res = await client.apps.datastore.query({
        datastore: "reaction_points",
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      if (!res.ok || !res.items?.length) break;

      for (const item of res.items as Record<string, unknown>[]) {
        await client.apps.datastore.delete({
          datastore: "reaction_points",
          id: item.user_id as string,
        }).catch(() => {});
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    // Refresh the pinned leaderboard message to show the empty state
    await refreshLeaderboard(client).catch(() => {});

    // Send ephemeral confirmation to the user who ran the command
    await client.chat.postEphemeral({
      channel,
      user: user_id,
      text: "✅ Leaderboard cleared! All reaction speed points have been reset to zero.",
    });

    return { response_action: "clear" };
  },
);
