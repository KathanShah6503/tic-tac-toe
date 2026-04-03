function matchInit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: MatchParams
): { state: MatchState; tickRate: number; label: string } {
  var mode: GameMode = params && params.mode === "timed" ? "timed" : "classic";
  var state: MatchState = {
    matchId: ctx.matchId || "",
    presences: {},
    playerOrder: [],
    ownerUserId: null,
    ownerUsername: null,
    joinsInProgress: 0,
    board: createEmptyBoard(),
    mark: Mark.X,
    deadlineRemainingTicks: getDeadlineTicks(mode),
    playing: false,
    emptyTicks: 0,
    mode: mode,
    winnerUserId: null,
    loserUserId: null,
    resultReason: null
  };

  return {
    state: state,
    tickRate: TICK_RATE,
    label: JSON.stringify(buildLabel(state))
  };
}

function matchJoinAttempt(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any }
): { state: MatchState; accept: boolean; rejectMessage?: string } {
  var alreadyTracked = !!state.presences[presence.userId];
  if (!alreadyTracked && state.playerOrder.length + state.joinsInProgress >= MAX_PLAYERS) {
    return {
      state: state,
      accept: false,
      rejectMessage: "Match is full."
    };
  }

  state.joinsInProgress += 1;
  return { state: state, accept: true };
}

function matchJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } {
  for (var i = 0; i < presences.length; i += 1) {
    var presence = presences[i];
    state.joinsInProgress = Math.max(0, state.joinsInProgress - 1);
    state.presences[presence.userId] = presence;
    if (state.playerOrder.indexOf(presence.userId) === -1) {
      state.playerOrder.push(presence.userId);
    }

    if (!state.ownerUserId) {
      state.ownerUserId = presence.userId;
      state.ownerUsername = presence.username || "Player";
    }
  }

  maybeStartGame(state);
  dispatcher.matchLabelUpdate(JSON.stringify(buildLabel(state)));
  broadcastStateDeferred(dispatcher, state, OpCode.UPDATE, null);
  return { state: state };
}

function matchLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  presences: nkruntime.Presence[]
): { state: MatchState } {
  var quitterUserId: string | null = null;
  for (var i = 0; i < presences.length; i += 1) {
    quitterUserId = presences[i].userId;
    delete state.presences[presences[i].userId];
    state.playerOrder = state.playerOrder.filter(function (userId) {
      return userId !== presences[i].userId;
    });
  }

  if (state.playing && countConnectedPlayers(state) < MAX_PLAYERS) {
    finalizeMatch(ctx, logger, nk, dispatcher, state, {
      reason: "forfeit",
      winnerUserId: getOpponentUserId(state, quitterUserId),
      loserUserId: quitterUserId
    });
  }

  dispatcher.matchLabelUpdate(JSON.stringify(buildLabel(state)));
  return { state: state };
}

function matchLoop(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  messages: nkruntime.MatchMessage[]
): { state: MatchState } | null {
  if (countConnectedPlayers(state) === 0) {
    state.emptyTicks += 1;
    if (state.emptyTicks >= MAX_EMPTY_TICKS) {
      return null;
    }
  } else {
    state.emptyTicks = 0;
  }

  for (var i = 0; i < messages.length; i += 1) {
    var message = messages[i];
    if (message.opCode !== OpCode.MOVE) {
      continue;
    }

    if (!state.playing) {
      sendError(dispatcher, "Match is not active.", [message.sender]);
      continue;
    }

    if (!isPlayersTurn(state, message.sender.userId)) {
      sendError(dispatcher, "It is not your turn.", [message.sender]);
      continue;
    }

    var payload = parseMatchMessage(nk, message.data);
    var position = payload ? payload.position : -1;
    if (!isValidMove(state, position)) {
      sendError(dispatcher, "Invalid move.", [message.sender]);
      continue;
    }

    state.board[position] = state.mark;

    if (hasWinner(state.board, state.mark)) {
      finalizeMatch(ctx, logger, nk, dispatcher, state, {
        reason: "win",
        winnerUserId: message.sender.userId,
        loserUserId: getOpponentUserId(state, message.sender.userId)
      });
      dispatcher.matchLabelUpdate(JSON.stringify(buildLabel(state)));
      return { state: state };
    }

    if (isDraw(state.board)) {
      finalizeMatch(ctx, logger, nk, dispatcher, state, {
        reason: "draw",
        winnerUserId: null,
        loserUserId: null
      });
      dispatcher.matchLabelUpdate(JSON.stringify(buildLabel(state)));
      return { state: state };
    }

    state.mark = state.mark === Mark.X ? Mark.O : Mark.X;
    state.deadlineRemainingTicks = getDeadlineTicks(state.mode);
    broadcastState(dispatcher, state, OpCode.UPDATE, null);
  }

  if (state.playing && state.mode === "timed") {
    state.deadlineRemainingTicks -= 1;
    if (state.deadlineRemainingTicks <= 0) {
      var timedOutUserId = getCurrentTurnUserId(state);
      finalizeMatch(ctx, logger, nk, dispatcher, state, {
        reason: "timeout",
        winnerUserId: getOpponentUserId(state, timedOutUserId),
        loserUserId: timedOutUserId
      });
      dispatcher.matchLabelUpdate(JSON.stringify(buildLabel(state)));
      return { state: state };
    }

    broadcastState(dispatcher, state, OpCode.UPDATE, null);
  }

  return { state: state };
}

