import type { MatchStateView, PlayerView } from "../../types";

interface PlayerListProps {
  matchState: MatchStateView | null;
  selfPlayer: PlayerView | null;
}

export function PlayerList({ matchState, selfPlayer }: PlayerListProps) {
  if (!matchState) {
    return null;
  }

  return (
    <div className="player-grid">
      {matchState.players.map((player) => (
        <article
          key={player.userId}
          className={[
            "player-card",
            player.userId === selfPlayer?.userId ? "self" : "",
            player.userId === matchState.winnerUserId ? "winner" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span>{player.username}</span>
          <small>
            <span className={player.mark === "X" ? "mark-chip mark-x" : "mark-chip mark-o"}>{player.mark}</span> •{" "}
            {player.connected ? "Connected" : "Disconnected"}
          </small>
        </article>
      ))}
    </div>
  );
}
