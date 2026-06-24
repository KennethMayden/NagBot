import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

type SelectOption = { text: { type: "plain_text"; text: string }; value: string };
type OptionGroup = { label: { type: "plain_text"; text: string }; options: SelectOption[] };

// All nag @mentions are always posted here
const NAG_BOT_CHANNEL_ID = "C0BDN88PS00";
// Source channel for "Nag everyone" — pulls all members from here
const Q1_NAG_CHANNEL_ID = "C0BB9SDDYDR";
// switch to general channel id when we do live demo
// const GENERAL_CHANNEL_ID = "C02FQJL1Z";

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

// Fetches all active usergroups and non-bot users, returns option_groups for
// the combined multi_static_select element.
// deno-lint-ignore no-explicit-any
async function fetchCombinedOptions(client: any): Promise<OptionGroup[]> {
  const groups: OptionGroup[] = [];

  // ── Usergroups ──────────────────────────────────────────────────────────────
  const ugRes = await client.usergroups.list({});
  const usergroups: { id: string; name: string; date_delete?: number }[] =
    ugRes.usergroups ?? [];
  const groupOptions: SelectOption[] = usergroups
    .filter((ug) => !ug.date_delete)
    .map((ug) => ({
      text: { type: "plain_text" as const, text: `👥 ${ug.name}` },
      value: `group_${ug.id}`,
    }));
  if (groupOptions.length > 0) {
    groups.push({ label: { type: "plain_text", text: "User Groups" }, options: groupOptions });
  }

  // ── Individual users ─────────────────────────────────────────────────────────
  let allUsers: {
    id: string;
    real_name?: string;
    name?: string;
    is_bot?: boolean;
    deleted?: boolean;
  }[] = [];
  let cursor: string | undefined;
  do {
    const usersRes = await client.users.list({
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (usersRes.error) break;
    allUsers = allUsers.concat(usersRes.members ?? []);
    cursor = usersRes.response_metadata?.next_cursor || undefined;
  } while (cursor);

  const userOptions: SelectOption[] = allUsers
    .filter((u) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT")
    .map((u) => ({
      text: { type: "plain_text" as const, text: u.real_name || u.name || u.id },
      value: `user_${u.id}`,
    }));
  if (userOptions.length > 0) {
    groups.push({ label: { type: "plain_text", text: "People" }, options: userOptions });
  }

  return groups;
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

const EVERYONE_OPTION = {
  text: { type: "plain_text", text: "Everyone in this channel", emoji: true },
  value: "nag_everyone",
};

// Builds the full modal block list; conditionally includes deadline blocks and pre-filled users
function buildModalBlocks(
  nagType: string,
  options: OptionGroup[],
  initialOptions?: SelectOption[],
  everyoneChecked = false,
): unknown[] {
  const selectedOption =
    NAG_TYPE_OPTIONS.find((o) => o.value === nagType) ?? NAG_TYPE_OPTIONS[0];

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Who do you want to nag?*\n",
      },
    },
    {
      // actions block (not input) so the checkbox fires block_actions immediately on click
      type: "actions",
      block_id: "nag_everyone_block",
      elements: [
        {
          type: "checkboxes",
          action_id: "nag_everyone_select",
          options: [EVERYONE_OPTION],
          ...(everyoneChecked ? { initial_options: [EVERYONE_OPTION] } : {}),
        },
      ],
    },
    {
      type: "input",
      block_id: "users_block",
      optional: true,
      label: {
        type: "plain_text",
        text: everyoneChecked
          ? "Remove anyone you don't want to nag"
          : "Select people or user groups",
      },
      element: {
        type: "multi_static_select",
        action_id: "users_select",
        placeholder: { type: "plain_text", text: "Select people or groups…" },
        option_groups: options,
        ...(initialOptions?.length ? { initial_options: initialOptions } : {}),
      },
    },
    {
      type: "input",
      block_id: "message_block",
      label: { type: "plain_text", text: "What do you need them to do?" },
      element: {
        type: "plain_text_input",
        action_id: "message_input",
        multiline: true,
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
    // Fetch combined options (usergroups + users) for the picker
    const options = await fetchCombinedOptions(client);

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
        blocks: buildModalBlocks("standard", options),
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
      state: { values: Record<string, Record<string, { selected_option?: { value: string }; selected_options?: SelectOption[] }>> };
    };
    const meta = JSON.parse(view.private_metadata);
    const nagType =
      view.state.values.nag_type_block?.nag_type_select?.selected_option
        ?.value ?? "standard";

    // Fetch combined options (needed for re-rendering and for matching initial_options)
    const options = await fetchCombinedOptions(client);

    let initialOptions: SelectOption[] | undefined;
    if (checked) {
      // Fetch all members of the source channel
      let allMembers: string[] = [];
      let cursor: string | undefined;
      do {
        const membersResponse = await client.conversations.members({
          channel: Q1_NAG_CHANNEL_ID,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        if (membersResponse.error) break;
        allMembers = allMembers.concat(
          (membersResponse.members as string[]) ?? [],
        );
        cursor = membersResponse.response_metadata?.next_cursor || undefined;
      } while (cursor);

      // Map member IDs to the corresponding options from the fetched list
      const memberValues = new Set(allMembers.map((uid) => `user_${uid}`));
      initialOptions = options
        .flatMap((og) => og.options)
        .filter((opt) => memberValues.has(opt.value));
    }

    // Store prefilled option values in metadata so the submission handler can
    // fall back to them if the user never interacts with the multi-select
    // (initial_options alone isn't reflected in view.state.values at submit time)
    const updatedMeta = JSON.stringify({
      ...meta,
      prefilled_options: initialOptions?.map((o) => o.value) ?? [],
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
        blocks: buildModalBlocks(nagType, options, initialOptions, checked),
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
      state: { values: Record<string, Record<string, { selected_options?: SelectOption[] }>> };
    };

    // Preserve any options already selected in the multi-select
    const currentOptions: SelectOption[] =
      view.state.values.users_block?.users_select?.selected_options ?? [];

    // Re-fetch options so the rebuilt modal has the full picker list
    const options = await fetchCombinedOptions(client);

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
          options,
          currentOptions.length ? currentOptions : undefined,
        ),
      },
    });
  },
).addViewSubmissionHandler("nag_modal", async ({ view, client }) => {
  const values = view.state.values;
  const meta = JSON.parse(view.private_metadata);
  const { channel, nagged_by } = meta;

  // Use whatever is selected in the multi-select; fall back to prefilled_options
  // if the user never touched the element after checking "Pre-fill everyone"
  const rawSelected: SelectOption[] =
    values.users_block?.users_select?.selected_options ?? [];
  const selectedValues: string[] = rawSelected.length > 0
    ? rawSelected.map((o: SelectOption) => o.value)
    : (meta.prefilled_options ?? []);

  // Separate user values from usergroup values
  const userIds: string[] = [];
  const groupIds: string[] = [];
  for (const val of selectedValues) {
    if (val.startsWith("group_")) {
      groupIds.push(val.slice(6));
    } else if (val.startsWith("user_")) {
      userIds.push(val.slice(5));
    }
  }

  // Expand usergroups to their members and deduplicate
  for (const gid of groupIds) {
    const ugUsersRes = await client.usergroups.users.list({ usergroup: gid });
    const members: string[] = (ugUsersRes as { users?: string[] }).users ?? [];
    for (const uid of members) {
      if (!userIds.includes(uid)) userIds.push(uid);
    }
  }

  const selectedUsers = userIds;

  const message: string = values.message_block.message_input.value ?? "";

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
