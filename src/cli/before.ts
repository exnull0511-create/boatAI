// src/cli/before.ts
import { fetchBeforeInfo } from "../scrape/before";
import { buildRaceId } from "../utils/raceid";

const get = (k: string, d?: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=", 2)[1] ?? d;

(async () => {
  const date = get("date");
  const jcd = get("jcd");
  const rno = Number(get("rno", "1"));

  if (!date || !jcd) {
    console.error("Usage: pnpm before --date=YYYYMMDD --jcd=TT --rno=R");
    process.exit(1);
  }

  const race_id = buildRaceId(date, jcd, rno);
  const out = await fetchBeforeInfo({ date, jcd, rno, race_id });
  console.log(JSON.stringify({ race_id, ...out }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
