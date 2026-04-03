import type { MatchStateView, PlayerView } from "../../types";
import { getWinner } from "../../utils/match";
import { BoardGrid } from "./BoardGrid";
import { MatchSummary } from "./MatchSummary";
import { PlayerList } from "./PlayerList";

interface GamePanelProps {
  matchState: MatchStateView | null;
  onLeaveMatchView: () => void;
  onQueueAgain: () => void;
  status: "Idle" | "Authenticating" | "Ready" | "Matchmaking" | "Joining" | "Playing" | "Finished" | "Error";
  selfPlayer: PlayerView | null;
  selfUserId: string | null;
  onPlayMove: (index: number) => void;
}

export function GamePanel({ matchState, onLeaveMatchView, onQueueAgain, status, selfPlayer, selfUserId, onPlayMove }: GamePanelProps) {
  const winner = getWinner(matchState);
  const shouldShowResultOverlay = !!matchState?.resultReason;
  const showSearchingStage = !matchState && (status === "Matchmaking" || status === "Joining");

  return (
    <div className="panel game-panel">
      <div className="panel-header panel-header-stack">
        <h2>Game Board</h2>
        <small className="panel-subtitle">Live match view</small>
      </div>
      <MatchSummary matchState={matchState} selfUserId={selfUserId} status={status} />
      {showSearchingStage ? (
        <div className="searching-stage" role="status" aria-live="polite">
          <div className="searching-orbit">
            <span className="search-node node-a" />
            <span className="search-node node-b" />
            <span className="search-node node-c" />
            <div className="search-core">VS</div>
          </div>
          <div className="searching-copy">
            <span className="match-status-tag active-turn">{status === "Matchmaking" ? "Searching" : "Joining"}</span>
            <strong className="searching-title">
              {status === "Matchmaking" ? "Finding Your Next Opponent" : "Preparing the Match"}
            </strong>
            <p className="match-copy">
              {status === "Matchmaking"
                ? "Scanning open challenges and matchmaking queues for the fastest fair match."
                : "Syncing players, loading the board, and locking in the round."}
            </p>
          </div>
          <button className="action-button tertiary-action" onClick={onLeaveMatchView} type="button">
            Back to Lobby
          </button>
        </div>
      ) : (
        <>
          <div className="game-board-shell">
            <BoardGrid matchState={matchState} selfUserId={selfUserId} onPlayMove={onPlayMove} />
            {shouldShowResultOverlay ? (
              <div className="match-result-overlay" role="status" aria-live="polite">
                <div className="match-result-card">
                  <span className="match-status-tag">{getResultLabel(matchState.resultReason)}</span>
                  <strong className="match-result-headline">
                    {matchState.resultReason === "draw"
                      ? "Round Ends in a Draw"
                      : winner
                        ? winner.userId === selfUserId
                          ? "Victory"
                          : `${winner.username} Wins`
                        : "Match Complete"}
                  </strong>
                  <p className="match-copy">
                    {matchState.resultReason === "draw"
                      ? "No one found the final opening before the board filled up."
                      : winner
                        ? winner.userId === selfUserId
                          ? `You closed out the round as ${winner.mark}.`
                          : `${winner.username} closed out the round as ${winner.mark}.`
                        : "The round has finished."}
                  </p>
                  <div className="result-actions">
                    <button className="action-button primary-cta" onClick={onQueueAgain} type="button">
                      Queue Again
                    </button>
                    <button className="action-button tertiary-action" onClick={onLeaveMatchView} type="button">
                      Back to Lobby
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <PlayerList matchState={matchState} selfPlayer={selfPlayer} />
        </>
      )}
    </div>
  );
}

function getResultLabel(resultReason: MatchStateView["resultReason"]) {
  switch (resultReason) {
    case "draw":
      return "Draw";
    case "timeout":
      return "Timeout";
    case "forfeit":
      return "Forfeit";
    case "win":
      return "Winner";
    default:
      return "Complete";
  }
}
