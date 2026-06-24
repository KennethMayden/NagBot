import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { NagCompletionCheckFunctionDefinition } from "../functions/nag_completion_check_function.ts";

const NagCompletionCheckWorkflow = DefineWorkflow({
  callback_id: "nag_completion_check_workflow",
  title: "Nag Completion Check",
  description:
    "Hourly check: detects completed nags, cleans them up, and DMs the nagger",
  input_parameters: { properties: {}, required: [] },
});

NagCompletionCheckWorkflow.addStep(NagCompletionCheckFunctionDefinition, {});

export default NagCompletionCheckWorkflow;
