// triggers/clear_leaderboard.ts
// Run: slack triggers create --trigger-def triggers/clear_leaderboard.ts

import { Trigger } from "deno-slack-api/types.ts";
import ClearLeaderboardWorkflow from "../workflows/clear_leaderboard.ts";

const ClearLeaderboardTrigger: Trigger<
  typeof ClearLeaderboardWorkflow.definition
> = {
  type: "shortcut",
  name: "Clear Leaderboard",
  description: "Reset all reaction speed points to zero",
  workflow:
    `#/workflows/${ClearLeaderboardWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: "{{data.interactivity}}" },
    channel: { value: "{{data.channel_id}}" },
    user_id: { value: "{{data.user_id}}" },
  },
};

export default ClearLeaderboardTrigger;
