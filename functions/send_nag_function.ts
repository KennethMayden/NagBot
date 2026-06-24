import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

type SelectOption = { text: { type: "plain_text"; text: string }; value: string };
type OptionGroup = { label: { type: "plain_text"; text: string }; options: SelectOption[] };

// Converts a single rich_text_section elements array to a mrkdwn string
// deno-lint-ignore no-explicit-any
function richTextSectionToMrkdwn(elements: any[]): string {
  return elements.map((el) => {
    switch (el.type) {
      case "text": {
        let t: string = el.text ?? "";
        const s = el.style ?? {};
        if (s.code) return "`" + t + "`";
        if (s.bold) t = "*" + t + "*";
        if (s.italic) t = "_" + t + "_";
        if (s.strike) t = "~" + t + "~";
        return t;
      }
      case "emoji": return `:${el.name}:`;
      case "link": return el.text && el.text !== el.url ? `<${el.url}|${el.text}>` : `<${el.url}>`;
      case "user": return `<@${el.user_id}>`;
      case "channel": return `<#${el.channel_id}>`;
      case "usergroup": return `<!subteam^${el.usergroup_id}>`;
      default: return "";
    }
  }).join("");
}

// Converts a rich_text block (from rich_text_input) to a mrkdwn string
// deno-lint-ignore no-explicit-any
function richTextToMrkdwn(richText: any): string {
  if (!richText || richText.type !== "rich_text") return "";
  return (richText.elements ?? []).map((block: any) => {
    switch (block.type) {
      case "rich_text_section":
        return richTextSectionToMrkdwn(block.elements ?? []);
      case "rich_text_preformatted":
        return "```" + richTextSectionToMrkdwn(block.elements ?? []) + "```";
      case "rich_text_quote":
        return "> " + richTextSectionToMrkdwn(block.elements ?? []);
      case "rich_text_list": {
        return (block.elements ?? []).map((item: any, idx: number) => {
          const text = richTextSectionToMrkdwn(item.elements ?? []);
          return block.style === "ordered" ? `${idx + 1}. ${text}` : `• ${text}`;
        }).join("\n");
      }
      default: return "";
    }
  }).join("\n");
}

// All nag @mentions are always posted here
const NAG_BOT_CHANNEL_ID = "C0BDN88PS00";
// "Everyone in Mayden" — pulls all members from the general channel
const GENERAL_CHANNEL_ID = "C02FQJL1Z";

// Options shared between buildModalBlocks and the block_actions handler
const NAG_TYPE_OPTIONS = [
  {
    text: { type: "plain_text", text: "Standard (one-time)" },
    value: "standard",
  },
  {
    text: { type: "plain_text", text: "Do Now — re-nag daily until done" },
    value: "do_now",
  },
  {
    text: { type: "plain_text", text: "Do By Deadline — nag toward a date" },
    value: "do_by_deadline",
  },
] as const;

// Fetches all active (non-deleted) usergroups as SelectOptions for the
// groups multi_static_select element.
// deno-lint-ignore no-explicit-any
async function fetchGroupOptions(client: any): Promise<SelectOption[]> {
  const ugRes = await client.usergroups.list({});
  const usergroups: { id: string; name: string; date_delete?: number }[] =
    ugRes.usergroups ?? [];
  return usergroups
    .filter((ug) => !ug.date_delete)
    .map((ug) => ({
      text: { type: "plain_text" as const, text: `👥 ${ug.name}` },
      value: `group_${ug.id}`,
    }));
}

// Blocks that only appear when "Do By Deadline" is selected
function deadlineBlocks(): unknown[] {
  return [
    {
      type: "input",
      block_id: "deadline_block",
      label: { type: "plain_text", text: "Deadline" },
      element: {
        type: "datepicker",
        action_id: "deadline_input",
        placeholder: { type: "plain_text", text: "Select a date…" },
      },
    },
    {
      type: "input",
      block_id: "days_before_block",
      optional: true,
      label: {
        type: "plain_text",
        text: "Start nagging X days before deadline",
      },
      hint: {
        type: "plain_text",
        text: "Leave blank to only nag on and after the deadline day.",
      },
      element: {
        type: "number_input",
        action_id: "days_before_input",
        is_decimal_allowed: false,
        min_value: "1",
        placeholder: { type: "plain_text", text: "e.g. 3" },
      },
    },
  ];
}

