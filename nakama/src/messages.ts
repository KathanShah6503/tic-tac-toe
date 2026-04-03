var MODULE_NAME = "tic_tac_toe_match";
var WINS_LEADERBOARD_ID = "wins_global";
var PLAYER_STATS_COLLECTION = "player_stats";
var PLAYER_STATS_KEY = "summary";
var MAX_PLAYERS = 2;
var TICK_RATE = 5;
var MAX_EMPTY_TICKS = TICK_RATE * 60;
var TIMED_MODE_SECONDS = 30;

enum OpCode {
  MOVE = 1,
  UPDATE = 2,
  DONE = 3,
  OPPONENT_LEFT = 4,
  ERROR = 5
}

enum Mark {
  X = "X",
  O = "O"
}

type GameMode = "classic" | "timed";

interface MatchLabel {
  mode: GameMode;
  open: boolean;
  players: number;
  ownerUsername?: string;
}

interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  currentStreak: number;
  bestStreak: number;
  lastUpdated: string | null;
}

interface MatchParams {
  mode?: GameMode;
}

interface MatchResultPayload {
  reason: "win" | "draw" | "timeout" | "forfeit";
  winnerUserId: string | null;
  loserUserId: string | null;
}

interface MatchState {
  matchId: string;
  presences: { [userId: string]: nkruntime.Presence };
  playerOrder: string[];
  ownerUserId: string | null;
  ownerUsername: string | null;
  joinsInProgress: number;
  board: Array<Mark | null>;
  mark: Mark;
  deadlineRemainingTicks: number;
  playing: boolean;
  emptyTicks: number;
  mode: GameMode;
  winnerUserId: string | null;
  loserUserId: string | null;
  resultReason: MatchResultPayload["reason"] | null;
}
