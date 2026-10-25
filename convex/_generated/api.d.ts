/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as appointments from "../appointments.js";
import type * as briefs from "../briefs.js";
import type * as calls from "../calls.js";
import type * as cartesia from "../cartesia.js";
import type * as chat from "../chat.js";
import type * as claude from "../claude.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as elastic from "../elastic.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as interpreter from "../interpreter.js";
import type * as lib_time from "../lib/time.js";
import type * as medications from "../medications.js";
import type * as notifications from "../notifications.js";
import type * as patients from "../patients.js";
import type * as pipeline from "../pipeline.js";
import type * as questions from "../questions.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  appointments: typeof appointments;
  briefs: typeof briefs;
  calls: typeof calls;
  cartesia: typeof cartesia;
  chat: typeof chat;
  claude: typeof claude;
  crons: typeof crons;
  dashboard: typeof dashboard;
  elastic: typeof elastic;
  health: typeof health;
  http: typeof http;
  interpreter: typeof interpreter;
  "lib/time": typeof lib_time;
  medications: typeof medications;
  notifications: typeof notifications;
  patients: typeof patients;
  pipeline: typeof pipeline;
  questions: typeof questions;
  seed: typeof seed;
  tasks: typeof tasks;
  visits: typeof visits;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
