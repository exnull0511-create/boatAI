import { load } from "cheerio";
import fs from "fs";
import path from "path";
import { parseStrategyA, parseStrategyB } from "../scrape/entries";
import { normalizeText } from "../utils/normalize";

const get = (k: string, d?: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=", 2)[1] ?? d;

(async () => {
  const snapshotFile = get("file");
  const date = get("date", "20251030");
  const jcd = get("jcd", "01");
  const rno = Number(get("rno", "1"));

  let html: string;
  
  if (snapshotFile) {
    // Load from snapshot file
    const filePath = path.resolve(snapshotFile);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    html = fs.readFileSync(filePath, "utf8");
    console.log(`Loaded HTML from: ${filePath}`);
    console.log(`HTML length: ${html.length} bytes\n`);
  } else {
    // Try to find snapshot file
    const snapshotPath = path.resolve(`data/snapshots/racelist-${date}-${jcd}-r${rno}.html`);
    if (fs.existsSync(snapshotPath)) {
      html = fs.readFileSync(snapshotPath, "utf8");
      console.log(`Loaded HTML from snapshot: ${snapshotPath}`);
      console.log(`HTML length: ${html.length} bytes\n`);
    } else {
      console.error(`Snapshot file not found: ${snapshotPath}`);
      console.error(`Use --file=<path> to specify HTML file, or run fetch_html.ts first`);
      process.exit(1);
    }
  }

  // Parse the HTML
  const $ = load(html);

  // --- DEBUG: DOM 構造確認（追加） ---
  console.log("DEBUG: body text length:", $("body").text().length);
  console.log("DEBUG: table count:", $("table").length);
  console.log("DEBUG: thead count:", $("thead").length);
  console.log("DEBUG: tbody > tr count:", $("tbody > tr").length);
  console.log("DEBUG: .entry/.card selectors:", $(".entry").length, $(".card").length);
  const firstTable = $("table").first().html();
  if (firstTable) console.log("DEBUG: first table snippet:\n", firstTable.slice(0, 800));
  else {
    const firstCard = $(".card").first().html();
    if (firstCard) console.log("DEBUG: first card snippet:\n", firstCard.slice(0, 800));
  }
  // --- end debug ---
  
  // Extract track name
  const titleText = normalizeText($("title").text());
  const track = titleText.split("｜")[0] || titleText.split("出走表")[0] || "不明";
  
  // Extract scheduled_at
  const scheduled_at = normalizeText($(".datetime, .notice, .raceDateTime").first().text()) || null;

  // Try strategy A (table) first, then B (cards)
  let entries = parseStrategyA($);
  let strategyUsed = "A";
  if (!entries || entries.length < 6) {
    entries = parseStrategyB($);
    strategyUsed = "B";
  }

  if (!entries || entries.length === 0) {
    console.error("❌ Failed to parse any entries!");
    process.exit(1);
  }

  // Ensure all lanes 1-6 exist
  const laneMap = new Map(entries.map((e: any) => [e.lane, e]));
  const finalEntries = Array.from({ length: 6 }, (_, i) => {
    const lane = i + 1;
    return (
      laneMap.get(lane) || {
        lane,
        reg_id: null,
        player: null,
        grade: null,
        age: null,
        national_win: null,
        local_win: null,
        avg_st: null,
        motor_no: null,
        motor_rate: null,
        boat_no: null,
        boat_rate: null,
        weight: null,
        tilt: null,
        style: null,
        past_in: null
      }
    );
  });

  const result = { date, track, number: rno, scheduled_at, entries: finalEntries };

  // Test parsing
  console.log("=".repeat(80));
  console.log("PARSING TEST");
  console.log("=".repeat(80));
  
  console.log(`\nTrack: ${result.track}`);
  console.log(`Scheduled at: ${result.scheduled_at || "N/A"}`);
  console.log(`Date: ${result.date}, JCD: ${jcd}, Race: ${result.number}`);
  console.log(`Strategy used: ${strategyUsed}`);
  console.log(`\nFound ${result.entries.length} entries:\n`);
  
  // Display each entry
  result.entries.forEach((entry) => {
    console.log(`--- Lane ${entry.lane} ---`);
    console.log(`  登録番号: ${entry.reg_id ?? "NULL"}`);
    console.log(`  選手名:   ${entry.player ?? "NULL"}`);
    console.log(`  級別:     ${entry.grade ?? "NULL"}`);
    console.log(`  年齢:     ${entry.age ?? "NULL"}`);
    console.log(`  体重:     ${entry.weight ?? "NULL"} kg`);
    console.log(`  平均ST:   ${entry.avg_st ?? "NULL"}`);
    console.log(`  全国勝率: ${entry.national_win ?? "NULL"}%`);
    console.log(`  当地勝率: ${entry.local_win ?? "NULL"}%`);
    console.log(`  モーター:  No.${entry.motor_no ?? "NULL"} (2連率: ${entry.motor_rate ?? "NULL"}%)`);
    console.log(`  ボート:   No.${entry.boat_no ?? "NULL"} (2連率: ${entry.boat_rate ?? "NULL"}%)`);
    console.log(`  チルト:   ${entry.tilt ?? "NULL"}`);
    console.log("");
  });
  
  // Summary
  const nonNullCounts = {
    reg_id: result.entries.filter((e) => e.reg_id !== null).length,
    player: result.entries.filter((e) => e.player !== null).length,
    grade: result.entries.filter((e) => e.grade !== null).length,
    age: result.entries.filter((e) => e.age !== null).length,
    weight: result.entries.filter((e) => e.weight !== null).length,
    avg_st: result.entries.filter((e) => e.avg_st !== null).length,
    national_win: result.entries.filter((e) => e.national_win !== null).length,
    local_win: result.entries.filter((e) => e.local_win !== null).length,
    motor_no: result.entries.filter((e) => e.motor_no !== null).length,
    motor_rate: result.entries.filter((e) => e.motor_rate !== null).length,
    boat_no: result.entries.filter((e) => e.boat_no !== null).length,
    boat_rate: result.entries.filter((e) => e.boat_rate !== null).length,
  };
  
  console.log("=".repeat(80));
  console.log("SUMMARY (Non-null counts per field)");
  console.log("=".repeat(80));
  console.log(JSON.stringify(nonNullCounts, null, 2));
  console.log("");
  
  // Check if parsing was successful
  const allFieldsParsed = result.entries.every((e) => 
    e.reg_id !== null && 
    e.player !== null && 
    e.grade !== null && 
    e.age !== null && 
    e.weight !== null
  );
  
  if (allFieldsParsed) {
    console.log("✅ All essential fields parsed successfully!");
  } else {
    console.log("⚠️  Some fields are missing. Check the parser logic.");
  }
})().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
