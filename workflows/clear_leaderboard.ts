import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ClearLeaderboardFunctionDefinition } from "../functions/clear_leaderboard_function.ts";

const ClearLeaderboardWorkflow = DefineWorkflow({
  callback_id: "clear_leaderboard_workflow",
  title: "Clear Leaderboard",
  description: "Reset all reaction speed points to zero",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["interactivity", "channel", "user_id"],
  },
});

ClearLeaderboardWorkflow.addStep(ClearLeaderboardFunctionDefinition, {
  interactivity: ClearLeaderboardWorkflow.inputs.interactivity,
  channel: ClearLeaderboardWorkflow.inputs.channel,
  user_id: ClearLeaderboardWorkflow.inputs.user_id,
});

export default ClearLeaderboardWorkflow;
