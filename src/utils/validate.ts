import { ZodSchema } from "zod";
import { logger } from "./logger";

export function safeParseOrWarn<T>(schema: ZodSchema<T>, data: any, ctx: { where: string; id?: string }) {
  const res = schema.safeParse(data);
  if (!res.success) {
    logger.warn({ code: "ZOD_WARN", where: ctx.where, id: ctx.id, issues: res.error.issues }, "zod warn");
    return data as T;
  }
  return res.data;
}




