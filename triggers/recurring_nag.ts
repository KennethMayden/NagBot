// triggers/recurring_nag.ts
// Creates a scheduled trigger that fires daily at 08:00 UTC.
// Run: slack triggers create --trigger-def triggers/recurring_nag.ts

import { Trigger } from "deno-slack-api/types.ts";
import RecurringNagWorkflow from "../workflows/recurring_nag.ts";

const RecurringNagTrigger: Trigger<typeof RecurringNagWorkflow.definition> = {
  type: "scheduled",
  name: "Daily Recurring Nag Check",
  description:
    "Fires at 08:00 UTC every day to re-nag pending users on active recurring nags",
  workflow: `#/workflows/${RecurringNagWorkflow.definition.callback_id}`,
  schedule: {
    // start_time must be a future UTC datetime; update if this is in the past
    start_time: new Date(new Date().getTime() + 60000).toISOString(),
    frequency: {
      type: "hourly",
    },
  },
  inputs: {},
};

export default RecurringNagTrigger;