const NAG_EVERYONE_MAYDEN_OPTION = {
  text: { type: "plain_text", text: "Everyone in Mayden", emoji: true },
  value: "nag_everyone",
};

// Builds the full modal block list; conditionally includes deadline blocks and pre-filled users
function buildModalBlocks(
  nagType: string,
  groupOptions: SelectOption[],
  initialUserIds?: string[],
  initialGroupSelections?: SelectOption[],
  checkedBox: "mayden" | "channel" | null = null,
): unknown[] {
  const selectedOption =
    NAG_TYPE_OPTIONS.find((o) => o.value === nagType) ?? NAG_TYPE_OPTIONS[0];

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Who do you want to nag?*\nPre-fill everyone in the team and remove who you like, or pick specific people.",
      },
    },
    {
      // actions block (not input) so the checkboxes fire block_actions immediately on click
      type: "actions",
      block_id: "nag_everyone_block",
      elements: [
        {
          type: "checkboxes",
          action_id: "nag_everyone_select",
          options: [NAG_EVERYONE_MAYDEN_OPTION],
          ...(checkedBox === "mayden" ? { initial_options: [NAG_EVERYONE_MAYDEN_OPTION] } : {}),
        },
        {
          type: "checkboxes",
          action_id: "nag_channel_select",
          options: [{ text: { type: "plain_text", text: "Everyone in this channel", emoji: true }, value: "nag_channel" }],
          ...(checkedBox === "channel" ? { initial_options: [{ text: { type: "plain_text", text: "Everyone in this channel", emoji: true }, value: "nag_channel" }] } : {}),
        },
      ],
    },
    {
      type: "input",
      block_id: "users_block",
      optional: true,
      label: {
        type: "plain_text",
        text: checkedBox === "mayden"
          ? "Remove anyone you don't want to nag (from Mayden)"
          : checkedBox === "channel"
          ? "Remove anyone you don't want to nag (from this channel)"
          : "Select people to nag",
      },
      element: {
        type: "multi_users_select",
        action_id: "users_select",
        placeholder: { type: "plain_text", text: "Select people…" },
        ...(initialUserIds?.length ? { initial_users: initialUserIds } : {}),
      },
    },
    ...(groupOptions.length > 0
      ? [
          {
            type: "input",
            block_id: "groups_block",
            optional: true,
            label: { type: "plain_text", text: "Select user groups to nag" },
            element: {
              type: "multi_static_select",
              action_id: "groups_select",
              placeholder: { type: "plain_text", text: "Select a group…" },
              options: groupOptions,
              ...(initialGroupSelections?.length
                ? { initial_options: initialGroupSelections }
                : {}),
            },
          },
        ]
      : []),
    {
      type: "input",
      block_id: "message_block",
      label: { type: "plain_text", text: "What do you need them to do?" },
      element: {
        type: "rich_text_input",
        action_id: "message_input",
        placeholder: {
          type: "plain_text",
          text: "e.g. Please react ✅ once you have reviewed the Q3 report.",
        },
      },
    },
    {
      type: "input",
      block_id: "nag_type_block",
      dispatch_action: true,
      label: { type: "plain_text", text: "Nag type" },
      element: {
        type: "static_select",
        action_id: "nag_type_select",
        initial_option: selectedOption,
        options: [...NAG_TYPE_OPTIONS],
      },
    },
    ...(nagType === "do_by_deadline" ? deadlineBlocks() : []),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💡 _Use `/nag-check` after posting to follow up on non-reactors._",
        },
      ],
    },
  ];
}

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
    // Fetch usergroup options for the groups picker
    const groupOptions = await fetchGroupOptions(client);

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
        blocks: buildModalBlocks("standard", groupOptions),
      },
    });

    if (modalResponse.error) {
      return { error: `Failed to open modal: ${modalResponse.error}` };
    }

    return { completed: false };
  },
).addBlockActionsHandler(
  "nag_everyone_select",
  async ({ action, body, client }) => {
    const checked = (
      action as { selected_options: { value: string }[] }
    ).selected_options.some((o) => o.value === "nag_everyone");

    const view = body.view as {
      id: string;
      private_metadata: string;
      state: { values: Record<string, Record<string, { selected_option?: { value: string }; selected_options?: SelectOption[]; selected_users?: string[] }>> };
    };
    const meta = JSON.parse(view.private_metadata);
    const nagType =
      view.state.values.nag_type_block?.nag_type_select?.selected_option
        ?.value ?? "standard";

    // Fetch usergroup options and preserve any already-selected group options
    const groupOptions = await fetchGroupOptions(client);
    const currentGroupSelections: SelectOption[] =
      view.state.values.groups_block?.groups_select?.selected_options ?? [];

    let initialUserIds: string[] | undefined;
    if (checked) {
      // Fetch all members of the Mayden general channel
      let allMembers: string[] = [];
      let cursor: string | undefined;
      do {
        const membersResponse = await client.conversations.members({
          channel: GENERAL_CHANNEL_ID,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (membersResponse.error) break;
        allMembers = allMembers.concat(
          (membersResponse.members as string[]) ?? [],
        );
        cursor = membersResponse.response_metadata?.next_cursor || undefined;
      } while (cursor);

      initialUserIds = allMembers;
    }

    // Store prefilled user IDs in metadata so the submission handler can
    // fall back to them if the user never interacts with the multi-select
    // (initial_users alone isn't reflected in view.state.values at submit time)
    const updatedMeta = JSON.stringify({
      ...meta,
      prefilled_user_ids: initialUserIds ?? [],
      checked_box: checked ? "mayden" : null,
    });

    await client.views.update({
      view_id: view.id,
      view: {
        type: "modal",
        callback_id: "nag_modal",
        title: { type: "plain_text", text: "🔔 Send a Nag", emoji: true },
        submit: { type: "plain_text", text: "Send Nag", emoji: true },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: updatedMeta,
        blocks: buildModalBlocks(nagType, groupOptions, initialUserIds, currentGroupSelections, checked ? "mayden" : null),
      },
    });
  },
).addBlockActionsHandler(
  "nag_channel_select",
  async ({ action, body, client }) => {
    const checked = (
      action as { selected_options: { value: string }[] }
    ).selected_options.some((o) => o.value === "nag_channel");

    const view = body.view as {
      id: string;
      private_metadata: string;
      state: { values: Record<string, Record<string, { selected_option?: { value: string }; selected_options?: SelectOption[]; selected_users?: string[] }>> };
    };
    const meta = JSON.parse(view.private_metadata);
    const nagType =
      view.state.values.nag_type_block?.nag_type_select?.selected_option
        ?.value ?? "standard";

    const groupOptions = await fetchGroupOptions(client);
    const currentGroupSelections: SelectOption[] =
      view.state.values.groups_block?.groups_select?.selected_options ?? [];

    let initialUserIds: string[] | undefined;
    if (checked) {
      // Fetch all members of the channel the command was called from
      let allMembers: string[] = [];
      let cursor: string | undefined;
      do {
        const membersResponse = await client.conversations.members({
          channel: meta.channel,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (membersResponse.error) break;
        allMembers = allMembers.concat(
          (membersResponse.members as string[]) ?? [],
        );
        cursor = membersResponse.response_metadata?.next_cursor || undefined;
      } while (cursor);

      initialUserIds = allMembers;
    }

    const updatedMeta = JSON.stringify({
      ...meta,
      prefilled_user_ids: initialUserIds ?? [],
      checked_box: checked ? "channel" : null,
    });

    await client.views.update({
      view_id: view.id,
      view: {
        type: "modal",
        callback_id: "nag_modal",
        title: { type: "plain_text", text: "🔔 Send a Nag", emoji: true },
        submit: { type: "plain_text", text: "Send Nag", emoji: true },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: updatedMeta,
        blocks: buildModalBlocks(nagType, groupOptions, initialUserIds, currentGroupSelections, checked ? "channel" : null),
      },
    });
  },
).addBlockActionsHandler(
  "nag_type_select",
  async ({ action, body, client }) => {
    const selectedType =
      (action as { selected_option: { value: string } }).selected_option
        .value;
    const view = body.view as {
      id: string;
      private_metadata: string;
      state: { values: Record<string, Record<string, { selected_options?: SelectOption[]; selected_users?: string[] }>> };
    };

    const meta = JSON.parse(view.private_metadata);

    // Preserve any users/groups already selected
    const currentUserIds: string[] =
      view.state.values.users_block?.users_select?.selected_users ?? [];
    const currentGroupSelections: SelectOption[] =
      view.state.values.groups_block?.groups_select?.selected_options ?? [];

    // Preserve which "everyone" checkbox was active
    const maydenChecked = (view.state.values.nag_everyone_block?.nag_everyone_select?.selected_options ?? []).length > 0;
    const channelChecked = (view.state.values.nag_everyone_block?.nag_channel_select?.selected_options ?? []).length > 0;
    const checkedBox: "mayden" | "channel" | null = maydenChecked ? "mayden" : channelChecked ? "channel" : null;

    // Re-fetch group options so the rebuilt modal has the full picker list
    const groupOptions = await fetchGroupOptions(client);

    await client.views.update({
      view_id: view.id,
      view: {
        type: "modal",
        callback_id: "nag_modal",
        title: { type: "plain_text", text: "🔔 Send a Nag", emoji: true },
        submit: { type: "plain_text", text: "Send Nag", emoji: true },
        close: { type: "plain_text", text: "Cancel" },
        private_metadata: view.private_metadata,
        blocks: buildModalBlocks(
          selectedType,
          groupOptions,
          currentUserIds.length ? currentUserIds : undefined,
          currentGroupSelections.length ? currentGroupSelections : undefined,
          checkedBox,
        ),
      },
    });
  },
).addViewSubmissionHandler("nag_modal", async ({ view, client }) => {
  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata);
  const { channel, nagged_by } = meta;

  // Read people from multi_users_select; fall back to prefilled_user_ids if the user
  // never touched the element after checking "Pre-fill everyone"
  const pickedUserIds: string[] =
    values.users_block?.users_select?.selected_users ?? [];
  const userIds: string[] = pickedUserIds.length > 0
    ? pickedUserIds
    : (meta.prefilled_user_ids ?? []);

  // Read usergroups from the separate groups picker and expand to member IDs
  const selectedGroupOptions: SelectOption[] =
    values.groups_block?.groups_select?.selected_options ?? [];
  const groupIds: string[] = selectedGroupOptions.map((o: SelectOption) =>
    o.value.startsWith("group_") ? o.value.slice(6) : o.value
  );

  // Expand usergroups to their members and deduplicate
  for (const gid of groupIds) {
    const ugUsersRes = await client.usergroups.users.list({ usergroup: gid });
    const members: string[] = (ugUsersRes as { users?: string[] }).users ?? [];
    for (const uid of members) {
      if (!userIds.includes(uid)) userIds.push(uid);
    }
  }

  const selectedUsers = userIds;

  // rich_text_input returns a rich_text block; convert it to mrkdwn
  // deno-lint-ignore no-explicit-any
  const richValue = (values.message_block?.message_input as any)?.rich_text_value;
  const message: string = richValue ? richTextToMrkdwn(richValue) : ((values.message_block?.message_input as any)?.value ?? "");

  const nagType: string =
    values.nag_type_block?.nag_type_select?.selected_option?.value ??
    "standard";

  const deadlineStr: string | undefined =
    values.deadline_block?.deadline_input?.selected_date;

  const daysBeforeStr: string | undefined =
    values.days_before_block?.days_before_input?.value;

  // Validate deadline is provided and is not in the past
  if (nagType === "do_by_deadline") {
    if (!deadlineStr) {
      return {
        response_action: "errors",
        errors: {
          deadline_block: "Please set a deadline for a 'Do By Deadline' nag.",
        },
      };
    }

    const deadlineDate = new Date(deadlineStr + "T00:00:00Z");
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (deadlineDate < todayUtc) {
      return {
        response_action: "errors",
        errors: {
          deadline_block: "Deadline must be today or in the future.",
        },
      };
    }
  }

  if (!selectedUsers.length || !message) {
    return {
      response_action: "errors",
      errors: {
        users_block:
          "Please select at least one person.",
      },
    };
  }

  // Ensure the bot is in the nag-bot channel
  await client.conversations.join({ channel: NAG_BOT_CHANNEL_ID }).catch(
    () => {},
  );

  // Invite any selected users who are not yet members of the nag-bot channel
  let nagBotMembers: string[] = [];
  let nbCursor: string | undefined;
  do {
    const mRes = await client.conversations.members({
      channel: NAG_BOT_CHANNEL_ID,
      limit: 200,
      ...(nbCursor ? { cursor: nbCursor } : {}),
    });
    if (!mRes.error) {
      nagBotMembers = nagBotMembers.concat(
        (mRes.members as string[]) ?? [],
      );
    }
    nbCursor = mRes.response_metadata?.next_cursor || undefined;
  } while (nbCursor);

  const usersToInvite = selectedUsers.filter(
    (uid: string) => !nagBotMembers.includes(uid),
  );
  if (usersToInvite.length > 0) {
    await client.conversations.invite({
      channel: NAG_BOT_CHANNEL_ID,
      users: usersToInvite.join(","),
    }).catch(() => {});
  }

  // Build the nag message
  const mentions = selectedUsers.map((uid: string) => `<@${uid}>`).join(" ");
  const fullMessage = `${mentions}\n\n${message}\n\n_Please react to this message (e.g. ✅) once you're done!_`;

  // Nag messages always go to the nag-bot channel
  const postResponse = await client.chat.postMessage({
    channel: NAG_BOT_CHANNEL_ID,
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

  // Bot reacts first so the ✅ reaction is primed for everyone else
  await client.reactions.add({
    channel: NAG_BOT_CHANNEL_ID,
    timestamp: postResponse.ts as string,
    name: "white_check_mark",
  }).catch(() => {});

  const nagId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // Convert deadline date string ("YYYY-MM-DD") to a unix timestamp (midnight UTC)
  const deadline = deadlineStr
    ? Math.floor(new Date(deadlineStr + "T00:00:00Z").getTime() / 1000)
    : undefined;

  const daysBeforeParsed = daysBeforeStr ? parseInt(daysBeforeStr, 10) : NaN;
  const daysBefore =
    !isNaN(daysBeforeParsed) && daysBeforeParsed > 0
      ? daysBeforeParsed
      : undefined;

  // Save nag to datastore
  await client.apps.datastore.put({
    datastore: "nags",
    item: {
      id: nagId,
      channel_id: NAG_BOT_CHANNEL_ID,
      message_ts: postResponse.ts as string,
      nagged_by,
      nagged_users: JSON.stringify(selectedUsers),
      message,
      created_at: now,
      nag_type: nagType,
      ...(deadline !== undefined ? { deadline } : {}),
      ...(daysBefore !== undefined ? { days_before: daysBefore } : {}),
      is_cancelled: false,
    },
  });

  // Increment nag counts for each nagged user
  for (const uid of selectedUsers) {
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

  // Complete the function
  await client.functions.completeSuccess({
    function_execution_id: view.private_metadata,
    outputs: {},
  });

  return { response_action: "clear" };
});
