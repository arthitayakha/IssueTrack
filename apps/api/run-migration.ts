import "dotenv/config";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

async function run() {
  const client = new Client({
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432"),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "1234",
    database: process.env.DB_NAME ?? "trackdb",
  });

  await client.connect();
  console.log("Connected to database");

  const migrationFiles = [
    "0001-add-position-fk.sql",
    "0002-add-is-active.sql",
  ];

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(
      path.join(__dirname, "migrations", file),
      "utf8",
    );

    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        console.log("OK:", stmt.substring(0, 60));
      } catch (err: any) {
        console.log("SKIP:", err.message?.substring(0, 100));
      }
    }
  }

  await client.end();
  console.log("Migration complete");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
