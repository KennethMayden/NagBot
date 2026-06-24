// triggers/nag.ts
// Run: slack triggers create --trigger-def triggers/nag.ts

import { Trigger } from "deno-slack-api/types.ts";
import SendNagWorkflow from "../workflows/send_nag.ts";

const NagTrigger: Trigger<typeof SendNagWorkflow.definition> = {
  type: "shortcut",
  name: "Send a Nag",
  description: "Open a form to nag people and ask them to react",
  workflow: `#/workflows/${SendNagWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: "{{data.interactivity}}" },
    channel: { value: "{{data.channel_id}}" },
    user_id: { value: "{{data.user_id}}" },
  },
};

export default NagTrigger;
