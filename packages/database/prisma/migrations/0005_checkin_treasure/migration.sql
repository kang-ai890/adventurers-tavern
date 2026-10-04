-- 阶段7：每日签到与寻宝罗盘
CREATE TABLE "CheckinLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "rewardStones" INTEGER NOT NULL DEFAULT 0,
    "rewardJades" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TreasureLog" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasureLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckinLog_playerId_date_key" ON "CheckinLog"("playerId", "date");
CREATE INDEX "TreasureLog_playerId_date_idx" ON "TreasureLog"("playerId", "date");

ALTER TABLE "CheckinLog" ADD CONSTRAINT "CheckinLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreasureLog" ADD CONSTRAINT "TreasureLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
