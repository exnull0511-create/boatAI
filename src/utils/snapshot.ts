import fs from "fs";
import path from "path";
import crypto from "crypto";

export async function saveSnapshotIfEnabled(html: string, url: string, tag: string) {
  if (process.env.SCRAPER_SNAPSHOT !== "1") return;
  const dir = path.resolve("data/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash("sha1").update(url + "|" + Date.now()).digest("hex");
  fs.writeFileSync(path.join(dir, `${tag}-${hash}.html`), html || "", "utf8");
}




