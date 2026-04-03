import type { LeaderboardRow } from "../../types";

interface LeaderboardPanelProps {
  disabled?: boolean;
  leaderboard: LeaderboardRow[];
  selfUserId: string | null;
  onRefresh: () => void;
}

export function LeaderboardPanel({ disabled = false, leaderboard, selfUserId, onRefresh }: LeaderboardPanelProps) {
  return (
    <div className="panel leaderboard-panel">
      <div className="panel-header leaderboard-header">
        <div className="panel-header panel-header-stack">
          <h2>Rankings</h2>
          <small className="panel-subtitle">Top players and current form</small>
        </div>
        <button className="action-button tertiary-action" disabled={disabled} onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>
      <div className="leaderboard">
        {leaderboard.length === 0 ? (
          <div className="empty-state-card">
            <span className="match-status-tag">No Results Yet</span>
            <p className="empty-copy">No ranked wins yet. Play a few rounds to get the board moving.</p>
          </div>
        ) : (
          leaderboard.map((entry) => (
            <article key={entry.ownerId} className={entry.ownerId === selfUserId ? "leaderboard-row self" : "leaderboard-row"}>
              <div className="leaderboard-main">
                <strong className="leaderboard-name">
                  #{entry.rank ?? "-"} {entry.username ?? entry.ownerId.slice(0, 8)}
                  {entry.ownerId === selfUserId ? " (you)" : ""}
                </strong>
                <div className="leaderboard-stats">
                  <small>W/L/D {entry.wins}/{entry.losses}/{entry.draws}</small>
                  <small>Best streak {entry.bestStreak}</small>
                </div>
              </div>
              <div className="leaderboard-meta">
                <small>Streak {entry.currentStreak}</small>
                <strong>{entry.score} pts</strong>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
