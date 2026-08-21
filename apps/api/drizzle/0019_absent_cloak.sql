ALTER TABLE "graph_node_variables" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;
WITH ranked AS (
  SELECT
    graph_id,
    id,
    row_number() OVER (PARTITION BY graph_id, scene_id ORDER BY id) - 1 AS position
  FROM graph_node_variables
)
UPDATE graph_node_variables AS variable
SET position = ranked.position
FROM ranked
WHERE variable.graph_id = ranked.graph_id AND variable.id = ranked.id;