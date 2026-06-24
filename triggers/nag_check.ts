// triggers/nag_check.ts
// Run: slack triggers create --trigger-def triggers/nag_check.ts

import { Trigger } from "deno-slack-api/types.ts";
import CheckNagWorkflow from "../workflows/check_nag.ts";

const NagCheckTrigger: Trigger<typeof CheckNagWorkflow.definition> = {
  type: "shortcut",
  name: "Check Nag Reactions",
  description: "See who hasn't reacted yet and re-nag them",
  workflow: `#/workflows/${CheckNagWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: "{{data.interactivity}}" },
    channel: { value: "{{data.channel_id}}" },
    user_id: { value: "{{data.user_id}}" },
  },
};

export default NagCheckTrigger;
