// triggers/nag_stats.ts
// Run: slack triggers create --trigger-def triggers/nag_stats.ts

import { Trigger } from "deno-slack-api/types.ts";
import NagStatsWorkflow from "../workflows/nag_stats.ts";

const NagStatsTrigger: Trigger<typeof NagStatsWorkflow.definition> = {
  type: "shortcut",
  name: "Nag Stats",
  description: "View the nag leaderboard — most and least nagged",
  workflow: `#/workflows/${NagStatsWorkflow.definition.callback_id}`,
  inputs: {
    channel: { value: "{{data.channel_id}}" },
    user_id: { value: "{{data.user_id}}" },
  },
};

export default NagStatsTrigger;