function matchSignal(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  data: string
): { state: MatchState; data?: string } {
  return { state: state, data: data };
}

function matchTerminate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: MatchState,
  graceSeconds: number
): { state: MatchState } {
  state.playing = false;
  broadcastState(dispatcher, state, OpCode.DONE, null);
  return { state: state };
}

function maybeStartGame(state: MatchState): void {
  if (state.playerOrder.length < MAX_PLAYERS || state.playing) {
    return;
  }

  state.board = createEmptyBoard();
  state.mark = Mark.X;
  state.deadlineRemainingTicks = getDeadlineTicks(state.mode);
  state.playing = true;
  state.winnerUserId = null;
  state.loserUserId = null;
  state.resultReason = null;
}

function finalizeMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
  result: MatchResultPayload
): void {
  state.playing = false;
  state.winnerUserId = result.winnerUserId;
  state.loserUserId = result.loserUserId;
  state.resultReason = result.reason;
  state.deadlineRemainingTicks = 0;

  if (result.reason === "forfeit") {
    dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, JSON.stringify(toClientState(state)), null, null, true);
  } else {
    dispatcher.broadcastMessage(OpCode.DONE, JSON.stringify(toClientState(state)), null, null, true);
  }

  if (result.winnerUserId) {
    writeWin(logger, nk, result.winnerUserId);
  }

  if (result.winnerUserId || result.loserUserId) {
    updatePlayerStats(nk, result.winnerUserId, result.loserUserId);
  }

  if (result.reason === "draw") {
    updateDrawStats(nk, state.playerOrder);
  }
}

function updatePlayerStats(nk: nkruntime.Nakama, winnerUserId: string | null, loserUserId: string | null): void {
  if (winnerUserId) {
    var winnerStats = readPlayerStats(nk, winnerUserId);
    winnerStats.wins += 1;
    winnerStats.totalGames += 1;
    winnerStats.currentStreak += 1;
    winnerStats.bestStreak = Math.max(winnerStats.bestStreak, winnerStats.currentStreak);
    winnerStats.lastUpdated = new Date().toISOString();
    writePlayerStats(nk, winnerUserId, winnerStats);
  }

  if (loserUserId) {
    var loserStats = readPlayerStats(nk, loserUserId);
    loserStats.losses += 1;
    loserStats.totalGames += 1;
    loserStats.currentStreak = 0;
    loserStats.lastUpdated = new Date().toISOString();
    writePlayerStats(nk, loserUserId, loserStats);
  }
}

function updateDrawStats(nk: nkruntime.Nakama, userIds: string[]): void {
  for (var i = 0; i < userIds.length; i += 1) {
    var userId = userIds[i];
    var stats = readPlayerStats(nk, userId);
    stats.draws += 1;
    stats.totalGames += 1;
    stats.currentStreak = 0;
    stats.lastUpdated = new Date().toISOString();
    writePlayerStats(nk, userId, stats);
  }
}

function readPlayerStats(nk: nkruntime.Nakama, userId: string): PlayerStats {
  var records = nk.storageRead([
    {
      collection: PLAYER_STATS_COLLECTION,
      key: PLAYER_STATS_KEY,
      userId: userId
    }
  ]);

  if (records.length === 0) {
    return createEmptyPlayerStats();
  }

  var stats = safeJsonParse(records[0].value) || {};
  var wins = typeof stats.wins === "number" ? stats.wins : 0;
  var losses = typeof stats.losses === "number" ? stats.losses : 0;
  var draws = typeof stats.draws === "number" ? stats.draws : 0;

  return {
    wins: wins,
    losses: losses,
    draws: draws,
    totalGames: typeof stats.totalGames === "number" ? stats.totalGames : wins + losses + draws,
    currentStreak: typeof stats.currentStreak === "number" ? stats.currentStreak : 0,
    bestStreak: typeof stats.bestStreak === "number" ? stats.bestStreak : 0,
    lastUpdated: typeof stats.lastUpdated === "string" ? stats.lastUpdated : null
  };
}

function writePlayerStats(nk: nkruntime.Nakama, userId: string, stats: PlayerStats): void {
  nk.storageWrite([
    {
      collection: PLAYER_STATS_COLLECTION,
      key: PLAYER_STATS_KEY,
      userId: userId,
      value: stats,
      permissionRead: 2,
      permissionWrite: 0
    }
  ]);
}

function createEmptyPlayerStats(): PlayerStats {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastUpdated: null
  };
}

