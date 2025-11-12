import axios from "axios";
import { load, CheerioAPI, Element } from "cheerio";
import { normalizeText, toNumber } from "../utils/normalize";
import { saveSnapshotIfEnabled } from "../utils/snapshot";
import { logger } from "../utils/logger";

const DEBUG = process.env.DEBUG_SCRAPE === "1";

export async function fetchRaceListRaw(params: { date: string; jcd: string; rno: number }) {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?hd=${params.date}&jcd=${params.jcd}&rno=${params.rno}`;
  let html = "";
  try {
    const res = await axios.get(url, { headers: { "User-Agent": process.env.USER_AGENT || "Mozilla/5.0" } });
    html = res.data as string;
    const $ = load(html);

    // Extract track name
    const titleText = normalizeText($("title").text());
    const track = titleText.split("｜")[0] || titleText.split("出走表")[0] || "不明";
    
    // Extract scheduled_at
    const scheduled_at =
      normalizeText($(".datetime, .notice, .raceDateTime").first().text()) || null;

    // Try strategy A (table) first, then B (cards)
    let entries = parseStrategyA($);
    const strategyUsed = entries && entries.length >= 3 ? "A" : null;
    if (!entries || entries.length < 6) {
      entries = parseStrategyB($);
      if (DEBUG) {
        logger.debug({ strategy: "B", foundEntries: entries?.length || 0 }, "Strategy B result");
      }
    } else {
      if (DEBUG) {
        logger.debug({ strategy: "A", foundEntries: entries.length }, "Strategy A result");
      }
    }

    // Ensure all lanes 1-6 exist
    const laneMap = new Map(entries.map((e) => [e.lane, e]));
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

    // 既に entry を作っている直後（または entry を返す直前）に挿入
    // infoText の変数名は実コードに合わせて置き換えてください（例: info, extra, detail 等）
    const infoText = (entries[0].infoText ?? entries[0].info ?? entries[0].detail ?? "").toString();

    const { nationalWinRate, localWinRate } = parseWinRates(infoText);
    entries[0].national_win = nationalWinRate;
    entries[0].local_win = localWinRate;

    return { date: params.date, track, number: params.rno, scheduled_at, entries: finalEntries };
  } catch (e) {
    await saveSnapshotIfEnabled(html, url, "racelist");
    throw e;
  }
}

// Strategy A: Table-like layout
export function parseStrategyA($: CheerioAPI): Array<any> | null {
  const tables = $("table");
  if (DEBUG) {
    logger.debug({ tableCount: tables.length }, "Strategy A: Found tables");
  }
  let bestTable: Element | null = null;
  let maxLaneCount = 0;

  // Find table with most lane numbers (1-6, including full-width)
  tables.each((_, table) => {
    const text = normalizeText($(table).text());
    // Match both half-width and full-width numbers
    const laneMatches = text.match(/[1-6\uFF11-\uFF16]/g);
    if (laneMatches) {
      const uniqueLanes = new Set(
        laneMatches.map((m) => {
          return toHalfWidthLane(m);
        })
      );
      if (DEBUG) {
        logger.debug({ uniqueLanes: Array.from(uniqueLanes), text: text.substring(0, 100) }, "Table candidate");
      }
      if (uniqueLanes.size > maxLaneCount) {
        maxLaneCount = uniqueLanes.size;
        bestTable = table;
      }
    }
  });

  if (DEBUG) {
    logger.debug({ maxLaneCount, hasBestTable: !!bestTable }, "Strategy A: Best table selection");
  }

  if (!bestTable || maxLaneCount < 3) return null;

  const $table = $(bestTable);
  // Find tbody - class may have leading space " is-fs12", so find all and filter
  const allTbody = $table.find("tbody").toArray();
  const tbodyList = allTbody.filter((tb) => {
    const $tb = $(tb);
    // Check if tbody contains boatColor cells (racer data)
    const hasBoatColor = $tb.find("td.is-boatColor1, td.is-boatColor2, td.is-boatColor3, td.is-boatColor4, td.is-boatColor5, td.is-boatColor6").length > 0;
    // Or check if it has class containing "is-fs12"
    const className = $tb.attr("class") || "";
    const hasFs12 = className.includes("is-fs12");
    return hasBoatColor || hasFs12;
  });
  const entries: Array<any> = [];

  // Each tbody contains one lane's data
  for (const tbody of tbodyList) {
    const $tbody = $(tbody);
    const firstRow = $tbody.find("tr").first();
    
    // Find lane number cell (usually first td with class containing "boatColor")
    const laneCell = firstRow.find("td.is-boatColor1, td.is-boatColor2, td.is-boatColor3, td.is-boatColor4, td.is-boatColor5, td.is-boatColor6").first();
    if (laneCell.length === 0) {
      // Try to find by text content
      const allCells = firstRow.find("td");
      let laneFound = false;
      for (const cell of allCells.toArray()) {
        const cellText = normalizeText($(cell).text());
        const laneMatch = cellText.match(/^([1-6])/);
        if (laneMatch) {
          const lane = parseInt(laneMatch[1], 10);
          if (lane >= 1 && lane <= 6) {
            const entry = extractEntryFromTbody($, tbody, lane);
            if (entry) {
              entries.push(entry);
              laneFound = true;
              break;
            }
          }
        }
      }
      if (!laneFound) continue;
    } else {
      const laneText = normalizeText(laneCell.text());
      const laneMatch = laneText.match(/^([1-6\uFF11-\uFF16])/);
      if (laneMatch) {
        const lane = parseInt(toHalfWidthLane(laneMatch[1]), 10);
        if (lane >= 1 && lane <= 6) {
          const entry = extractEntryFromTbody($, tbody, lane);
          if (entry) {
            entries.push(entry);
          }
        }
      }
    }
  }

  if (DEBUG) {
    logger.debug({ entriesCount: entries.length, lanes: entries.map((e) => e.lane) }, "Strategy A: Extracted entries");
  }
pnpm exec tsx ./src/cli/test_parse.ts --file=data/snapshots/racelist-8717d742fd94d03da30814d70523fc7024f16150.html --date=20251030 --jcd=01 --rno=1 2>&1 | Tee-Object parse.log
notepad parse.log
  return entries.length >= 3 ? entries : null;
}

// Extract entry data from a tbody element
function extractEntryFromTbody($: CheerioAPI, tbody: Element, lane: number): any | null {
  const $tbody = $(tbody);
  const firstRow = $tbody.find("tr").first();
  
  // Get all cells from first row
  const cells = firstRow.find("td").toArray();
  
  if (DEBUG) {
    logger.debug({ lane, cellCount: cells.length }, "extractEntryFromTbody: Starting");
  }
  
  // Find the cell containing racer info (登録番号/級別, 氏名, 年齢/体重)
  let racerInfoCell: any = null;
  
  for (let i = 0; i < cells.length; i++) {
    const $cell = $(cells[i]);
    const cellText = normalizeText($cell.text());
    const cellHtml = $cell.html() || "";
    
    // Check if cell contains the pattern "4128 / B1" or has div with reg_id/grade
    // Pattern: "4128\n/ B1" or "<div>4128 / <span>B1</span></div>"
    if (/\d{4}\s*\/\s*[AB]\d/.test(cellText) || 
        /<div[^>]*>\s*\d{4}\s*\/\s*<span[^>]*>[AB]\d/.test(cellHtml)) {
      racerInfoCell = cells[i];
      if (DEBUG) {
        logger.debug({ lane, cellIndex: i, cellText: cellText.substring(0, 100) }, "Found racer info cell");
      }
      break;
    }
  }
  
  if (!racerInfoCell) {
    if (DEBUG) {
      logger.debug({ lane }, "extractEntryFromTbody: No racer info cell found");
    }
    return null;
  }
  
  const racerInfoText = normalizeText($(racerInfoCell).text());
  const racerInfoHtml = $(racerInfoCell).html() || "";
  
  // Extract reg_id and grade from "4128 / B1" pattern (may have newlines)
  const regGradeMatch = racerInfoText.match(/(\d{4})\s*\/\s*([AB]\d)/);
  const reg_id = regGradeMatch ? parseInt(regGradeMatch[1], 10) : null;
  const grade = regGradeMatch ? regGradeMatch[2] : null;
  
  if (DEBUG && !regGradeMatch) {
    logger.debug({ lane, text: racerInfoText.substring(0, 100) }, "extractEntryFromTbody: No reg_id/grade match");
  }
  
  // Extract player name (usually in a link or bold text)
  const nameMatch = racerInfoHtml.match(/<a[^>]*>([^<]+)<\/a>/);
  const player = nameMatch ? normalizeText(nameMatch[1].trim()) : null;
  
  if (DEBUG && !player) {
    logger.debug({ lane, html: racerInfoHtml.substring(0, 200) }, "extractEntryFromTbody: No player name found");
  }
  
  // Extract age and weight from "45歳/54.8kg" pattern (may have <br />)
  const ageWeightMatch = racerInfoText.match(/(\d{2})歳\s*\/\s*(\d+(?:\.\d+)?)kg/);
  const age = ageWeightMatch ? parseInt(ageWeightMatch[1], 10) : null;
  const weight = ageWeightMatch ? toNumber(ageWeightMatch[2]) : null;
  
  if (DEBUG && !ageWeightMatch) {
    logger.debug({ lane, text: racerInfoText.substring(0, 200) }, "extractEntryFromTbody: No age/weight match");
  }
  
  // Find cells with rowspan="4" which contain the stats
  // Average ST cell (F数 L数 平均ST)
  let avgStCell: any = null;
  let nationalWinCell: any = null;
  let localWinCell: any = null;
  let motorCell: any = null;
  let boatCell: any = null;
  
  for (const cell of cells) {
    const $cell = $(cell);
    const cellText = normalizeText($cell.text());
    const rowspan = $cell.attr("rowspan");
    
    if (rowspan === "4") {
      // Average ST: "F0 L0 0.15" format (normalized, so newlines become spaces)
      if (/^F\d+\s+L\d+\s+0?\.\d{2}/.test(cellText)) {
        avgStCell = cell;
        if (DEBUG) {
          logger.debug({ lane, cellText: cellText.substring(0, 50) }, "Found avgStCell");
        }
      }
      // National win rate: "4.28 18.84 39.13" format (first number is win rate)
      else if (/^\d+\.\d{2}\s+\d+\.\d{2}\s+\d+\.\d{2}/.test(cellText) && avgStCell) {
        if (!nationalWinCell) {
          nationalWinCell = cell;
          if (DEBUG) {
            logger.debug({ lane, cellText: cellText.substring(0, 50) }, "Found nationalWinCell");
          }
        } else if (!localWinCell) {
          localWinCell = cell;
          if (DEBUG) {
            logger.debug({ lane, cellText: cellText.substring(0, 50) }, "Found localWinCell");
          }
        }
      }
      // Motor: "54 26.84 42.63" format (first number is motor no)
      else if (/^\d{1,3}\s+\d+\.\d{2}\s+\d+\.\d{2}/.test(cellText) && localWinCell && !motorCell) {
        motorCell = cell;
        if (DEBUG) {
          logger.debug({ lane, cellText: cellText.substring(0, 50) }, "Found motorCell");
        }
      }
      // Boat: similar to motor
      else if (/^\d{1,3}\s+\d+\.\d{2}\s+\d+\.\d{2}/.test(cellText) && motorCell && !boatCell) {
        boatCell = cell;
        if (DEBUG) {
          logger.debug({ lane, cellText: cellText.substring(0, 50) }, "Found boatCell");
        }
      }
    }
  }
  
  if (DEBUG) {
    logger.debug({ 
      lane, 
      hasAvgSt: !!avgStCell,
      hasNationalWin: !!nationalWinCell,
      hasLocalWin: !!localWinCell,
      hasMotor: !!motorCell,
      hasBoat: !!boatCell
    }, "extractEntryFromTbody: Cell detection summary");
  }
  
  // Extract values from cells
  const avg_st = avgStCell ? extractAvgStFromCell($(avgStCell).text()) : null;
  const national_win = nationalWinCell ? extractWinRateFromCell($(nationalWinCell).text(), 0) : null;
  const local_win = localWinCell ? extractWinRateFromCell($(localWinCell).text(), 0) : null;
  const motor_no = motorCell ? extractMotorNoFromCell($(motorCell).text()) : null;
  const motor_rate = motorCell ? extractRateFromCell($(motorCell).text(), 1) : null;
  const boat_no = boatCell ? extractBoatNoFromCell($(boatCell).text()) : null;
  const boat_rate = boatCell ? extractRateFromCell($(boatCell).text(), 1) : null;
  
  return {
    lane,
    reg_id,
    player,
    grade,
    age,
    national_win,
    local_win,
    avg_st,
    motor_no,
    motor_rate,
    boat_no,
    boat_rate,
    weight,
    tilt: null, // Tilt not in this table
    style: null,
    past_in: null
  };
}

// Helper to extract average ST from "F0\nL0\n0.15" format
function extractAvgStFromCell(text: string): number | null {
  const lines = text.split(/\s+/);
  for (const line of lines) {
    const match = line.match(/0?\.\d{2}/);
    if (match) {
      return toNumber(match[0]);
    }
  }
  return null;
}

// Helper to extract win rate from multi-line cell (lineIndex: 0=win rate, 1=2連率, 2=3連率)
function extractWinRateFromCell(text: string, lineIndex: number): number | null {
  const lines = text.split(/\s+/).filter((l) => l.trim());
  if (lines[lineIndex]) {
    return toNumber(lines[lineIndex]);
  }
  return null;
}

// Helper to extract motor/boat number from first line
function extractMotorNoFromCell(text: string): number | null {
  const lines = text.split(/\s+/).filter((l) => l.trim());
  if (lines[0]) {
    const match = lines[0].match(/^(\d{1,3})/);
    return match ? parseInt(match[1], 10) : null;
  }
  return null;
}

function extractBoatNoFromCell(text: string): number | null {
  return extractMotorNoFromCell(text);
}

// Helper to extract rate from multi-line cell (lineIndex: 1=2連率, 2=3連率)
function extractRateFromCell(text: string, lineIndex: number): number | null {
  const lines = text.split(/\s+/).filter((l) => l.trim());
  if (lines[lineIndex]) {
    return toNumber(lines[lineIndex]);
  }
  return null;
}

// Strategy B: Card-like blocks per lane
export function parseStrategyB($: CheerioAPI): Array<any> | null {
  const entries: Array<any> = [];
  let checkedElements = 0;

  // helper to get full-width digit for lane
  const fullWidthDigit = (n: number) => String.fromCharCode(0xff10 + n);

  // Find blocks containing lane indicators
  $("*").each((_, el) => {
    const $el = $(el);
    const text = normalizeText($el.text());
    checkedElements++;

    for (let lane = 1; lane <= 6; lane++) {
      const fw = fullWidthDigit(lane);
      const lanePatterns = [
        // match standalone half- or full-width lane digit
        new RegExp(`\\b(?:${lane}|${fw})\\b`),
        // match digit anywhere (fallback)
        new RegExp(`[${lane}${fw}]`),
        // match "1 " style
        new RegExp(`\\b${lane}\\s`)
      ];

      // quick check for lane marker and reasonable block size
      if (!lanePatterns.some((p) => p.test(text)) || text.length > 5000) continue;

      // Heuristic: presence of racer data: reg id (4 digits + grade), avg ST, weight or grade
      const hasData = /\d{4}\s*\/\s*[AB]\d|0?\.\d{2}|\d+(?:\.\d+)?kg|A1|A2|B1|B2/.test(text);
      if (hasData) {
        if (DEBUG) {
          logger.debug({ lane, text: text.substring(0, 200), tagName: el.tagName }, "Strategy B: Found block");
        }
        entries.push({
          lane,
          reg_id: extractRegId(text),
          player: extractPlayerFromBlock($, el, text),
          grade: extractGrade(text),
          age: extractAge(text),
          national_win: extractNationalWin(text),
          local_win: extractLocalWin(text),
          avg_st: extractAvgSt(text),
          motor_no: extractMotorNo(text),
          motor_rate: extractMotorRate(text),
          boat_no: extractBoatNo(text),
          boat_rate: extractBoatRate(text),
          weight: extractWeight(text),
          tilt: extractTilt(text),
          style: null,
          past_in: null
        });
        break;
      }
    }
  });

  if (DEBUG) {
    logger.debug({ checkedElements, foundEntries: entries.length, lanes: entries.map((e) => e.lane) }, "Strategy B: Scan complete");
  }

  // Deduplicate by lane (keep first)
  const seen = new Set<number>();
  const unique = entries.filter((e) => {
    if (seen.has(e.lane)) return false;
    seen.add(e.lane);
    return true;
  });

  return unique.length >= 3 ? unique : null;
}

// Extraction helpers
function extractRegId(text: string): number | null {
  // robust: pick first 4-digit sequence that looks like a reg id
  const match = text.match(/(\d{4})/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractRegId: No match");
  }
  return match ? parseInt(match[1], 10) : null;
}

function extractPlayer(cells: string[]): string | null {
  // Look for name-like text (not numbers, not labels)
  for (const cell of cells) {
    const trimmed = normalizeText(cell);
    if (trimmed && !/^\d+$/.test(trimmed) && !/登録|級別|年齢|平均|勝率|モーター|ボート|体重|チルト/.test(trimmed) && trimmed.length > 1 && trimmed.length < 20) {
      return trimmed;
    }
  }
  return null;
}

function extractPlayerFromBlock($: CheerioAPI, el: Element, text: string): string | null {
  // Try to find player name in block
  const $block = $(el);
  const candidates = $block
    .find("*")
    .toArray()
    .map((child) => normalizeText($(child).text()))
    .filter((t) => t && t.length > 1 && t.length < 20 && !/^\d+$/.test(t) && !/登録|級別|年齢|平均|勝率|モーター|ボート|体重|チルト/.test(t));
  return candidates[0] || null;
}

function extractGrade(text: string): string | null {
  const match = text.match(/(A1|A2|B1|B2)/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractGrade: No match");
  }
  return match ? match[1] : null;
}

function extractAge(text: string): number | null {
  const match = text.match(/(\d{2})\s*歳/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractAge: No match");
  }
  return match ? parseInt(match[1], 10) : null;
}

function extractAvgSt(text: string): number | null {
  const match = text.match(/0?\.\d{2}/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractAvgSt: No match");
  }
  return match ? toNumber(match[0]) : null;
}

function extractNationalWin(text: string): number | null {
  const match = text.match(/全国.*?勝率.*?(\d+(?:\.\d+)?)/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractNationalWin: No match");
  }
  return match ? toNumber(match[1]) : null;
}

function extractLocalWin(text: string): number | null {
  const match = text.match(/当地.*?勝率.*?(\d+(?:\.\d+)?)/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractLocalWin: No match");
  }
  return match ? toNumber(match[1]) : null;
}

function extractMotorNo(text: string): number | null {
  const match = text.match(/モーター.*?(\d{1,3})号機?/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractMotorNo: No match");
  }
  return match ? parseInt(match[1], 10) : null;
}

function extractMotorRate(text: string): number | null {
  const match = text.match(/モーター.*?(\d+(?:\.\d+)?)%/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractMotorRate: No match");
  }
  return match ? toNumber(match[1]) : null;
}

function extractBoatNo(text: string): number | null {
  const match = text.match(/ボート.*?(\d{1,3})号機?/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractBoatNo: No match");
  }
  return match ? parseInt(match[1], 10) : null;
}

function extractBoatRate(text: string): number | null {
  const match = text.match(/ボート.*?(\d+(?:\.\d+)?)%/);
  if (DEBUG && !match) {
    logger.debug({ text: text.substring(0, 100) }, "extractBoatRate: No match");
  }
  return match ? toNumber(match[1]) : null;
}

function extractWeight(text: string): number | null {
  // Look for weight pattern near "体重" label
  const weightMatch = text.match(/体重.*?(\d+(?:\.\d+)?)/);
  if (DEBUG && !weightMatch) {
    logger.debug({ text: text.substring(0, 100) }, "extractWeight: No match");
  }
  return weightMatch ? toNumber(weightMatch[1]) : null;
}

function extractTilt(text: string): number | null {
  // Look for tilt pattern near "チルト" label
  const tiltMatch = text.match(/チルト.*?(-?\d+(?:\.\d+)?)/);
  if (DEBUG && !tiltMatch) {
    logger.debug({ text: text.substring(0, 100) }, "extractTilt: No match");
  }
  return tiltMatch ? toNumber(tiltMatch[1]) : null;
}

// ヘルパー: 全角数字（１〜６）を半角に変換
function toHalfWidthLane(ch: string) {
  const map: Record<string, string> = { "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6" };
  return map[ch] ?? ch;
}

function parseWinRates(text: string | null | undefined) {
  const s = (text ?? "").toString().trim();
  if (!s) return { nationalWinRate: null, localWinRate: null };

  // Try explicit labels "全国" and "当地"
  const nationalRe = /(?:全国(?:勝率)?)[:：\s]*([0-9]+(?:\.[0-9]+)?)/;
  const localRe = /(?:当地(?:勝率)?)[:：\s]*([0-9]+(?:\.[0-9]+)?)/;

  const nationalMatch = s.match(nationalRe);
  const localMatch = s.match(localRe);

  let nationalWinRate = nationalMatch ? parseFloat(nationalMatch[1]) : null;
  let localWinRate = localMatch ? parseFloat(localMatch[1]) : null;

  // Fallback: "6.45/6.32" or "6.45,6.32" (assume first=national, second=local)
  if (nationalWinRate == null && localWinRate == null) {
    const pairRe = /([0-9]+(?:\.[0-9]+)?)\s*[\/，,]\s*([0-9]+(?:\.[0-9]+)?)/;
    const pair = s.match(pairRe);
    if (pair) {
      nationalWinRate = parseFloat(pair[1]);
      localWinRate = parseFloat(pair[2]);
    }
  }

  return { nationalWinRate, localWinRate };
}




