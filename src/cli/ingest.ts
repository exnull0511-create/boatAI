import { fetchRaceListAndUpsert } from "../services/racelist";

const get = (k: string, d?: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=", 2)[1] ?? d;

(async () => {
  const date = get("date")!;
  const jcd = get("jcd")!;
  const rno = Number(get("rno", "1"));
  const out = await fetchRaceListAndUpsert({ date, jcd, rno });
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});




