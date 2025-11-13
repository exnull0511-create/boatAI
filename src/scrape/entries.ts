// src/scrape/entries.ts
import axios from "axios";
import { load, CheerioAPI, Element } from "cheerio";
import { normalizeText, toHalfWidthDigits } from "../utils/normalize";
import { logger } from "../utils/logger";
import { saveSnapshotIfEnabled } from "../utils/snapshot";

export type RawEntry = {
  lane: number;
  reg_id: number | null;
  player: string | null;
  grade: string | null;
  age: number | null;
  national_win: number | null;
  local_win: number | null;
  avg_st: number | null;
  motor_no: number | null;
  motor_rate: number | null;
  boat_no: number | null;
  boat_rate: number | null;
  weight: number | null;
  tilt: number | null;
  style: string | null;
  past_in: string | null;
};

export type RaceListRaw = {
  date: string;          // YYYYMMDD
  track: string;
  number: number;
  scheduled_at: string | null;
  entries: RawEntry[];
};

export async function fetchRaceListRaw(params: { date: string; jcd: string; rno: number }): Promise<RaceListRaw> {
  const url = `https://www.boatrace.jp/owpc/pc/race/racelist?hd=${params.date}&jcd=${params.jcd}&rno=${params.rno}`;
  let html = "";
  try {
    const ua = process.env.USER_AGENT || "Mozilla/5.0 (BoatAI/1.0)";
    const res = await axios.get(url, { headers: { "User-Agent": ua } });
    html = res.data as string;
    const $ = load(html);
    const race = parseRaceListFromDom($, params.date, params.rno);
    return race;
  } catch (e: any) {
    logger.error({ code: "RACELIST_FETCH_ERROR", url, err: String(e) }, "failed to fetch racelist");
    await saveSnapshotIfEnabled(html, url, "racelist");
    throw e;
  }
}

function parseRaceListFromDom($: CheerioAPI, date: string, rno: number): RaceListRaw {
  const track = extractTrack($);
  const scheduled_at = extractScheduledAt($);
  const entries = extractEntriesFromTable($);

  return {
    date,
    track,
    number: rno,
    scheduled_at,
    entries
  };
}

function extractTrack($: CheerioAPI): string {
  // ページ上部のタイトルや場名をそのまま使う（例：「第１１回〜」or「桐生」など）
  const t = normalizeText($("h2").first().text() || $("title").first().text());
  return t || "不明";
}

function extractScheduledAt($: CheerioAPI): string | null {
  const line = $("body")
    .text()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.includes("締切予定時刻"));
  return line ? normalizeText(line) : null;
}

function extractEntriesFromTable($: CheerioAPI): RawEntry[] {
  // 枠・ボートレーサー と書かれているテーブルを探す
  const table = $("table")
    .filter((_, el) => normalizeText($(el).text()).includes("枠 ボートレーサー") || normalizeText($(el).text()).includes("枠 ボートレーサ"))
    .first();

  if (!table || table.length === 0) {
    logger.warn({ code: "NO_RACELIST_TABLE" }, "could not find racelist table");
    // 空の6艇を返す
    return defaultEmptyEntries();
  }

  const raw = (table as any).text() as string;
  const rawLines = raw.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  // 各号艇ごとにブロックに分割（行頭が「１」「２」…「６」のところで分割）
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const isLaneHead = /^[０-９0-9]/.test(t);
    if (isLaneHead && current.length > 0 && blocks.length < 6) {
      blocks.push(current);
      current = [];
    }
    current.push(t);
  }
  if (current.length > 0 && blocks.length < 6) {
    blocks.push(current);
  }

  const entries: RawEntry[] = [];
  for (let i = 0; i < blocks.length && entries.length < 6; i++) {
    const laneIndex = entries.length + 1;
    const e = parseLaneBlock(blocks[i], laneIndex);
    entries.push(e);
  }

  // 6艇揃わない場合は不足分を空で埋める
  while (entries.length < 6) {
    entries.push(makeEmptyEntry(entries.length + 1));
  }

  return entries;
}

function makeEmptyEntry(lane: number): RawEntry {
  return {
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
  };
}

function parseLaneNumber(head: string, fallback: number): number {
  const t = toHalfWidthDigits(normalizeText(head));
  const m = t.match(/^(\d+)/);
  if (m) return parseInt(m[1], 10);
  return fallback;
}

function parseLaneBlock(block: string[], defaultLane: number): RawEntry {
  let lane = defaultLane;
  let reg_id: number | null = null;
  let grade: string | null = null;
  let player: string | null = null;
  let age: number | null = null;
  let weight: number | null = null;
  let national_win: number | null = null;
  let local_win: number | null = null;
  let avg_st: number | null = null;
  let motor_no: number | null = null;
  let motor_rate: number | null = null;
  let boat_no: number | null = null;
  let boat_rate: number | null = null;
  let seenFirstPureNumber = false;

  for (let idx = 0; idx < block.length; idx++) {
    const raw = block[idx];
    const t = normalizeText(raw);
    if (!t) continue;
    const tHalf = toHalfWidthDigits(t);

    // 号艇（先頭の数字）
    if (idx === 0) {
      lane = parseLaneNumber(tHalf, defaultLane);
      continue;
    }

    // 登録番号 / 級別 例: "4128 / B1"
    if (reg_id == null) {
      const m = tHalf.match(/(\d+)\s*\/\s*([A-Z]\d)/);
      if (m) {
        reg_id = parseInt(m[1], 10);
        grade = m[2];
        continue;
      }
    }

    // 選手名: 【川口 貴久】 のような行
    if (!player && /【[^】]+】/.test(t)) {
      const m = t.match(/【([^】]+)】/);
      if (m && m[1]) {
        player = m[1].trim();
        continue;
      }
    }

    // 年齢/体重: "45歳/54.8kg"
    if (age == null || weight == null) {
      const mAge = tHalf.match(/(\d+)\s*歳/);
      if (mAge) {
        age = parseInt(mAge[1], 10);
      }
      const mW = tHalf.match(/(\d+(?:\.\d+)?)\s*kg/);
      if (mW) {
        weight = parseFloat(mW[1]);
      }
      if (mAge || mW) continue;
    }

    // 平均ST 勝率: "0.15  4.28" の行
    if (avg_st == null || national_win == null) {
      const m = tHalf.match(/(\d+\.\d+)\s+(\d+\.\d+)/);
      if (m) {
        if (avg_st == null) {
          avg_st = parseFloat(m[1]);
        }
        if (national_win == null) {
          national_win = parseFloat(m[2]);
        }
        continue;
      }
    }

    // モーター・ボート番号（末尾が数字だけの行を順に motor_no, boat_no に割当）
    const mNumOnly = tHalf.match(/^(\d{2,3})$/);
    if (mNumOnly) {
      const num = parseInt(mNumOnly[1], 10);
      if (!seenFirstNumber(seenFirstPureNumber, motor_no)) {
        motor_no = num;
        seenFirstPureNumber = true;
        continue;
      } else if (boat_no == null) {
        boat_no = num;
        continue;
      }
    }
  }

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
    tilt: null,
    style: null,
    past_in: null
  };
}

// motor_no用・最初の数字行を判定するヘルパ
function seenFirstNumber(seen: boolean, motorNo: number | null): boolean {
  return seen || motorNo != null;
}
