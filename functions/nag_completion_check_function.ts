import { DefineFunction, SlackFunction } from "deno-slack-sdk/mod.ts";

export const NagCompletionCheckFunctionDefinition = DefineFunction({
  callback_id: "nag_completion_check_function",
  title: "Nag Completion Check",
  description: "Checks all nags, cleans up completed ones, and DMs the nagger",
  source_file: "functions/nag_completion_check_function.ts",
  input_parameters: { properties: {}, required: [] },
  output_parameters: { properties: {}, required: [] },
});

export default SlackFunction(
  NagCompletionCheckFunctionDefinition,
  async ({ client }) => {
    // Fetch all nags across all channels with pagination
    let allNags: Record<string, unknown>[] = [];
    let cursor: string | undefined = undefined;
    do {
      const res = await client.apps.datastore.query({
        datastore: "nags",
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      if (!res.ok) break;
      allNags = allNags.concat((res.items as Record<string, unknown>[]) ?? []);
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    for (const nag of allNags) {
      const channel = nag.channel_id as string;
      const naggedUsers: string[] = JSON.parse(nag.nagged_users as string);
      const msgTs = nag.message_ts as string;

      // Join channel so the bot can read reactions
      await client.conversations.join({ channel }).catch(() => {});

      // Check reactions on the original message + any reminders
      const reminderTs: string[] = JSON.parse(
        (nag.reminder_timestamps as string) || "[]",
      );
      let reactedUsers: string[] = [];
      for (const ts of [msgTs, ...reminderTs]) {
        try {
          const reactRes = await client.reactions.get({
            channel,
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
          // Message deleted or inaccessible
        }
      }

      const pending = naggedUsers.filter((uid) => !reactedUsers.includes(uid));
      if (pending.length > 0 || naggedUsers.length === 0) continue;

      // Everyone has reacted — delete and notify
      await client.apps.datastore
        .delete({
          datastore: "nags",
          id: nag.id as string,
        })
        .catch(() => {});

      let link = "";
      try {
        const pl = await client.chat.getPermalink({
          channel,
          message_ts: msgTs,
        });
        link = pl.permalink as string;
      } catch (_) {}

      try {
        const dmRes = await client.conversations.open({
          users: nag.nagged_by as string,
        });
        if (dmRes.ok && dmRes.channel?.id) {
          const nagLink = link ? `<${link}|your nag>` : "your nag";
          const preview =
            (nag.message as string).slice(0, 100) +
            ((nag.message as string).length > 100 ? "…" : "");
          await client.chat.postMessage({
            channel: dmRes.channel.id as string,
            text: `✅ Everyone has completed ${nagLink}!\n\n> ${preview}`,
          });
        }
      } catch (_) {}
    }

    return { completed: true, outputs: {} };
  },
);
