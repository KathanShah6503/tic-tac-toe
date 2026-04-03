import type { GameMode, RoomListing } from "../../types";
import { LobbyActions } from "./LobbyActions";
import { ModeSelector } from "./ModeSelector";
import { RoomList } from "./RoomList";

interface LobbyPanelProps {
  actionHint: string;
  actionsDisabled?: boolean;
  joinDisabled?: boolean;
  refreshDisabled?: boolean;
  rooms: RoomListing[];
  selectedMode: GameMode;
  onAutoMatchmake: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (matchId: string) => void;
  onRefreshRooms: () => void;
  onSelectMode: (mode: GameMode) => void;
}

export function LobbyPanel({
  actionHint,
  actionsDisabled = false,
  joinDisabled = false,
  refreshDisabled = false,
  rooms,
  selectedMode,
  onAutoMatchmake,
  onCreateRoom,
  onJoinRoom,
  onRefreshRooms,
  onSelectMode,
}: LobbyPanelProps) {
  return (
    <div className="panel lobby-panel">
      <div className="panel-header panel-header-stack">
        <h2>Find a Game</h2>
        <small className="panel-subtitle">Open challenges and live queue</small>
      </div>
      <ModeSelector disabled={actionsDisabled} selectedMode={selectedMode} onSelectMode={onSelectMode} />
      <p className="panel-note">{actionHint}</p>
      <LobbyActions
        actionsDisabled={actionsDisabled}
        refreshDisabled={refreshDisabled}
        onAutoMatchmake={onAutoMatchmake}
        onCreateRoom={onCreateRoom}
        onRefreshRooms={onRefreshRooms}
      />
      <RoomList disabled={joinDisabled} rooms={rooms} onJoinRoom={onJoinRoom} />
    </div>
  );
}
