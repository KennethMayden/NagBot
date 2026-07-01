import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const RecurringNagFunctionDefinition = DefineFunction({
  callback_id: "recurring_nag_function",
  title: "Process recurring nags",
  description:
    "Runs daily to re-nag pending users on all active recurring nags",
  source_file: "functions/recurring_nag_function.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  RecurringNagFunctionDefinition,
  async ({ client }) => {
    const now = Math.floor(Date.now() / 1000);

    // Fetch all nags (paginated)
    let allNags: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    do {
      const res = await client.apps.datastore.query({
        datastore: "nags",
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      if (!res.ok) break;
      allNags = allNags.concat(
        (res.items as Record<string, unknown>[]) ?? [],
      );
      cursor =
        (res.response_metadata as Record<string, string>)?.next_cursor ||
        undefined;
    } while (cursor);

    // Only process active recurring nags
    const activeNags = allNags.filter((nag) => {
      const nagType = nag.nag_type as string | undefined;
      return (
        (nagType === "do_now" || nagType === "do_by_deadline") &&
        !nag.is_cancelled
      );
    });

    for (const nag of activeNags) {
      const channel = nag.channel_id as string | undefined;
      const msgTs = nag.message_ts as string | undefined;
      const nagType = nag.nag_type as string;

      if (!channel || !msgTs) continue;

      // For do_by_deadline: check whether it's time to begin nagging
      if (nagType === "do_by_deadline") {
        const deadline = nag.deadline as number | undefined;
        if (!deadline) continue;
        const daysBefore = nag.days_before as number | undefined;
        const startTime = daysBefore
          ? deadline - daysBefore * 86400
          : deadline;
        if (now < startTime) continue; // Not yet time
      }

      // Check reactions on the original message
      let reactedUsers: string[] = [];
      try {
        const reactRes = await client.reactions.get({
          channel,
          timestamp: msgTs,
        });
        const reactions =
          (reactRes.message as Record<string, unknown>)?.reactions ?? [];
        const allUsers = (reactions as Record<string, unknown>[]).flatMap(
          (r) => r.users as string[],
        );
        reactedUsers = [...new Set(allUsers)];
      } catch (_) {
        // Message may have been deleted; skip silently
        continue;
      }

      const naggedUsers: string[] = JSON.parse(
        nag.nagged_users as string,
      );
      const pending = naggedUsers.filter(
        (uid) => !reactedUsers.includes(uid),
      );

      // Everyone reacted → auto-cancel this recurring nag
      if (pending.length === 0) {
        await client.apps.datastore.put({
          datastore: "nags",
          item: { ...nag, is_cancelled: true },
        });
        continue;
      }

      // Build permalink to original message
      let permalink = "";
      try {
        const pl = await client.chat.getPermalink({
          channel,
          message_ts: msgTs,
        });
        permalink = pl.permalink as string;
      } catch (_) {}

      const mentions = pending.map((uid) => `<@${uid}>`).join(" ");
      const nagRef = permalink
        ? `<${permalink}|this nag>`
        : "this nag";

      let deadlineLine = "";
      if (nagType === "do_by_deadline" && nag.deadline) {
        const deadlineStr = new Date(
          (nag.deadline as number) * 1000,
        ).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        deadlineLine = `\n⏰ *Deadline: ${deadlineStr}*`;
      }

      const headerLabel = nagType === "do_by_deadline"
        ? "⏰ Deadline Reminder"
        : "🔁 Daily Reminder";

      const reminderRes = await client.chat.postMessage({
        channel,
        text:
          `${headerLabel} — ${mentions}\n\nYou still need to action ${nagRef}.\n_Original ask: "${nag.message}"_${deadlineLine}`,
      });

      if (reminderRes.ts) {
        await client.reactions.add({
          channel,
          timestamp: reminderRes.ts as string,
          name: "white_check_mark",
        }).catch(() => {});

        // Store the reminder timestamp so reactions to it count for points
        const reminders: string[] = JSON.parse(
          (nag.reminder_timestamps as string) || "[]",
        );
        reminders.push(reminderRes.ts);
        await client.apps.datastore.put({
          datastore: "nags",
          item: { ...nag, reminder_timestamps: JSON.stringify(reminders) },
        });
      }

      // Increment nag counts for pending users
      for (const uid of pending) {
        const existing = await client.apps.datastore.get({
          datastore: "nag_counts",
          id: uid,
        });
        const count = (existing.item?.total_nags as number) ?? 0;
        await client.apps.datastore.put({
          datastore: "nag_counts",
          item: {
            user_id: uid,
            total_nags: count + 1,
            last_nagged: now,
          },
        });
      }
    }

    return { outputs: {} };
  },
);
