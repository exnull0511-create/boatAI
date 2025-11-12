import { saveSnapshotIfEnabled } from "../utils/snapshot";

const get = (k: string, d?: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=", 2)[1] ?? d;

(async () => {
  const tag = get("tag", "manual")!;
  const url = get("url", "about:blank")!;
  const html = get("html", "<html></html>")!;
  await saveSnapshotIfEnabled(html, url, tag);
  console.log("snapshot saved (if SCRAPER_SNAPSHOT=1)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});




