import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ReactionPointsFunctionDefinition } from "../functions/reaction_points_function.ts";

const ReactionAddedWorkflow = DefineWorkflow({
  callback_id: "reaction_added_workflow",
  title: "Reaction Added",
  description: "Award leaderboard points when someone reacts to a nag",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      message_ts: { type: Schema.types.string },
      reactor: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "message_ts", "reactor"],
  },
});

ReactionAddedWorkflow.addStep(ReactionPointsFunctionDefinition, {
  channel_id: ReactionAddedWorkflow.inputs.channel_id,
  message_ts: ReactionAddedWorkflow.inputs.message_ts,
  reactor: ReactionAddedWorkflow.inputs.reactor,
});

export default ReactionAddedWorkflow;
