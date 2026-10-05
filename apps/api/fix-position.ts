import "dotenv/config";
import { Client } from "pg";

async function run() {
  const client = new Client({
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432"),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "1234",
    database: process.env.DB_NAME ?? "trackdb",
  });

  await client.connect();

  const positions = await client.query("SELECT id, name FROM positions");
  console.log("Positions:", positions.rows);

  const frontendPos = positions.rows.find(
    (p: { name: string }) => p.name === "Frontend",
  );
  if (!frontendPos) {
    console.log("Frontend position not found");
    await client.end();
    return;
  }

  await client.query(
    "UPDATE users SET position_id = $1 WHERE email = 'programmer@gmail.com'",
    [frontendPos.id],
  );
  console.log(`Updated programmer position_id to ${frontendPos.id}`);

  const users = await client.query(
    "SELECT id, email, position_id FROM users",
  );
  console.log("Users:", users.rows);

  await client.end();
}

run().catch(console.error);
