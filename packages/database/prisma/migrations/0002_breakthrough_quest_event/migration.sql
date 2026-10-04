-- 阶段3：境界突破 / 委托任务 / 奇遇事件
ALTER TABLE "Player" ADD COLUMN "breakthroughCooldownUntil" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "breakthroughFails" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Quest" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "questKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "rewardStones" INTEGER NOT NULL DEFAULT 0,
    "rewardExp" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "option" TEXT NOT NULL DEFAULT 'A',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BreakthroughLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "fromRealm" TEXT NOT NULL,
    "toRealm" TEXT,
    "success" BOOLEAN NOT NULL,
    "cost" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakthroughLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Quest_playerId_status_idx" ON "Quest"("playerId", "status");
CREATE INDEX "EventLog_playerId_createdAt_idx" ON "EventLog"("playerId", "createdAt");
CREATE INDEX "BreakthroughLog_playerId_createdAt_idx" ON "BreakthroughLog"("playerId", "createdAt");

ALTER TABLE "Quest" ADD CONSTRAINT "Quest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BreakthroughLog" ADD CONSTRAINT "BreakthroughLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
