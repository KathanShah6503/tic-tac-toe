function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
): void {
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
