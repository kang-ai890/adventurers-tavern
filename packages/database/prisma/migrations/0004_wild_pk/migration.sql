-- 阶段6：野外采集与PK红名
ALTER TABLE "Player" ADD COLUMN "killScoreUpdatedAt" TIMESTAMP(3);

CREATE TABLE "GatherLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "spotType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatherLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttackLog" (
    "id" UUID NOT NULL,
    "attackerId" UUID NOT NULL,
    "victimId" UUID NOT NULL,
    "success" BOOLEAN NOT NULL,
    "victimWasRed" BOOLEAN NOT NULL DEFAULT false,
    "lootSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttackLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GatherLog_playerId_createdAt_idx" ON "GatherLog"("playerId", "createdAt");
CREATE INDEX "AttackLog_attackerId_createdAt_idx" ON "AttackLog"("attackerId", "createdAt");
CREATE INDEX "AttackLog_victimId_createdAt_idx" ON "AttackLog"("victimId", "createdAt");

ALTER TABLE "GatherLog" ADD CONSTRAINT "GatherLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttackLog" ADD CONSTRAINT "AttackLog_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttackLog" ADD CONSTRAINT "AttackLog_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
