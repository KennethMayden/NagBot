import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { refreshLeaderboard } from "./leaderboard_message.ts";

export const ReactionPointsFunctionDefinition = DefineFunction({
  callback_id: "reaction_points_function",
  title: "Award reaction points",
  description: "Awards leaderboard points when someone reacts to a nag message",
  source_file: "functions/reaction_points_function.ts",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reactor: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reactor"],
  },
  output_parameters: { properties: {}, required: [] },
});

export default SlackFunction(
  ReactionPointsFunctionDefinition,
  async ({ inputs, client }) => {
    const { message_ts, reactor } = inputs;

    // Find the nag whose original message matches this timestamp
    let nag: Record<string, unknown> | null = null;

    const directQuery = await client.apps.datastore.query({
      datastore: "nags",
      expression: "#message_ts = :ts",
      expression_attributes: { "#message_ts": "message_ts" },
      expression_values: { ":ts": message_ts },
    });

    if (directQuery.ok && directQuery.items?.length) {
      nag = (directQuery.items as Record<string, unknown>[])[0];
    } else {
      // Fall back: scan all nags and check reminder_timestamps
      let cursor: string | undefined;
      outer:
      do {
        const res = await client.apps.datastore.query({
          datastore: "nags",
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (!res.ok) break;
        for (const n of (res.items as Record<string, unknown>[]) ?? []) {
          const reminders: string[] = JSON.parse(
            (n.reminder_timestamps as string) || "[]",
          );
          if (reminders.includes(message_ts)) {
            nag = n;
            break outer;
          }
        }
        cursor = res.response_metadata?.next_cursor || undefined;
      } while (cursor);
    }

    // Not a tracked nag message — nothing to do
    if (!nag) return { outputs: {} };

    const naggedUsers: string[] = JSON.parse(nag.nagged_users as string);

    // Only award points to people who were nagged (naturally excludes the bot)
    if (!naggedUsers.includes(reactor)) return { outputs: {} };

    // Prevent double-awarding if the user adds more than one reaction
    const reactedUsers: string[] = JSON.parse(
      (nag.reacted_users as string) || "[]",
    );
    if (reactedUsers.includes(reactor)) return { outputs: {} };

    // Position is how many nagged users have already been awarded before this one.
    // Points = (total nagged) - (already awarded) - 1
    // e.g. 5 people: 1st → 4pts, 2nd → 3pts, …, 5th → 0pts
    const alreadyAwarded = reactedUsers.filter((uid) =>
      naggedUsers.includes(uid)
    ).length;
    const points = naggedUsers.length - alreadyAwarded - 1;

    // Record this user as awarded on the nag so future reactions are ignored
    await client.apps.datastore.put({
      datastore: "nags",
      item: {
        ...nag,
        reacted_users: JSON.stringify([...reactedUsers, reactor]),
      },
    });

    // Accumulate points in the leaderboard datastore
    const existing = await client.apps.datastore.get({
      datastore: "reaction_points",
      id: reactor,
    });
    const currentPoints: number = (existing.item?.total_points as number) ?? 0;

    await client.apps.datastore.put({
      datastore: "reaction_points",
      item: {
        user_id: reactor,
        total_points: currentPoints + points,
        last_awarded: Math.floor(Date.now() / 1000),
      },
    });

    // Post or update the pinned leaderboard message in the nag-bot channel
    await refreshLeaderboard(client).catch(() => {});

    return { outputs: {} };
  },
);
