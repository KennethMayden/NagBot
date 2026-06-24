import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { NagStatsFunctionDefinition } from "../functions/nag_stats_function.ts";

const NagStatsWorkflow = DefineWorkflow({
  callback_id: "nag_stats_workflow",
  title: "Nag Stats",
  description: "View the nag leaderboard",
  input_parameters: {
    properties: {
      channel: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel", "user_id"],
  },
});

NagStatsWorkflow.addStep(NagStatsFunctionDefinition, {
  channel: NagStatsWorkflow.inputs.channel,
  requester: NagStatsWorkflow.inputs.user_id,
});

export default NagStatsWorkflow;
