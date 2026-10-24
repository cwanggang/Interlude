// TRACK A owns this file.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("daily check-in calls", { minutes: 5 }, internal.calls.runDueCheckins, {});

// C9/H8: a fresh pre-visit brief for every appointment in the next 24 hours, before clinic
// hours (14:00 UTC = 7 AM Pacific in summer, 6 AM in winter). "Generate brief" still works anytime.
crons.cron(
  "pre-visit briefs",
  "0 14 * * *",
  internal.elastic.generateBriefsForUpcoming,
  {},
);

export default crons;
