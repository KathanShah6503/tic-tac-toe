import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ErrorBanner } from "./components/layout/ErrorBanner";
import type { GameMode } from "./types";
import { GamePanel } from "./components/game/GamePanel";
import { HeroBanner } from "./components/layout/HeroBanner";
import { LeaderboardPanel } from "./components/stats/LeaderboardPanel";
import { LobbyPanel } from "./components/lobby/LobbyPanel";
import { NicknameGate } from "./components/layout/NicknameGate";
import { getSelfPlayer } from "./utils/match";
import { useNakamaGame } from "./hooks/useNakamaGame";

const USERNAME_STORAGE_KEY = "nakama-username";

export default function App() {
  const [nickname, setNickname] = useState(() => window.localStorage.getItem(USERNAME_STORAGE_KEY) ?? "");

  if (!nickname.trim()) {
    return (
      <NicknameGate
        initialValue={nickname}
        onSubmit={(nextNickname) => {
          window.localStorage.setItem(USERNAME_STORAGE_KEY, nextNickname);
          setNickname(nextNickname);
        }}
      />
    );
  }

  return <ConnectedApp key={nickname} />;
}

function ConnectedApp() {
  const { state, actions } = useNakamaGame();
  const [selectedMode, setSelectedMode] = useState<GameMode>("classic");
  const previousStatusRef = useRef(state.status);
  const previousFinishedStatusRef = useRef(state.status);
  const lastRefreshedModeRef = useRef<GameMode | null>(null);
  const refreshLobby = useEffectEvent(() => {
    void actions.refreshRooms(selectedMode);
    void actions.refreshLeaderboard();
  });
  const refreshAfterMatch = useEffectEvent(() => {
    void actions.refreshRooms(selectedMode);
    void actions.refreshLeaderboard();
  });

  useEffect(() => {
    const becameReady = previousStatusRef.current !== "Ready" && state.status === "Ready";
    previousStatusRef.current = state.status;

    if (state.status !== "Ready") {
      return;
    }

    const modeChanged = lastRefreshedModeRef.current !== selectedMode;
    if (!becameReady && !modeChanged) {
      return;
    }

    lastRefreshedModeRef.current = selectedMode;
    refreshLobby();
  }, [refreshLobby, selectedMode, state.status]);

  useEffect(() => {
    const becameFinished = previousFinishedStatusRef.current !== "Finished" && state.status === "Finished";
    previousFinishedStatusRef.current = state.status;

    if (!becameFinished) {
      return;
    }

    refreshAfterMatch();
  }, [refreshAfterMatch, state.status]);

  const selfPlayer = getSelfPlayer(state.matchState, state.selfUserId);
  const hasPendingLobbyAction = state.status === "Authenticating" || state.status === "Matchmaking" || state.status === "Joining";
  const hasLiveMatch = state.status === "Playing" || (state.status === "Joining" && !!state.activeMatchId);
  const isMatchFocusedView =
    state.status === "Matchmaking" || state.status === "Joining" || state.status === "Playing" || state.status === "Finished";
  const lobbyLocked = hasPendingLobbyAction || hasLiveMatch;
  const canRefreshRooms = !!state.session && !hasPendingLobbyAction;
  const canRefreshLeaderboard = !!state.session && state.status !== "Authenticating";
  const lobbyHint = getLobbyHint(state.status, lobbyLocked);

  return (
    <main className="page-shell">
      <HeroBanner isMatchFocused={isMatchFocusedView} username={state.username} />

      {isMatchFocusedView ? (
        <section className="match-stage">
          <GamePanel
            matchState={state.matchState}
            onLeaveMatchView={() => {
              actions.leaveMatchView();
              void actions.refreshRooms(selectedMode);
              void actions.refreshLeaderboard();
            }}
            onQueueAgain={() => {
              const nextMode = state.matchState?.mode ?? selectedMode;
              void actions.startMatchmaking(nextMode);
            }}
            status={state.status}
            selfPlayer={selfPlayer}
            selfUserId={state.selfUserId}
            onPlayMove={(index) => void actions.playMove(index)}
          />
        </section>
      ) : (
        <section className="content-grid">
          <LobbyPanel
            actionHint={lobbyHint}
            actionsDisabled={lobbyLocked}
            joinDisabled={lobbyLocked}
            refreshDisabled={!canRefreshRooms}
            rooms={state.rooms}
            selectedMode={selectedMode}
            onAutoMatchmake={() => void actions.startMatchmaking(selectedMode)}
            onCreateRoom={() => void actions.createRoom(selectedMode)}
            onJoinRoom={(matchId) => void actions.joinRoom(matchId)}
            onRefreshRooms={() => void actions.refreshRooms(selectedMode)}
            onSelectMode={setSelectedMode}
          />
          <LeaderboardPanel
            disabled={!canRefreshLeaderboard}
            leaderboard={state.leaderboard}
            selfUserId={state.selfUserId}
            onRefresh={() => void actions.refreshLeaderboard()}
          />
        </section>
      )}

      <ErrorBanner message={state.error} />
    </main>
  );
}

function getLobbyHint(status: string, lobbyLocked: boolean) {
  if (!lobbyLocked) {
    return "Choose a mode, host a room, or queue for the next available opponent.";
  }

  if (status === "Authenticating") {
    return "Getting everything ready. Your match options will unlock in a moment.";
  }

  if (status === "Matchmaking") {
    return "Searching for an opponent now. Hang tight until the match is found.";
  }

  if (status === "Joining") {
    return "Joining the match now. Give it a moment before trying something else.";
  }

  if (status === "Playing") {
    return "You are already in a match. Finish this round before starting a new one.";
  }

  return "Please wait a moment.";
}
