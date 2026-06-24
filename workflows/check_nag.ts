import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { CheckNagFunctionDefinition } from "../functions/check_nag_function.ts";

const CheckNagWorkflow = DefineWorkflow({
  callback_id: "check_nag_workflow",
  title: "Check Nag Reactions",
  description: "See who hasn't reacted to your nags yet, and re-nag them",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["interactivity", "channel", "user_id"],
  },
});

CheckNagWorkflow.addStep(CheckNagFunctionDefinition, {
  interactivity: CheckNagWorkflow.inputs.interactivity,
  channel: CheckNagWorkflow.inputs.channel,
  checker: CheckNagWorkflow.inputs.user_id,
});

export default CheckNagWorkflow;