function writeWin(logger: nkruntime.Logger, nk: nkruntime.Nakama, userId: string): void {
  try {
    var username = getUsernameForUserId(logger, nk, userId);
    nk.leaderboardRecordWrite(
      WINS_LEADERBOARD_ID,
      userId,
      username,
      1,
      0,
      undefined,
      nkruntime.OverrideOperator.INCREMENTAL
    );
  } catch (error) {
    logger.error("Unable to write leaderboard record for %s: %s", userId, String(error));
  }
}

function getUsernameForUserId(logger: nkruntime.Logger, nk: nkruntime.Nakama, userId: string): string {
  try {
    var account = nk.accountGetId(userId);
    if (account.user && account.user.username) {
      return account.user.username;
    }
  } catch (error) {
    logger.warn("Unable to fetch account for leaderboard username lookup %s: %s", userId, String(error));
  }

  try {
    var users = nk.usersGetId([userId]);
    if (users.length > 0 && users[0].username) {
      return users[0].username;
    }
  } catch (error) {
    logger.warn("Unable to fetch user for leaderboard username lookup %s: %s", userId, String(error));
  }

  return userId;
}

function sendError(dispatcher: nkruntime.MatchDispatcher, message: string, presences: nkruntime.Presence[]): void {
  dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: message }), presences, null, true);
}

function broadcastState(
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
  opCode: OpCode,
  presences: nkruntime.Presence[] | null
): void {
  dispatcher.broadcastMessage(opCode, JSON.stringify(toClientState(state)), presences, null, true);
}

function broadcastStateDeferred(
  dispatcher: nkruntime.MatchDispatcher,
  state: MatchState,
  opCode: OpCode,
  presences: nkruntime.Presence[] | null
): void {
  dispatcher.broadcastMessageDeferred(opCode, JSON.stringify(toClientState(state)), presences, undefined, true);
}

function toClientState(state: MatchState): { [key: string]: any } {
  return {
    matchId: state.matchId,
    board: state.board,
    currentMark: state.mark,
    currentTurnUserId: getCurrentTurnUserId(state),
    deadlineRemainingTicks: state.deadlineRemainingTicks,
    mode: state.mode,
    playing: state.playing,
    winnerUserId: state.winnerUserId,
    loserUserId: state.loserUserId,
    resultReason: state.resultReason,
    players: state.playerOrder.map(function (userId, index) {
      var presence = state.presences[userId];
      return {
        userId: userId,
        username: presence ? presence.username : "Disconnected",
        mark: index === 0 ? Mark.X : Mark.O,
        connected: !!presence
      };
    })
  };
}

function parseMatchMessage(nk: nkruntime.Nakama, value: ArrayBuffer): any {
  try {
    return JSON.parse(nk.binaryToString(value));
  } catch (error) {
    return null;
  }
}

function buildLabel(state: MatchState): MatchLabel {
  var connectedPlayers = countConnectedPlayers(state);
  return {
    mode: state.mode,
    open: connectedPlayers > 0 && connectedPlayers < MAX_PLAYERS,
    players: connectedPlayers,
    ownerUsername: state.ownerUsername || undefined
  };
}

function createEmptyBoard(): Array<Mark | null> {
  return [null, null, null, null, null, null, null, null, null];
}

function countConnectedPlayers(state: MatchState): number {
  return Object.keys(state.presences).length;
}

function getCurrentTurnUserId(state: MatchState): string | null {
  if (state.playerOrder.length < MAX_PLAYERS) {
    return null;
  }

  return state.mark === Mark.X ? state.playerOrder[0] : state.playerOrder[1];
}

function getOpponentUserId(state: MatchState, userId: string | null): string | null {
  if (!userId) {
    return null;
  }

  for (var i = 0; i < state.playerOrder.length; i += 1) {
    if (state.playerOrder[i] !== userId) {
      return state.playerOrder[i];
    }
  }

  return null;
}

function getDeadlineTicks(mode: GameMode): number {
  return mode === "timed" ? TIMED_MODE_SECONDS * TICK_RATE : 0;
}

function isPlayersTurn(state: MatchState, userId: string): boolean {
  return getCurrentTurnUserId(state) === userId;
}

function isValidMove(state: MatchState, position: number): boolean {
  return position >= 0 && position < state.board.length && state.board[position] === null;
}

function hasWinner(board: Array<Mark | null>, mark: Mark): boolean {
  var winningPositions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (var i = 0; i < winningPositions.length; i += 1) {
    var line = winningPositions[i];
    if (board[line[0]] === mark && board[line[1]] === mark && board[line[2]] === mark) {
      return true;
    }
  }

  return false;
}

function isDraw(board: Array<Mark | null>): boolean {
  for (var i = 0; i < board.length; i += 1) {
    if (board[i] === null) {
      return false;
    }
  }

  return true;
}

function safeJsonParse(value: any): any {
  if (!value) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}
