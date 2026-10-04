# 🍶 《冒险者酒馆》Adventurer's Tavern

东方修仙题材 · 像素风多人在线经营游戏。经营酒馆、修习境界、野外 PK、组队历练、交易拍卖。

完整设计文档见 [`docs/游戏设计全案.md`](docs/游戏设计全案.md)、[`docs/游戏数值设计.md`](docs/游戏数值设计.md) 与 [`docs/上线部署清单.md`](docs/上线部署清单.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + Phaser 3 + Zustand + Socket.IO Client |
| 后端 | Node.js + Express + Socket.IO + Prisma |
| 数据库 | PostgreSQL（Neon 免费云） |
| 后台 | React + Ant Design |
| 工程 | npm workspaces + GitHub Actions |

## 目录结构

```
adventurers-tavern/
├── apps/
│   ├── web/          # 游戏前端
│   ├── server/       # 游戏后端
│   └── admin/        # 管理后台
├── packages/
│   ├── shared/       # 前后端共享类型 / Socket 事件 / Zod schema
│   └── database/     # Prisma schema 与客户端
└── docs/             # 设计文档、素材署名
```

## 本地开发（零安装数据库，开箱即玩）

```bash
# 1. 安装依赖（需要 Node >= 20）
npm install

# 2. 启动本地数据库（嵌入式 PostgreSQL，数据在 .pgdata，无需安装任何软件）
npm run db:local

# 3. 首次运行：建表（apps/server/.env 已配好本地连接串）
npm run db:deploy

# 4. 另开终端启动后端（http://localhost:4000）
npm run dev:server

# 5. 另开终端启动前端（http://localhost:5173，浏览器打开即可玩）
npm run dev:web

# 6. 管理后台（http://localhost:5174）
npm run dev:admin
```

**自动化测试**：
- `npm run test:e2e`：阶段 1 经营闭环（登录→种植→收获→出售→升级守卫）
- `node scripts/e2e-stage2.mjs`：阶段 2 账号系统（注册/登录/多设备同步/游客转正）
- 均需先启动本地数据库和后端

> 本地库为嵌入式 PGlite（单会话复用），连接串需带 `pgbouncer=true&connection_limit=1`（apps/server/.env 已配置）；生产环境（Neon）用标准连接串。

## 部署（全部免费）

- **前端 + 管理后台** → GitHub Pages（`deploy-pages.yml` 自动发布，后台在 `/admin/`）
- **后端** → Render（仓库根目录 `render.yaml` 蓝图，Render 控制台 Blueprint 一键接入）
- **数据库** → [Neon](https://neon.tech) 免费实例，连接串填入 Render 环境变量 `DATABASE_URL`

> 前端连接的后端地址由 `VITE_SERVER_URL` 决定（`deploy-pages.yml` 中配置）。

## 许可

代码 MIT；美术素材许可见 `docs/CREDITS.md`。
