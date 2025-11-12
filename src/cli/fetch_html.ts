import axios from "axios";
import fs from "fs";
import path from "path";

const get = (k: string, d?: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=", 2)[1] ?? d;

(async () => {
  const date = get("date", "20251030")!;
  const jcd = get("jcd", "01")!;
  const rno = Number(get("rno", "1"));
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?hd=${date}&jcd=${jcd}&rno=${rno}`;
  
  console.log(`Fetching: ${url}`);
  const res = await axios.get(url, { headers: { "User-Agent": process.env.USER_AGENT || "Mozilla/5.0" } });
  const html = res.data as string;
  
  const outputPath = path.resolve(`data/snapshots/racelist-${date}-${jcd}-r${rno}.html`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  
  console.log(`Saved to: ${outputPath}`);
  console.log(`HTML length: ${html.length} bytes`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

