import "dotenv/config";
import { Bot, Context, type SessionFlavor } from "grammy";
import Redis from "ioredis";
import pino from "pino";
import type { SessionData } from "./types/session.js";
export declare const log: pino.Logger<never, boolean>;
export declare const db: Database.Database;
export declare const redis: Redis;
export type DeusContext = Context & SessionFlavor<SessionData>;
export declare const bot: Bot<DeusContext, import("grammy").Api<import("grammy").RawApi>>;
//# sourceMappingURL=index.d.ts.map