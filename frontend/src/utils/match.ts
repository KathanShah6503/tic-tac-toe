import { EMPTY_BOARD, TICK_RATE } from "../constants/game";
import type { GameMode, MatchStateView, PlayerView, RoomListing } from "../types";

export function getSelfPlayer(matchState: MatchStateView | null, selfUserId: string | null): PlayerView | null {
  return matchState?.players.find((player) => player.userId === selfUserId) ?? null;
}

export function getCurrentPlayer(matchState: MatchStateView | null): PlayerView | null {
  return matchState?.players.find((player) => player.userId === matchState.currentTurnUserId) ?? null;
}

export function getWinner(matchState: MatchStateView | null): PlayerView | null {
  return matchState?.players.find((player) => player.userId === matchState.winnerUserId) ?? null;
}

export function getTimerSeconds(matchState: MatchStateView | null): number {
  return Math.ceil((matchState?.deadlineRemainingTicks ?? 0) / TICK_RATE);
}

export function canPlayCell(matchState: MatchStateView | null, selfUserId: string | null, index: number): boolean {
  if (!matchState || !selfUserId || !matchState.playing) {
    return false;
  }

  return matchState.currentTurnUserId === selfUserId && matchState.board[index] === null;
}

export function getBoard(matchState: MatchStateView | null) {
  return matchState?.board ?? EMPTY_BOARD;
}

export function inferModeFromRoom(rooms: RoomListing[], matchId: string): GameMode {
  return rooms.find((room) => room.matchId === matchId)?.label.mode ?? "classic";
}

export function getWinningLine(matchState: MatchStateView | null): number[] {
  if (!matchState?.winnerUserId) {
    return [];
  }

  const winner = getWinner(matchState);
  if (!winner) {
    return [];
  }

  const winningPositions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  return (
    winningPositions.find((line) => line.every((index) => matchState.board[index] === winner.mark)) ?? []
  );
}
