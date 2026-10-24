// TRACK A owns this file.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("daily check-in calls", { minutes: 5 }, internal.calls.runDueCheckins, {});

export default crons;
