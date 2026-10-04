-- 阶段8：冒险者 / 装备 / 战斗日志
CREATE TABLE "Hero" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "heroId" TEXT NOT NULL,
    "star" INTEGER NOT NULL DEFAULT 1,
    "level" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hero_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "atk" INTEGER NOT NULL DEFAULT 0,
    "def" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 0,
    "heroId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BattleLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "dungeonId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "rewards" JSONB,
    "logText" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Hero_playerId_idx" ON "Hero"("playerId");
CREATE INDEX "Equipment_playerId_idx" ON "Equipment"("playerId");
CREATE INDEX "BattleLog_playerId_createdAt_idx" ON "BattleLog"("playerId", "createdAt");

ALTER TABLE "Hero" ADD CONSTRAINT "Hero_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BattleLog" ADD CONSTRAINT "BattleLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
