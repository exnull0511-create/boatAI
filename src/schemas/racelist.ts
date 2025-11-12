import { z } from "zod";

export const EntrySchema = z.object({
  lane: z.number().int().min(1).max(6),
  reg_id: z.number().int().nullable(),
  player: z.string().nullable(),
  grade: z.string().nullable(),
  age: z.number().int().nullable(),
  national_win: z.number().nullable(),
  local_win: z.number().nullable(),
  avg_st: z.number().nullable(),
  motor_no: z.number().int().nullable(),
  motor_rate: z.number().nullable(),
  boat_no: z.number().int().nullable(),
  boat_rate: z.number().nullable(),
  weight: z.number().nullable(),
  tilt: z.number().nullable(),
  style: z.string().nullable(),
  past_in: z.string().nullable()
});

export const RacelistSchema = z.object({
  race_id: z.string().min(1),
  date: z.string().min(8),
  track: z.string().min(1),
  number: z.number().int().min(1).max(12),
  scheduled_at: z.string().nullable(),
  entries: z.array(EntrySchema).length(6)
});

export type TRacelist = z.infer<typeof RacelistSchema>;




