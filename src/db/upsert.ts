import { db } from "./index";

export function upsertRace(meta: {
  race_id: string;
  date: string;
  track: string;
  number: number;
  scheduled_at: string | null;
}) {
  db.prepare(
    `INSERT INTO races (race_id,date,track,number,scheduled_at)
  VALUES (@race_id,@date,@track,@number,@scheduled_at)
  ON CONFLICT(race_id) DO UPDATE SET date=excluded.date,track=excluded.track,number=excluded.number,scheduled_at=excluded.scheduled_at`
  ).run(meta);
}

export function upsertEntries(race_id: string, entries: any[]) {
  const stmt = db.prepare(
    `INSERT INTO entries
  (race_id,lane,reg_id,player,grade,age,national_win,local_win,avg_st,motor_no,motor_rate,boat_no,boat_rate,weight,tilt,style,past_in)
  VALUES (@race_id,@lane,@reg_id,@player,@grade,@age,@national_win,@local_win,@avg_st,@motor_no,@motor_rate,@boat_no,@boat_rate,@weight,@tilt,@style,@past_in)
  ON CONFLICT(race_id,lane) DO UPDATE SET
  reg_id=excluded.reg_id,player=excluded.player,grade=excluded.grade,age=excluded.age,
  national_win=excluded.national_win,local_win=excluded.local_win,avg_st=excluded.avg_st,
  motor_no=excluded.motor_no,motor_rate=excluded.motor_rate,boat_no=excluded.boat_no,boat_rate=excluded.boat_rate,
  weight=excluded.weight,tilt=excluded.tilt,style=excluded.style,past_in=excluded.past_in`
  );
  const t = db.transaction((rows: any[]) => {
    for (const e of rows) stmt.run({ race_id, ...e });
  });
  t(entries);
}




