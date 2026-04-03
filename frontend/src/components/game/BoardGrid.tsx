import type { MatchStateView } from "../../types";
import { canPlayCell, getBoard, getWinningLine } from "../../utils/match";

interface BoardGridProps {
  matchState: MatchStateView | null;
  selfUserId: string | null;
  onPlayMove: (index: number) => void;
}

export function BoardGrid({ matchState, selfUserId, onPlayMove }: BoardGridProps) {
  const winningLine = getWinningLine(matchState);

  return (
    <div className={winningLine.length > 0 ? "board board-complete" : "board"}>
      {getBoard(matchState).map((cell, index) => (
        <button
          key={index}
          className={winningLine.includes(index) ? "cell cell-winning" : "cell"}
          disabled={!canPlayCell(matchState, selfUserId, index)}
          onClick={() => onPlayMove(index)}
          type="button"
        >
          {cell ? <span className={cell === "X" ? "board-mark mark-x" : "board-mark mark-o"}>{cell}</span> : null}
        </button>
      ))}
    </div>
  );
}
