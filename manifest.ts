import CheckNagWorkflow from "./workflows/check_nag.ts";
import { Manifest } from "deno-slack-sdk/mod.ts";
import NagCountsDatastore from "./datastores/nag_counts.ts";
import NagStatsWorkflow from "./workflows/nag_stats.ts";
import NagsDatastore from "./datastores/nags.ts";
import RecurringNagWorkflow from "./workflows/recurring_nag.ts";
import SendNagWorkflow from "./workflows/send_nag.ts";
import NagCompletionCheckWorkflow from "./workflows/nag_completion_check.ts";

export default Manifest({
  name: "Nag Bot",
  description: "Nag people, track reactions, and follow up on slackers 🔔",
  icon: "assets/icon.png",
  datastores: [NagsDatastore, NagCountsDatastore],
  workflows: [
    SendNagWorkflow,
    CheckNagWorkflow,
    NagStatsWorkflow,
    RecurringNagWorkflow,
    NagCompletionCheckWorkflow,
  ],
  outgoingDomains: [],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "reactions:read",
    "reactions:write",
    "users:read",
    "datastore:read",
    "datastore:write",
    "channels:read",
    "channels:join",
    "channels:manage",
    "groups:read",
    "groups:write",
    "im:write",
  ],
});
