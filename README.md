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

## 本地开发

```bash
# 1. 安装依赖（需要 Node >= 20）
npm install

# 2. 准备数据库（本地 PostgreSQL 或 Neon 免费实例）
#    复制 apps/server/.env.example 为 apps/server/.env，填入 DATABASE_URL
npm run db:generate

# 3. 启动后端（http://localhost:4000）
npm run dev:server

# 4. 另开终端启动前端（http://localhost:5173）
npm run dev:web

# 5. 管理后台（http://localhost:5174）
npm run dev:admin
```

## 部署（全部免费）

- **前端 + 管理后台** → GitHub Pages（`deploy-pages.yml` 自动发布，后台在 `/admin/`）
- **后端** → Render（仓库根目录 `render.yaml` 蓝图，Render 控制台 Blueprint 一键接入）
- **数据库** → [Neon](https://neon.tech) 免费实例，连接串填入 Render 环境变量 `DATABASE_URL`

> 前端连接的后端地址由 `VITE_SERVER_URL` 决定（`deploy-pages.yml` 中配置）。

## 许可

代码 MIT；美术素材许可见 `docs/CREDITS.md`。
