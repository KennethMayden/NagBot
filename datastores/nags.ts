import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// Stores every nag that gets sent, so we can check reactions later
export default DefineDatastore({
  name: "nags",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    channel_id: { type: Schema.slack.types.channel_id },
    message_ts: { type: Schema.types.string },
    nagged_by: { type: Schema.slack.types.user_id },
    nagged_users: { type: Schema.types.string }, // JSON-encoded array of user IDs
    message: { type: Schema.types.string },
    created_at: { type: Schema.types.integer },
    nag_type: { type: Schema.types.string }, // "standard" | "do_now" | "do_by_deadline"
    deadline: { type: Schema.types.integer }, // unix timestamp; for do_by_deadline nags
    days_before: { type: Schema.types.integer }, // days before deadline to begin daily nags
    is_cancelled: { type: Schema.types.boolean }, // true stops further automatic re-nags
    reminder_timestamps: { type: Schema.types.string }, // JSON-encoded array of reminder message timestamps
    reacted_users: { type: Schema.types.string }, // JSON-encoded array of user IDs already awarded points for this nag
  },
});
