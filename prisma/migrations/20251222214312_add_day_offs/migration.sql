-- Add day off allowance to profile
ALTER TABLE "UserProfile" ADD COLUMN "dayOffAllowance" INTEGER NOT NULL DEFAULT 15;

-- Create day offs table
CREATE TABLE "DayOff" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DayOff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayOff_userId_dayKey_key" ON "DayOff"("userId", "dayKey");
CREATE INDEX "DayOff_userId_dayKey_idx" ON "DayOff"("userId", "dayKey");

ALTER TABLE "DayOff" ADD CONSTRAINT "DayOff_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
