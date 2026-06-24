import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// One record per user — accumulates their total leaderboard points across all nags
export default DefineDatastore({
  name: "reaction_points",
  primary_key: "user_id",
  attributes: {
    user_id: { type: Schema.slack.types.user_id },
    total_points: { type: Schema.types.integer },
    last_awarded: { type: Schema.types.integer }, // unix timestamp
  },
});
