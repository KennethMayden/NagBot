import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// Single-record datastore — stores the ts of the pinned leaderboard message
// so it can be updated in-place. Always uses id = "leaderboard".
export default DefineDatastore({
  name: "leaderboard_config",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    message_ts: { type: Schema.types.string },
    channel_id: { type: Schema.slack.types.channel_id },
  },
});
