import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "../utils/logger";
import { db } from "../db";

const app = Fastify({ logger: true });

// Global error handler
app.setErrorHandler((error, request, reply) => {
  logger.error({ error, url: request.url }, "request error");
  reply.status(500).send({ error: "Internal Server Error", message: error.message });
});

app.get("/health", async () => {
  return { ok: true, ts: Date.now() };
});

app.get("/races", async (req, reply) => {
  const q = (req.query as any) || {};
  const rawDate = typeof q.date === "string" ? q.date : "";
  const date = rawDate.replace(/-/g, ""); // 2025-10-30 -> 20251030
  if (!date || !/^\d{8}$/.test(date)) {
    return reply.status(400).send({ error: "date query required (YYYYMMDD or YYYY-MM-DD)" });
  }
  const rows = db.prepare("SELECT * FROM races WHERE date = ? ORDER BY number ASC").all(date);
  return { date, count: rows.length, races: rows };
});

const port = Number(process.env.PORT || 3000);

// Start server
async function start() {
  try {
    // CORS: allow localhost
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin || origin.includes("localhost") || origin.includes("127.0.0.1")) {
          cb(null, true);
        } else {
          cb(new Error("Not allowed"), false);
        }
      },
    });

    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`listening http://localhost:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();


