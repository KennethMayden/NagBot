import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// One record per user, accumulates their total nag count
export default DefineDatastore({
  name: "nag_counts",
  primary_key: "user_id",
  attributes: {
    user_id: { type: Schema.slack.types.user_id },
    total_nags: { type: Schema.types.integer },
    last_nagged: { type: Schema.types.integer }, // unix timestamp
  },
});
