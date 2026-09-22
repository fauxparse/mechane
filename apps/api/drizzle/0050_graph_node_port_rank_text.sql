ALTER TABLE "graph_node_ports" ALTER COLUMN "rank" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "graph_node_ports" ALTER COLUMN "rank" TYPE text USING lpad("rank"::text, 10, '0');
--> statement-breakpoint
ALTER TABLE "graph_node_ports" ALTER COLUMN "rank" SET DEFAULT '';
