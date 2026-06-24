import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { RecurringNagFunctionDefinition } from "../functions/recurring_nag_function.ts";

const RecurringNagWorkflow = DefineWorkflow({
  callback_id: "recurring_nag_workflow",
  title: "Process Recurring Nags",
  description: "Runs daily to re-nag pending users on active recurring nags",
  input_parameters: {
    properties: {},
    required: [],
  },
});

RecurringNagWorkflow.addStep(RecurringNagFunctionDefinition, {});

export default RecurringNagWorkflow;
