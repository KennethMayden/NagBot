import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const SendNagFunctionDefinition = DefineFunction({
  callback_id: "send_nag_function",
  title: "Send a nag",
  description: "Post a nag message and record it for reaction tracking",
  source_file: "functions/send_nag_function.ts",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post the nag in",
      },
      nagged_by: {
        type: Schema.slack.types.user_id,
        description: "The person sending the nag",
      },
    },
    required: ["interactivity", "channel", "nagged_by"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  SendNagFunctionDefinition,
  async ({ inputs, client }) => {
    // Open a modal for the user to fill in nag details
    const modalResponse = await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: {
        type: "modal",
        callback_id: "nag_modal",
        title: { type: "plain_text", text: "🔔 Send a Nag", emoji: true },
        submit: { type: "plain_text", text: "Send Nag", emoji: true },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: JSON.stringify({
          channel: inputs.channel,
          nagged_by: inputs.nagged_by,
        }),
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "*Who do you want to nag?*\nCheck the box to nag everyone, or pick specific people below.",
            },
          },
          {
            type: "input",
            block_id: "nag_everyone_block",
            optional: true,
            label: { type: "plain_text", text: "Nag everyone" },
            element: {
              type: "checkboxes",
              action_id: "nag_everyone_select",
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: "Nag everyone in this channel",
                    emoji: true,
                  },
                  value: "nag_everyone",
                },
              ],
            },
          },
          {
            type: "input",
            block_id: "users_block",
            optional: true,
            label: { type: "plain_text", text: "Or pick specific people" },
            element: {
              type: "multi_users_select",
              action_id: "users_select",
              placeholder: { type: "plain_text", text: "Select people…" },
            },
          },
          {
            type: "input",
            block_id: "message_block",
            label: {
              type: "plain_text",
              text: "What do you need them to do?",
            },
            element: {
              type: "plain_text_input",
              action_id: "message_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text:
                  "e.g. Please react ✅ once you have reviewed the Q3 report.",
              },
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text:
                  "💡 _Use `/nag-check` after posting to follow up on non-reactors._",
              },
            ],
          },
        ],
      },
    });

    if (modalResponse.error) {
      return { error: `Failed to open modal: ${modalResponse.error}` };
    }

    return { completed: false };
  },
)
  .addViewSubmissionHandler("nag_modal", async ({ view, client }) => {
    const values = view.state.values;
    const meta = JSON.parse(view.private_metadata);
    const { channel, nagged_by } = meta;

    const nagEveryone: boolean =
      values.nag_everyone_block?.nag_everyone_select?.selected_options?.some(
        (o: { value: string }) => o.value === "nag_everyone",
      ) ?? false;

    let selectedUsers: string[] =
      values.users_block?.users_select?.selected_users ?? [];

    const message: string = values.message_block.message_input.value ?? "";

    if (nagEveryone) {
      // Fetch all channel members with pagination
      let allMembers: string[] = [];
      let cursor: string | undefined = undefined;
      do {
        const membersResponse = await client.conversations.members({
          channel,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (membersResponse.error) break;
        allMembers = allMembers.concat(
          (membersResponse.members as string[]) ?? [],
        );
        cursor = membersResponse.response_metadata?.next_cursor || undefined;
      } while (cursor);

      // Exclude the sender
      selectedUsers = allMembers.filter((uid: string) => uid !== nagged_by);
    }

    if (!selectedUsers.length || !message) {
      return {
        response_action: "errors",
        errors: {
          users_block:
            "Please select at least one person, or check 'Nag everyone'.",
        },
      };
    }

    // Build the nag message
    const mentions = selectedUsers.map((uid: string) => `<@${uid}>`).join(" ");
    const fullMessage = `${mentions}\n\n${message}\n\n_Please react to this message (e.g. ✅) once you're done!_`;

    // Post the nag
    const postResponse = await client.chat.postMessage({
      channel,
      text: fullMessage,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: fullMessage },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Nag sent by <@${nagged_by}> • Use \`/nag-check\` to follow up_`,
            },
          ],
        },
      ],
    });

    if (postResponse.error) {
      return { response_action: "clear" };
    }

    const nagId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Save nag to datastore
    await client.apps.datastore.put({
      datastore: "nags",
      item: {
        id: nagId,
        channel_id: channel,
        message_ts: postResponse.ts as string,
        nagged_by,
        nagged_users: JSON.stringify(selectedUsers),
        message,
        created_at: now,
      },
    });

    // Increment nag counts for each nagged user
    for (const uid of selectedUsers) {
      const existing = await client.apps.datastore.get({
        datastore: "nag_counts",
        id: uid,
      });

      const currentCount: number =
        (existing.item?.total_nags as number) ?? 0;

      await client.apps.datastore.put({
        datastore: "nag_counts",
        item: {
          user_id: uid,
          total_nags: currentCount + 1,
          last_nagged: now,
        },
      });
    }

    // Complete the function
    await client.functions.completeSuccess({
      function_execution_id: view.private_metadata,
      outputs: {},
    });

    return { response_action: "clear" };
  });
