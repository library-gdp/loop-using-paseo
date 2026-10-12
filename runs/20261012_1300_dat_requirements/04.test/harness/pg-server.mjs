// embedded PostgreSQL 18을 띄우고 SIGTERM/SIGINT를 받을 때까지 유지한다.
import { rmSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { PG, PG_DATA_DIR } from "./common.mjs";

rmSync(PG_DATA_DIR, { recursive: true, force: true });
const server = new EmbeddedPostgres({
  databaseDir: PG_DATA_DIR,
  user: PG.user,
  password: PG.password,
  port: PG.port,
  persistent: false,
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
await server.initialise();
await server.start();
console.log(`postgres ready on ${PG.host}:${PG.port}`);

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1 << 30);
