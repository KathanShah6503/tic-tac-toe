function ensureWinsLeaderboard(logger: nkruntime.Logger, nk: nkruntime.Nakama): void {
  try {
    nk.leaderboardCreate(
      WINS_LEADERBOARD_ID,
      true,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      null,
      { kind: "wins" },
      true
    );
  } catch (error) {
    logger.debug("wins_global leaderboard already exists or could not be created: %s", String(error));
  }
}

function rpcCreateMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var parsed = safeJsonParse(payload);
  var mode: GameMode = parsed && parsed.mode === "timed" ? "timed" : "classic";
  var matchId = nk.matchCreate(MODULE_NAME, { mode: mode });
  logger.info("Created manual %s match %s for user %s.", mode, matchId, ctx.userId);
  return JSON.stringify({ matchId: matchId, mode: mode });
}

function rpcListMatches(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var parsed = safeJsonParse(payload);
  var modeFilter: GameMode | "" = parsed && parsed.mode === "timed" ? "timed" : parsed && parsed.mode === "classic" ? "classic" : "";
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

function rpcLeaderboardWithStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
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

function matchmakerMatched(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matchedUsers: nkruntime.MatchmakerResult[]
): string {
  var mode: GameMode = "classic";
  if (matchedUsers.length > 0 && matchedUsers[0].properties && matchedUsers[0].properties.mode === "timed") {
    mode = "timed";
  }

  var matchId = nk.matchCreate(MODULE_NAME, { mode: mode });
  logger.info("Matchmaker created %s match %s for %d players.", mode, matchId, matchedUsers.length);
  return matchId;
}
