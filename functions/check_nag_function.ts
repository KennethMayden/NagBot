import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const CheckNagFunctionDefinition = DefineFunction({
  callback_id: "check_nag_function",
  title: "Check nag reactions",
  description: "Show who hasn't reacted yet and offer to re-nag them",
  source_file: "functions/check_nag_function.ts",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: {
        type: Schema.slack.types.channel_id,
        description: "Channel to check nags for",
      },
      checker: {
        type: Schema.slack.types.user_id,
        description: "User running the check",
      },
    },
    required: ["interactivity", "channel", "checker"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

function progressBar(pct: number, width = 10): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled) + ` ${pct}%`;
}

export default SlackFunction(
  CheckNagFunctionDefinition,
  async ({ inputs, client }) => {
    const { channel, checker } = inputs;

    // Fetch recent nags for this channel
    const queryRes = await client.apps.datastore.query({
      datastore: "nags",
      expression: "#channel_id = :channel_id",
      expression_attributes: { "#channel_id": "channel_id" },
      expression_values: { ":channel_id": channel },
      limit: 8,
    });

    if (!queryRes.ok || !queryRes.items?.length) {
      await client.chat.postEphemeral({
        channel,
        user: checker,
        text: "📭 No nags found in this channel yet. Use `/nag` to send one!",
      });
      await client.functions.completeSuccess({
        function_execution_id: inputs.interactivity.interactivity_pointer,
        outputs: {},
      });
      return { completed: false };
    }

    // Sort by most recent
    const nags = (queryRes.items as Record<string, unknown>[]).sort(
      (a, b) => (b.created_at as number) - (a.created_at as number),
    );

    const blocks: unknown[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔍 Recent Nags — Reaction Status",
          emoji: true,
        },
      },
      { type: "divider" },
    ];

    for (const nag of nags) {
      const naggedUsers: string[] = JSON.parse(nag.nagged_users as string);
      const msgTs = nag.message_ts as string;

      // Fetch reactions on the original message
      // The bot must be in the channel to call reactions.get; join first
      // (no-op if already a member; fails silently for private channels)
      await client.conversations.join({ channel }).catch(() => {});

      let reactedUsers: string[] = [];
      try {
        const reactRes = await client.reactions.get({
          channel,
          timestamp: msgTs,
          full: true,
        });
        const reactions =
          (reactRes.message as Record<string, unknown>)?.reactions ?? [];
        const allUsers = (reactions as Record<string, unknown>[]).flatMap(
          (r) => r.users as string[],
        );
        reactedUsers = [...new Set(allUsers)];
      } catch (_) {
        // Message may have been deleted
      }

      const done = naggedUsers.filter((uid) => reactedUsers.includes(uid));
      const pending = naggedUsers.filter((uid) => !reactedUsers.includes(uid));
      const pct = naggedUsers.length
        ? Math.round((done.length / naggedUsers.length) * 100)
        : 0;

      const dateStr = new Date(
        (nag.created_at as number) * 1000,
      ).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Build permalink
      let link = "";
      try {
        const pl = await client.chat.getPermalink({
          channel,
          message_ts: msgTs,
        });
        link = pl.permalink as string;
      } catch (_) {}

      const nagText = [
        `*${link ? `<${link}|Nag>` : "Nag"}* from <@${nag.nagged_by}> • _${dateStr}_`,
        `> ${(nag.message as string).slice(0, 100)}${
          (nag.message as string).length > 100 ? "…" : ""
        }`,
        `${progressBar(pct)}  *${done.length}/${naggedUsers.length}* reacted`,
        pending.length
          ? `⏳ Still waiting on: ${pending.map((u) => `<@${u}>`).join(", ")}`
          : "✅ _Everyone has reacted!_",
      ].join("\n");

      const block: Record<string, unknown> = {
        type: "section",
        text: { type: "mrkdwn", text: nagText },
      };

      if (pending.length) {
        block.accessory = {
          type: "button",
          text: { type: "plain_text", text: "🔔 Re-nag them", emoji: true },
          style: "danger",
          action_id: `renag_${nag.id}`,
          value: JSON.stringify({
            nagId: nag.id,
            channel,
            pendingUsers: pending,
            originalMessage: nag.message,
            messageTs: msgTs,
          }),
          confirm: {
            title: { type: "plain_text", text: "Send follow-up nag?" },
            text: {
              type: "mrkdwn",
              text: `This will ping ${pending.map((u: string) => `<@${u}>`).join(", ")} in the channel.`,
            },
            confirm: { type: "plain_text", text: "Yes, nag them!" },
            deny: { type: "plain_text", text: "Cancel" },
          },
        };
      }

      blocks.push(block);
      blocks.push({ type: "divider" });
    }

    await client.chat.postEphemeral({
      channel,
      user: checker,
      blocks,
      text: "Here are your recent nags and their reaction status:",
    });

    return { completed: false };
  },
).addBlockActionsHandler(/^renag_/, async ({ action, body, client }) => {
  const payload = JSON.parse((action as Record<string, string>).value);
  const { channel, pendingUsers, originalMessage, messageTs } = payload;
  const channelId = channel as string;
  const checker = body.user.id;

  // Get permalink to original message
  let permalink = "";
  try {
    const pl = await client.chat.getPermalink({
      channel: channelId,
      message_ts: messageTs as string,
    });
    permalink = pl.permalink as string;
  } catch (_) {}

  const mentions = (pendingUsers as string[])
    .map((uid) => `<@${uid}>`)
    .join(" ");

  await client.chat.postMessage({
    channel: channelId,
    text: `🔔 *Reminder!* ${mentions}\n\nYou haven't reacted to ${
      permalink ? `<${permalink}|this message>` : "the original nag"
    } yet.\n_Original ask: "${originalMessage}"_`,
  });

  // Increment nag counts for re-nagged users
  const now = Math.floor(Date.now() / 1000);
  for (const uid of pendingUsers as string[]) {
    const existing = await client.apps.datastore.get({
      datastore: "nag_counts",
      id: uid,
    });
    const currentCount: number = (existing.item?.total_nags as number) ?? 0;
    await client.apps.datastore.put({
      datastore: "nag_counts",
      item: {
        user_id: uid,
        total_nags: currentCount + 1,
        last_nagged: now,
      },
    });
  }

  // Confirm to the checker ephemerally
  await client.chat.postEphemeral({
    channel: channelId,
    user: checker,
    text: `✅ Re-nag sent to ${(pendingUsers as string[]).map((u) => `<@${u}>`).join(", ")}!`,
  });
});
