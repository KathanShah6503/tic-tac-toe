import type { MatchStateView } from "../../types";
import { getCurrentPlayer, getSelfPlayer, getTimerSeconds, getWinner } from "../../utils/match";

interface MatchSummaryProps {
  matchState: MatchStateView | null;
  selfUserId: string | null;
  status: "Idle" | "Authenticating" | "Ready" | "Matchmaking" | "Joining" | "Playing" | "Finished" | "Error";
}

export function MatchSummary({ matchState, selfUserId, status }: MatchSummaryProps) {
  if (!matchState) {
    if (status === "Matchmaking") {
      return (
        <div className="match-banner waiting">
          <span className="match-status-tag active-turn">Searching</span>
          <p className="match-copy">Looking for the next available opponent. Stay ready.</p>
        </div>
      );
    }

    if (status === "Joining") {
      return (
        <div className="match-banner waiting">
          <span className="match-status-tag">Joining</span>
          <p className="match-copy">Locking in the match and syncing the board.</p>
        </div>
      );
    }

    return <p className="empty-copy match-banner empty">Host a room or join one to start playing.</p>;
  }

  const currentPlayer = getCurrentPlayer(matchState);
  const selfPlayer = getSelfPlayer(matchState, selfUserId);
  const winner = getWinner(matchState);
  const timerSeconds = getTimerSeconds(matchState);

  if (!matchState.playing) {
    if (!matchState.resultReason) {
      return (
        <div className="match-banner waiting">
          <span className="match-status-tag">{matchState.players.length < 2 ? "Waiting" : "Ready"}</span>
          <p className="match-copy">
            {matchState.players.length < 2 ? "Waiting for your opponent." : "Both players are ready. Match starting."}
            {selfPlayer ? ` You are ${selfPlayer.mark}.` : ""}
          </p>
        </div>
      );
    }

    if (matchState.resultReason === "draw") {
      return (
        <div className="match-banner result-card draw">
          <span className="match-status-tag">Draw</span>
          <div className="result-copy-block">
            <strong className="result-title">Match Drawn</strong>
            <p className="match-copy">Neither player could break the deadlock this round.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="match-banner result-card victory">
        <span className="match-status-tag">Complete</span>
        <div className="result-copy-block">
          <strong className="result-title">{winner ? `${winner.username} Wins` : "Match Complete"}</strong>
          <p className="match-copy">
            {winner
              ? winner.userId === selfUserId
                ? `You took the round as ${winner.mark}.`
                : `${winner.username} closed it out as ${winner.mark}.`
              : "The round has finished."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="match-banner live">
      <span className={currentPlayer?.userId === selfUserId ? "match-status-tag active-turn" : "match-status-tag"}>
        {currentPlayer?.userId === selfUserId ? "Your Turn" : "Live Match"}
      </span>
      <p className="match-copy">
        {currentPlayer
          ? currentPlayer.userId === selfUserId
            ? "It is your turn"
            : `${currentPlayer.username}'s turn`
          : "Waiting for the next turn"}
        .
        {selfPlayer ? ` You are ${selfPlayer.mark}.` : ""}
      </p>
      {matchState.mode === "timed" ? (
        <span className={getTimerClassName(timerSeconds)}>{timerSeconds}s left</span>
      ) : null}
    </div>
  );
}

function getTimerClassName(timerSeconds: number) {
  if (timerSeconds <= 5) {
    return "timer-pill critical";
  }

  if (timerSeconds <= 10) {
    return "timer-pill urgent";
  }

  return "timer-pill";
}
