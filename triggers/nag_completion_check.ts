// triggers/nag_completion_check.ts
// Run: slack triggers create --trigger-def triggers/nag_completion_check.ts

import { Trigger } from "deno-slack-api/types.ts";
import NagCompletionCheckWorkflow from "../workflows/nag_completion_check.ts";

const NagCompletionCheckTrigger: Trigger<
  typeof NagCompletionCheckWorkflow.definition
> = {
  type: "scheduled",
  name: "Nag Completion Check",
  description:
    "Runs hourly to detect completed nags, remove them, and notify naggers",
  workflow: `#/workflows/${NagCompletionCheckWorkflow.definition.callback_id}`,
  schedule: {
    start_time: "2026-06-25T00:00:00Z",
    frequency: { type: "hourly" },
  },
  inputs: {},
};

export default NagCompletionCheckTrigger;
