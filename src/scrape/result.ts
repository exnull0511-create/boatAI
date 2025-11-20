import axios from "axios";
import { load } from "cheerio";
import { db } from "../db";
import { normalizeText, toNumber } from "../utils/normalize";

export async function fetchResult(params:{date:string,jcd:string,rno:number,race_id:string}) {

  const url=`https://www.boatrace.jp/owpc/pc/race/raceresult?hd=${params.date}&jcd=${params.jcd}&rno=${params.rno}`;
  const res = await axios.get(url,{headers:{"User-Agent":"Mozilla/5.0"}});
  const $ = load(res.data as string);

  // 着順（号艇 → 1〜6）
  const order:number[] = [];
  $(".table1 tbody tr").each((_,tr)=>{
    const t = normalizeText($(tr).find("th").text());
    const st = toNumber($(tr).find("td").eq(0).text());
    const finish = toNumber($(tr).find("td").eq(1).text());
    if (finish) order.push(finish);
  });

  // 払戻（3連単）
  const text = normalizeText($("body").text());
  const comb = text.match(/三連単.*?([1-6]-[1-6]-[1-6])/);
  const pay = text.match(/三連単.*?([0-9,]+)円/);

  const payout = pay ? Number(pay[1].replace(/,/g,"")) : null;

  // 保存
  const rs = db.prepare(`
    INSERT INTO results (race_id,lane,finish)
    VALUES (@race_id,@lane,@finish)
    ON CONFLICT(race_id,lane) DO UPDATE SET finish=excluded.finish
  `);

  const ps = db.prepare(`
    INSERT INTO payouts (race_id,trifecta_comb,trifecta_pay)
    VALUES (@race_id,@comb,@pay)
    ON CONFLICT(race_id) DO UPDATE SET trifecta_comb=excluded.trifecta_comb,trifecta_pay=excluded.trifecta_pay
  `);

  const tx = db.transaction(()=>{
    for(let lane=1;lane<=6;lane++){
      rs.run({race_id:params.race_id,lane,finish:null});
    }
    for(let i=0;i<order.length;i++){
      rs.run({race_id:params.race_id,lane:i+1,finish:order[i]});
    }
    ps.run({race_id:params.race_id,comb:comb?comb[1]:null,pay:payout});
  });
  tx();

  return {order,payout};
}
