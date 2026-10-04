-- 阶段9：图鉴与成就
CREATE TABLE "CodexEntry" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodexEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodexClaim" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodexClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Achievement" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodexEntry_playerId_category_itemId_key" ON "CodexEntry"("playerId", "category", "itemId");
CREATE UNIQUE INDEX "CodexClaim_playerId_category_pct_key" ON "CodexClaim"("playerId", "category", "pct");
CREATE UNIQUE INDEX "Achievement_playerId_achievementId_key" ON "Achievement"("playerId", "achievementId");

ALTER TABLE "CodexEntry" ADD CONSTRAINT "CodexEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CodexClaim" ADD CONSTRAINT "CodexClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
