import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = path.resolve("data/boat.sqlite");
export const db = new Database(dbPath);

const schema = fs.readFileSync(path.resolve("src/db/schema.sql"), "utf8");
db.exec(schema);

export function tx(fn: (db: Database) => void) {
  db.exec("BEGIN");
  try {
    fn(db);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}




