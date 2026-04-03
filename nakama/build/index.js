"use strict";
var MODULE_NAME = "tic_tac_toe_match";
var WINS_LEADERBOARD_ID = "wins_global";
var PLAYER_STATS_COLLECTION = "player_stats";
var PLAYER_STATS_KEY = "summary";
var MAX_PLAYERS = 2;
var TICK_RATE = 5;
var MAX_EMPTY_TICKS = TICK_RATE * 60;
var TIMED_MODE_SECONDS = 30;
var OpCode;
(function (OpCode) {
    OpCode[OpCode["MOVE"] = 1] = "MOVE";
    OpCode[OpCode["UPDATE"] = 2] = "UPDATE";
    OpCode[OpCode["DONE"] = 3] = "DONE";
    OpCode[OpCode["OPPONENT_LEFT"] = 4] = "OPPONENT_LEFT";
    OpCode[OpCode["ERROR"] = 5] = "ERROR";
})(OpCode || (OpCode = {}));
var Mark;
(function (Mark) {
    Mark["X"] = "X";
    Mark["O"] = "O";
})(Mark || (Mark = {}));
function ensureWinsLeaderboard(logger, nk) {
    try {
        nk.leaderboardCreate(WINS_LEADERBOARD_ID, true, "descending" /* nkruntime.SortOrder.DESCENDING */, "increment" /* nkruntime.Operator.INCREMENTAL */, null, { kind: "wins" }, true);
    }
    catch (error) {
        logger.debug("wins_global leaderboard already exists or could not be created: %s", String(error));
    }
}
function rpcCreateMatch(ctx, logger, nk, payload) {
    var parsed = safeJsonParse(payload);
    var mode = parsed && parsed.mode === "timed" ? "timed" : "classic";
    var matchId = nk.matchCreate(MODULE_NAME, { mode: mode });
    logger.info("Created manual %s match %s for user %s.", mode, matchId, ctx.userId);
    return JSON.stringify({ matchId: matchId, mode: mode });
}
function rpcListMatches(ctx, logger, nk, payload) {
    var parsed = safeJsonParse(payload);
    var modeFilter = parsed && parsed.mode === "timed" ? "timed" : parsed && parsed.mode === "classic" ? "classic" : "";
    var matches = nk.matchList(100, true, "", 0, MAX_PLAYERS, "");
    return JSON.stringify({
        matches: matches
            .map(function (match) {
            return {
                matchId: match.matchId,
                size: match.size,
                authoritative: match.authoritative,
                label: safeJsonParse(match.label || "{}")
            };
        })
            .filter(function (match) {
            var label = match.label || {};
            if (!label.open || !label.players || label.players <= 0) {
                return false;
            }
            if (!modeFilter) {
                return true;
            }
            return label.mode === modeFilter;
        })
            .slice(0, 20)
    });
}
function rpcLeaderboardWithStats(ctx, logger, nk, payload) {
    var parsed = safeJsonParse(payload);
    var limit = parsed && typeof parsed.limit === "number" ? parsed.limit : 10;
    var records = nk.leaderboardRecordsList(WINS_LEADERBOARD_ID, [], limit, undefined, 0).records || [];
    return JSON.stringify({
        entries: records.map(function (record) {
            var ownerId = record.ownerId || "";
            var stats = ownerId ? readPlayerStats(nk, ownerId) : createEmptyPlayerStats();
            return {
                ownerId: ownerId,
                username: record.username || ownerId,
                rank: record.rank || 0,
                score: record.score || 0,
                wins: stats.wins,
                losses: stats.losses,
                draws: stats.draws,
                totalGames: stats.totalGames,
                currentStreak: stats.currentStreak,
                bestStreak: stats.bestStreak,
                lastUpdated: stats.lastUpdated
            };
        })
    });
}
function matchmakerMatched(ctx, logger, nk, matchedUsers) {
    var mode = "classic";
    if (matchedUsers.length > 0 && matchedUsers[0].properties && matchedUsers[0].properties.mode === "timed") {
        mode = "timed";
    }
    var matchId = nk.matchCreate(MODULE_NAME, { mode: mode });
    logger.info("Matchmaker created %s match %s for %d players.", mode, matchId, matchedUsers.length);
    return matchId;
}
function matchInit(ctx, logger, nk, params) {
    var mode = params && params.mode === "timed" ? "timed" : "classic";
    var state = {
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
function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
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
function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
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
function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
    var quitterUserId = null;
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
function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
    if (countConnectedPlayers(state) === 0) {
        state.emptyTicks += 1;
        if (state.emptyTicks >= MAX_EMPTY_TICKS) {
            return null;
        }
    }
    else {
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
function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state, data: data };
}
function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    state.playing = false;
    broadcastState(dispatcher, state, OpCode.DONE, null);
    return { state: state };
}
function maybeStartGame(state) {
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
function finalizeMatch(ctx, logger, nk, dispatcher, state, result) {
    state.playing = false;
    state.winnerUserId = result.winnerUserId;
    state.loserUserId = result.loserUserId;
    state.resultReason = result.reason;
    state.deadlineRemainingTicks = 0;
    if (result.reason === "forfeit") {
        dispatcher.broadcastMessage(OpCode.OPPONENT_LEFT, JSON.stringify(toClientState(state)), null, null, true);
    }
    else {
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
function updatePlayerStats(nk, winnerUserId, loserUserId) {
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
function updateDrawStats(nk, userIds) {
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
function readPlayerStats(nk, userId) {
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
function writePlayerStats(nk, userId, stats) {
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
function createEmptyPlayerStats() {
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
function writeWin(logger, nk, userId) {
    try {
        var username = getUsernameForUserId(logger, nk, userId);
        nk.leaderboardRecordWrite(WINS_LEADERBOARD_ID, userId, username, 1, 0, undefined, "increment" /* nkruntime.OverrideOperator.INCREMENTAL */);
    }
    catch (error) {
        logger.error("Unable to write leaderboard record for %s: %s", userId, String(error));
    }
}
function getUsernameForUserId(logger, nk, userId) {
    try {
        var account = nk.accountGetId(userId);
        if (account.user && account.user.username) {
            return account.user.username;
        }
    }
    catch (error) {
        logger.warn("Unable to fetch account for leaderboard username lookup %s: %s", userId, String(error));
    }
    try {
        var users = nk.usersGetId([userId]);
        if (users.length > 0 && users[0].username) {
            return users[0].username;
        }
    }
    catch (error) {
        logger.warn("Unable to fetch user for leaderboard username lookup %s: %s", userId, String(error));
    }
    return userId;
}
function sendError(dispatcher, message, presences) {
    dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: message }), presences, null, true);
}
function broadcastState(dispatcher, state, opCode, presences) {
    dispatcher.broadcastMessage(opCode, JSON.stringify(toClientState(state)), presences, null, true);
}
function broadcastStateDeferred(dispatcher, state, opCode, presences) {
    dispatcher.broadcastMessageDeferred(opCode, JSON.stringify(toClientState(state)), presences, undefined, true);
}
function toClientState(state) {
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
function parseMatchMessage(nk, value) {
    try {
        return JSON.parse(nk.binaryToString(value));
    }
    catch (error) {
        return null;
    }
}
function buildLabel(state) {
    var connectedPlayers = countConnectedPlayers(state);
    return {
        mode: state.mode,
        open: connectedPlayers > 0 && connectedPlayers < MAX_PLAYERS,
        players: connectedPlayers,
        ownerUsername: state.ownerUsername || undefined
    };
}
function createEmptyBoard() {
    return [null, null, null, null, null, null, null, null, null];
}
function countConnectedPlayers(state) {
    return Object.keys(state.presences).length;
}
function getCurrentTurnUserId(state) {
    if (state.playerOrder.length < MAX_PLAYERS) {
        return null;
    }
    return state.mark === Mark.X ? state.playerOrder[0] : state.playerOrder[1];
}
function getOpponentUserId(state, userId) {
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
function getDeadlineTicks(mode) {
    return mode === "timed" ? TIMED_MODE_SECONDS * TICK_RATE : 0;
}
function isPlayersTurn(state, userId) {
    return getCurrentTurnUserId(state) === userId;
}
function isValidMove(state, position) {
    return position >= 0 && position < state.board.length && state.board[position] === null;
}
function hasWinner(board, mark) {
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
function isDraw(board) {
    for (var i = 0; i < board.length; i += 1) {
        if (board[i] === null) {
            return false;
        }
    }
    return true;
}
function safeJsonParse(value) {
    if (!value) {
        return null;
    }
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    }
    catch (error) {
        return null;
    }
}
function InitModule(ctx, logger, nk, initializer) {
    ensureWinsLeaderboard(logger, nk);
    initializer.registerRpc("create_match", rpcCreateMatch);
    initializer.registerRpc("list_matches", rpcListMatches);
    initializer.registerRpc("leaderboard_with_stats", rpcLeaderboardWithStats);
    initializer.registerMatchmakerMatched(matchmakerMatched);
    initializer.registerMatch(MODULE_NAME, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchSignal: matchSignal,
        matchTerminate: matchTerminate
    });
    logger.info("Initialising Tic-Tac-Toe runtime module.");
}
