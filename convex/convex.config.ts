// SHARED (Dev A approves). Convex components mounted in this app.
import workflow from "@convex-dev/workflow/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(workflow); // durable post-call pipeline (convex/pipeline.ts)
export default app;
