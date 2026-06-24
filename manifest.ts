import { Manifest } from "deno-slack-sdk/mod.ts";

import NagsDatastore from "./datastores/nags.ts";
import NagCountsDatastore from "./datastores/nag_counts.ts";

import SendNagWorkflow from "./workflows/send_nag.ts";
import CheckNagWorkflow from "./workflows/check_nag.ts";
import NagStatsWorkflow from "./workflows/nag_stats.ts";
import RecurringNagWorkflow from "./workflows/recurring_nag.ts";

export default Manifest({
  name: "Nag Bot",
  description: "Nag people, track reactions, and follow up on slackers 🔔",
  icon: "assets/icon.png",
  datastores: [NagsDatastore, NagCountsDatastore],
  workflows: [SendNagWorkflow, CheckNagWorkflow, NagStatsWorkflow, RecurringNagWorkflow],
  outgoingDomains: [],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "reactions:read",
    "users:read",
    "datastore:read",
    "datastore:write",
    "channels:read",
    "channels:join",
    "groups:read",
  ],
});
