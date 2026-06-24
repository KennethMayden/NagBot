import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

// All nag messages live here; never post mentions elsewhere
const NAG_BOT_CHANNEL_ID = "C0BDN88PS00";

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

    // Fetch recent nags from the nag-bot channel
    const queryRes = await client.apps.datastore.query({
      datastore: "nags",
      expression: "#channel_id = :channel_id",
      expression_attributes: { "#channel_id": "channel_id" },
      expression_values: { ":channel_id": NAG_BOT_CHANNEL_ID },
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

      // The bot must be in the nag-bot channel to call reactions.get
      await client.conversations.join({ channel: NAG_BOT_CHANNEL_ID }).catch(
        () => {},
      );

      // Check reactions on the original message + any reminder messages
      const reminderTs: string[] = JSON.parse(
        (nag.reminder_timestamps as string) || "[]",
      );
      const timestampsToCheck = [msgTs, ...reminderTs];

      let reactedUsers: string[] = [];
      for (const ts of timestampsToCheck) {
        try {
          const reactRes = await client.reactions.get({
            channel: NAG_BOT_CHANNEL_ID,
            timestamp: ts,
            full: true,
          });
          const reactions =
            (reactRes.message as Record<string, unknown>)?.reactions ?? [];
          const users = (reactions as Record<string, unknown>[]).flatMap(
            (r) => r.users as string[],
          );
          reactedUsers = [...new Set([...reactedUsers, ...users])];
        } catch (_) {
          // Message may have been deleted
        }
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
          channel: NAG_BOT_CHANNEL_ID,
          message_ts: msgTs,
        });
        link = pl.permalink as string;
      } catch (_) {}

      const nagType = (nag.nag_type as string) ?? "standard";
      const isRecurring = nagType === "do_now" || nagType === "do_by_deadline";
      const isCancelled = nag.is_cancelled as boolean | undefined;

      let typeLabel = "";
      if (nagType === "do_now") {
        typeLabel = isCancelled ? " _(🔁 Do Now — cancelled)_" : " _🔁 Do Now_";
      } else if (nagType === "do_by_deadline") {
        const deadlineStr = nag.deadline
          ? new Date((nag.deadline as number) * 1000).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short", year: "numeric" },
            )
          : "no date set";
        typeLabel = isCancelled
          ? ` _(⏰ Deadline: ${deadlineStr} — cancelled)_`
          : ` _⏰ Due ${deadlineStr}_`;
      }

      const nagText = [
        `*${link ? `<${link}|Nag>` : "Nag"}* from <@${nag.nagged_by}> • _${dateStr}_${typeLabel}`,
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
            channel: NAG_BOT_CHANNEL_ID,
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

      // Add cancel button for active recurring nags
      if (isRecurring && !isCancelled) {
        blocks.push({
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🚫 Cancel Recurring",
                emoji: true,
              },
              action_id: `cancel_recurring_${nag.id}`,
              value: nag.id as string,
              confirm: {
                title: {
                  type: "plain_text",
                  text: "Cancel recurring nag?",
                },
                text: {
                  type: "mrkdwn",
                  text: "This stops all future automatic daily re-nags for this nag.",
                },
                confirm: { type: "plain_text", text: "Yes, cancel it" },
                deny: { type: "plain_text", text: "Keep going" },
              },
            },
          ],
        });
      }

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
  const { nagId, channel, pendingUsers, originalMessage, messageTs } = payload;
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

  const reminderPost = await client.chat.postMessage({
    channel: channelId,
    text: `🔔 *Reminder!* ${mentions}\n\nYou haven't reacted to ${
      permalink ? `<${permalink}|this message>` : "the original nag"
    } yet.\n_Original ask: "${originalMessage}"_`,
  });

  // Store the reminder message timestamp so reactions to it also count
  if (reminderPost.ok && reminderPost.ts && nagId) {
    const existing = await client.apps.datastore.get({
      datastore: "nags",
      id: nagId as string,
    });
    if (existing.ok && existing.item) {
      const reminders: string[] = JSON.parse(
        (existing.item.reminder_timestamps as string) || "[]",
      );
      reminders.push(reminderPost.ts as string);
      await client.apps.datastore.put({
        datastore: "nags",
        item: {
          ...existing.item,
          reminder_timestamps: JSON.stringify(reminders),
        },
      });
    }
  }

  // Bot reacts ✅ to prime the reaction on the reminder message
  if (reminderPost.ts) {
    await client.reactions.add({
      channel: channelId,
      timestamp: reminderPost.ts as string,
      name: "white_check_mark",
    }).catch(() => {});
  }

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

  // Confirm to the checker ephemerally in the channel where they invoked the command
      const invocationChannel =
        (body.container as Record<string, string>)?.channel_id || channelId;
      await client.chat.postEphemeral({
        channel: invocationChannel,
        user: checker,
        text: `✅ Re-nag sent to ${(pendingUsers as string[]).map((u) => `<@${u}>`).join(", ")}!`,
      });
    },
  )
  .addBlockActionsHandler(
    /^cancel_recurring_/,
    async ({ action, body, client }) => {
      const nagId = (action as Record<string, string>).value;
      const canceller = body.user.id;

      // Fetch the nag to get channel and current data
      const res = await client.apps.datastore.get({
        datastore: "nags",
        id: nagId,
      });

      if (!res.ok || !res.item) {
        return; // Nothing to cancel
      }

      const channelId = res.item.channel_id as string;

      // Mark as cancelled (full replace required by datastore)
      await client.apps.datastore.put({
        datastore: "nags",
        item: { ...res.item, is_cancelled: true },
      });

      const invocationChannel =
        (body.container as Record<string, string>)?.channel_id || channelId;
      await client.chat.postEphemeral({
        channel: invocationChannel,
        user: canceller,
        text: "🚫 Recurring nag cancelled — no more automatic daily reminders for that nag.",
      });
    },
  );
