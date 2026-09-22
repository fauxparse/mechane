-- PROTOTYPE (issue #675, inherited from #676) — dev-only data for the
-- Formula-authoring prototype.
-- Adds four Transformer nodes to the Voting show's draft graph plus the wiring
-- edges that land on the prototype's port handles, so the variants are judged
-- against real neighbours, real edge routing and real density. The fourth,
-- "Vote share", is seeded with a broken Formula and left that way: it is the
-- node the variants have to present in error, at rest, with nobody editing it.
--
-- Run:
--   docker compose exec -T postgres psql -U mechane -d mechane \
--     < apps/studio/src/editors/show/graph/prototype-formula-authoring/seed-prototype-transformers.sql
--
-- Undo:
--   DELETE FROM graph_nodes WHERE id IN
--     ('transformer_tally','transformer_shortlist','transformer_order','transformer_share');
--   DELETE FROM graph_node_variables WHERE id = 'variable_tally_headline';
--   (edges cascade from both)
--
-- The Transformer rows deliberately carry `type = NULL`: a Transformer with no
-- type keeps a wiring edge into it legal whatever the domain later decides
-- about port types (packages/domain/src/graph.ts, assertValidWiringEdge) and
-- leaves its type compatibility "unknown" rather than "incompatible", so the
-- prototype edges route and paint like real ones.
--
-- Transformer-targeted edges carry an EMPTY target_path, because
-- `graph_edges.target_variable_id` is a generated column (`target_path[1]`)
-- with a foreign key onto `graph_node_variables`: today's schema cannot store
-- a wiring edge naming a port on a Transformer at all. The prototype
-- re-anchors these edges onto its port handles in the projection instead
-- (see transform-prototype-state.ts, `prototypeEdgePortHandle`).

BEGIN;

INSERT INTO graph_nodes (id, graph_id, kind, name, parent_id, position_x, position_y)
SELECT node.id, graph.id, node.kind, node.name, node.parent_id, node.position_x, node.position_y
FROM (
  SELECT id FROM show_graphs WHERE show_id = 'stkyc2pq' AND state = 'draft'
) AS graph
CROSS JOIN (
  VALUES
    ('transformer_tally', 'transformer', 'Tally headline', NULL::text, 0.0, 300.0),
    ('transformer_shortlist', 'transformer', 'Front runners', NULL::text, 0.0, 640.0),
    ('transformer_order', 'transformer', 'Candidate order', 'flow_audience', 704.0, 330.0),
    ('transformer_share', 'transformer', 'Vote share', NULL::text, 0.0, 980.0)
) AS node(id, kind, name, parent_id, position_x, position_y)
ON CONFLICT DO NOTHING;

INSERT INTO graph_node_variables (id, graph_id, scene_id, name, type, rank)
SELECT 'variable_tally_headline', graph.id, 'scene_vote_tally', 'Headline', '"text"'::jsonb, 1
FROM (
  SELECT id FROM show_graphs WHERE show_id = 'stkyc2pq' AND state = 'draft'
) AS graph
ON CONFLICT DO NOTHING;

INSERT INTO graph_edges (id, graph_id, kind, source_node_id, target_node_id, source_path, target_path)
SELECT edge.id, graph.id, edge.kind, edge.source_node_id, edge.target_node_id,
       edge.source_path, edge.target_path
FROM (
  SELECT id FROM show_graphs WHERE show_id = 'stkyc2pq' AND state = 'draft'
) AS graph
CROSS JOIN (
  VALUES
    ('edge_candidates_tally_port', 'wiring', 'source_candidates', 'transformer_tally',
     '{}'::text[], '{}'::text[]),
    ('edge_candidates_shortlist_port', 'wiring', 'source_candidates', 'transformer_shortlist',
     '{}'::text[], '{}'::text[]),
    ('edge_candidates_order_port', 'wiring', 'source_candidates', 'transformer_order',
     '{}'::text[], '{}'::text[]),
    ('edge_candidates_share_port', 'wiring', 'source_candidates', 'transformer_share',
     '{}'::text[], '{}'::text[]),
    ('edge_tally_headline', 'wiring', 'transformer_tally', 'scene_vote_tally',
     '{}'::text[], '{variable_tally_headline}'::text[])
) AS edge(id, kind, source_node_id, target_node_id, source_path, target_path)
ON CONFLICT DO NOTHING;

COMMIT;
