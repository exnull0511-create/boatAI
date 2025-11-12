import { db } from "../db";
import { upsertRace, upsertEntries } from "../db/upsert";
import { buildRaceId } from "../utils/raceid";
import { safeParseOrWarn } from "../utils/validate";
import { RacelistSchema } from "../schemas/racelist";
import { fetchRaceListRaw } from "../scrape/entries";

export async function fetchRaceListAndUpsert(params: { date: string; jcd: string; rno: number }) {
  const raw = await fetchRaceListRaw(params);
  const race_id = buildRaceId(params.date, params.jcd, params.rno);
  const obj = safeParseOrWarn(RacelistSchema, { race_id, ...raw }, { where: "racelist", id: race_id });
  db.exec("BEGIN");
  try {
    upsertRace({ race_id, date: obj.date, track: obj.track, number: obj.number, scheduled_at: obj.scheduled_at });
    upsertEntries(race_id, obj.entries);
    db.exec("COMMIT");
    return { race_id, entries: obj.entries };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}




