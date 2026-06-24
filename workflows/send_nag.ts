import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SendNagFunctionDefinition } from "../functions/send_nag_function.ts";

const SendNagWorkflow = DefineWorkflow({
  callback_id: "send_nag_workflow",
  title: "Send a Nag",
  description: "Opens a form to nag people in a channel",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["interactivity", "channel", "user_id"],
  },
});

SendNagWorkflow.addStep(SendNagFunctionDefinition, {
  interactivity: SendNagWorkflow.inputs.interactivity,
  channel: SendNagWorkflow.inputs.channel,
  nagged_by: SendNagWorkflow.inputs.user_id,
});

export default SendNagWorkflow;
