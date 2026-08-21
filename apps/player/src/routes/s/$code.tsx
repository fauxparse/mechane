import { createFileRoute } from "@tanstack/react-router";
import { PlayerView } from "../../components/PlayerView";

export const Route = createFileRoute("/s/$code")({
  component: PairedPlayer,
});

function PairedPlayer() {
  const { code } = Route.useParams();
  return <PlayerView code={code} />;
}
