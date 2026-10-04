/**
 * 本地开发数据库：PGlite（嵌入式 PostgreSQL，WASM）通过 TCP socket 暴露标准 Postgres 协议。
 * 无需安装任何数据库软件；数据持久化在项目 .pgdata 目录。
 * 用法：npm run db:local
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dataDir = process.env.PGLITE_DATA_DIR ?? ".pgdata";
const port = Number(process.env.PG_PORT ?? 5432);

const db = new PGlite(dataDir);
// 注意：maxConnections 默认是 1，会导致第二个客户端被重置；本地开发给足连接数
const server = new PGLiteSocketServer({
  db,
  port,
  host: "127.0.0.1",
  maxConnections: 32,
  debug: process.env.DB_DEBUG === "1",
});
await server.start();

console.log("┌──────────────────────────────────────────────────────┐");
console.log("│ 🍶 《冒险者酒馆》本地数据库已就绪                     │");
console.log(`│    连接串: postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log(`│    数据目录: ${dataDir}（删除即可重置数据库）`);
console.log("│    按 Ctrl+C 停止                                     │");
console.log("└──────────────────────────────────────────────────────┘");

process.on("SIGINT", async () => {
  console.log("[db-local] 正在关闭…");
  await server.stop();
  await db.close();
  process.exit(0);
});
