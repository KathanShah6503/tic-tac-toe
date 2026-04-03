export type GameMode = "classic" | "timed";
export type Mark = "X" | "O";

export const OP_CODES = {
  MOVE: 1,
  UPDATE: 2,
  DONE: 3,
  OPPONENT_LEFT: 4,
  ERROR: 5,
} as const;

export interface PlayerView {
  userId: string;
  username: string;
  mark: Mark;
  connected: boolean;
}

export interface MatchStateView {
  matchId?: string | null;
  board: Array<Mark | null>;
  currentMark: Mark;
  currentTurnUserId: string | null;
  deadlineRemainingTicks: number;
  mode: GameMode;
  playing: boolean;
  winnerUserId: string | null;
  loserUserId: string | null;
  resultReason: "win" | "draw" | "timeout" | "forfeit" | null;
  players: PlayerView[];
}

export interface RoomListing {
  matchId: string;
  size: number;
  authoritative: boolean;
  label: {
    mode?: GameMode;
    open?: boolean;
    players?: number;
    ownerUsername?: string;
  };
}

export interface LeaderboardRow {
  ownerId: string;
  username?: string;
  score: number;
  rank?: number;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  currentStreak: number;
  bestStreak: number;
  lastUpdated?: string | null;
}
