import axios from "axios";
import { load } from "cheerio";
import { normalizeText, toNumber } from "../utils/normalize";
import { db } from "../db";

export async function fetchBeforeInfo(params:{date:string;jcd:string;rno:number,race_id:string}) {
  const url = `https://www.boatrace.jp/owpc/pc/race/beforeinfo?hd=${params.date}&jcd=${params.jcd}&rno=${params.rno}`;
  const res = await axios.get(url,{headers:{"User-Agent":process.env.USER_AGENT||"Mozilla/5.0"}});
  const $ = load(res.data as string);

  const exhibitions = [];
  const lanes = [1,2,3,4,5,6];

  for (const lane of lanes) {
    const tenji = toNumber($(`.table1 .tb${lane} .taR`).eq(0).text());
    const weight = toNumber($(`.table1 .tb${lane} .taR`).eq(1).text());
    const tilt = toNumber($(`.table1 .tb${lane} .taR`).eq(2).text());

    exhibitions.push({
      race_id: params.race_id,
      lane,
      tenji_time: tenji,
      weight,
      tilt,
    });
  }

  const weather = normalizeText($(".weather1 .weather").text());
  const windDir = normalizeText($(".weather1 .direction").text());
  const wind = toNumber($(".weather1 .wind span").text());
  const wave = toNumber($(".weather1 .wave span").text());

  const condStmt = db.prepare(`
    INSERT INTO conditions (race_id,weather,wind_dir,wind_ms,wave)
    VALUES (@race_id,@weather,@wind_dir,@wind_ms,@wave)
    ON CONFLICT(race_id) DO UPDATE SET
      weather=excluded.weather,
      wind_dir=excluded.wind_dir,
      wind_ms=excluded.wind_ms,
      wave=excluded.wave
  `);

  const exStmt = db.prepare(`
    INSERT INTO exhibitions (race_id,lane,tenji_time,weight,tilt)
    VALUES (@race_id,@lane,@tenji_time,@weight,@tilt)
    ON CONFLICT(race_id,lane) DO UPDATE SET
      tenji_time=excluded.tenji_time,
      weight=excluded.weight,
      tilt=excluded.tilt
  `);

  const tx = db.transaction(()=>{
    for(const ex of exhibitions) exStmt.run(ex);
    condStmt.run({race_id:params.race_id,weather,wave,wind_ms:wind,wind_dir:windDir});
  });
  tx();

  return { exhibitions, weather, wind, wave };
}
