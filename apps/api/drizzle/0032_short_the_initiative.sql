ALTER TABLE "graph_event_bindings" DROP CONSTRAINT "graph_event_bindings_element_event_unique";--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD COLUMN "position" integer;--> statement-breakpoint
WITH ordered AS (
  SELECT
    "graph_id",
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "graph_id", "canvas_id", "element_id"
      ORDER BY "created_at", "id"
    ) - 1 AS "position"
  FROM "graph_event_bindings"
) UPDATE "graph_event_bindings" AS bindings
SET "position" = ordered."position"
FROM ordered
WHERE bindings."graph_id" = ordered."graph_id"
  AND bindings."id" = ordered."id";--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD CONSTRAINT "graph_event_bindings_element_position_unique" UNIQUE("graph_id","canvas_id","element_id","position");