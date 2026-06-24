// triggers/reaction_added.ts
// Run: slack triggers create --trigger-def triggers/reaction_added.ts

import { Trigger } from "deno-slack-api/types.ts";
import ReactionAddedWorkflow from "../workflows/reaction_added.ts";

// Only listen for reactions in the nag-bot channel
const NAG_BOT_CHANNEL_ID = "C0BDN88PS00";

const ReactionAddedTrigger: Trigger<typeof ReactionAddedWorkflow.definition> = {
  type: "event",
  name: "Reaction Added — Points",
  description: "Award leaderboard points when someone reacts to a nag message",
  workflow: `#/workflows/${ReactionAddedWorkflow.definition.callback_id}`,
  event: {
    event_type: "slack#/events/reaction_added",
    channel_ids: [NAG_BOT_CHANNEL_ID],
  },
  inputs: {
    channel_id: { value: "{{data.message_context.channel_id}}" },
    message_ts: { value: "{{data.message_context.message_ts}}" },
    reactor: { value: "{{data.user_id}}" },
  },
};

export default ReactionAddedTrigger;
