-- 阶段4：顾客与口碑 / 好友 / 拜访浇水
ALTER TABLE "Player" ADD COLUMN "totalRevenue" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "lastCustomerGenAt" TIMESTAMP(3);
ALTER TABLE "FarmPlot" ADD COLUMN "waterCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FarmPlot" ADD COLUMN "waterDate" TEXT NOT NULL DEFAULT '';

CREATE TABLE "Friend" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "affinity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TavernOrder" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TavernOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Friend_requesterId_recipientId_key" ON "Friend"("requesterId", "recipientId");
CREATE INDEX "Friend_recipientId_status_idx" ON "Friend"("recipientId", "status");
CREATE INDEX "TavernOrder_playerId_status_idx" ON "TavernOrder"("playerId", "status");

ALTER TABLE "Friend" ADD CONSTRAINT "Friend_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TavernOrder" ADD CONSTRAINT "TavernOrder_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
