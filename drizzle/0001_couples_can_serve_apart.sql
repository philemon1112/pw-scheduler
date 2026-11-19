ALTER TABLE "couples" ALTER COLUMN "always_together" SET DEFAULT false;--> statement-breakpoint
-- Couples that came from the seed were created under the old default; the seed notes say a spouse can also serve with someone else.
UPDATE "couples" SET "always_together" = false;
