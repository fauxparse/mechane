-- Every Scene and Block definition has exactly one Canvas. Backfill rows
-- before installing the deferred checks so existing databases become valid.
INSERT INTO "canvases" ("id", "graph_id", "scene_node_id", "block_id", "position_x", "position_y")
SELECT
  'a' || substr(md5('scene:' || "graph_id" || ':' || "id"), 1, 7),
  "graph_id",
  "id",
  NULL,
  "position_x",
  "position_y"
FROM "graph_nodes"
WHERE "kind" = 'scene'
  AND NOT EXISTS (
    SELECT 1
    FROM "canvases"
    WHERE "canvases"."graph_id" = "graph_nodes"."graph_id"
      AND "canvases"."scene_node_id" = "graph_nodes"."id"
  );

INSERT INTO "canvases" ("id", "graph_id", "scene_node_id", "block_id", "position_x", "position_y")
SELECT
  'a' || substr(md5('block:' || "graph_id" || ':' || "id"), 1, 7),
  "graph_id",
  NULL,
  "id",
  0,
  0
FROM "blocks"
WHERE NOT EXISTS (
  SELECT 1
  FROM "canvases"
  WHERE "canvases"."graph_id" = "blocks"."graph_id"
    AND "canvases"."block_id" = "blocks"."id"
);

INSERT INTO "canvas_elements" (
  "id", "canvas_id", "parent_id", "type", "rank", "name", "hidden", "properties"
)
SELECT "id" || '-root', "id", NULL, 'frame', 'a', NULL, false, '{}'::jsonb
FROM "canvases"
WHERE NOT EXISTS (
  SELECT 1
  FROM "canvas_elements"
  WHERE "canvas_elements"."canvas_id" = "canvases"."id"
    AND "canvas_elements"."parent_id" IS NULL
);

CREATE OR REPLACE FUNCTION enforce_canvas_presence() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_graph_id text;
  owner_scene_id text;
  owner_block_id text;
BEGIN
  IF TG_TABLE_NAME = 'graph_nodes' THEN
    IF TG_OP = 'DELETE' OR NEW.kind <> 'scene' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM canvases
      WHERE graph_id = NEW.graph_id
        AND scene_node_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Scene % in graph % must have a Canvas', NEW.id, NEW.graph_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'blocks' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM canvases
      WHERE graph_id = NEW.graph_id
        AND block_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Block % in graph % must have a Canvas', NEW.id, NEW.graph_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    owner_graph_id := OLD.graph_id;
    owner_scene_id := OLD.scene_node_id;
    owner_block_id := OLD.block_id;
  ELSE
    owner_graph_id := NEW.graph_id;
    owner_scene_id := NEW.scene_node_id;
    owner_block_id := NEW.block_id;
  END IF;

  IF owner_scene_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM graph_nodes
       WHERE graph_id = owner_graph_id
         AND id = owner_scene_id
         AND kind = 'scene'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM canvases
       WHERE graph_id = owner_graph_id
         AND scene_node_id = owner_scene_id
     ) THEN
    RAISE EXCEPTION 'Scene % in graph % must have a Canvas', owner_scene_id, owner_graph_id
      USING ERRCODE = '23514';
  END IF;

  IF owner_block_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM blocks
       WHERE graph_id = owner_graph_id
         AND id = owner_block_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM canvases
       WHERE graph_id = owner_graph_id
         AND block_id = owner_block_id
     ) THEN
    RAISE EXCEPTION 'Block % in graph % must have a Canvas', owner_block_id, owner_graph_id
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER graph_nodes_scene_canvas_presence
AFTER INSERT OR UPDATE ON "graph_nodes"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_canvas_presence();

CREATE CONSTRAINT TRIGGER blocks_canvas_presence
AFTER INSERT OR UPDATE ON "blocks"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_canvas_presence();

CREATE CONSTRAINT TRIGGER canvases_owner_presence
AFTER DELETE OR UPDATE ON "canvases"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_canvas_presence();
