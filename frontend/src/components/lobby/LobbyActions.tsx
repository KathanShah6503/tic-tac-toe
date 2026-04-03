interface LobbyActionsProps {
  actionsDisabled?: boolean;
  refreshDisabled?: boolean;
  onAutoMatchmake: () => void;
  onCreateRoom: () => void;
  onRefreshRooms: () => void;
}

export function LobbyActions({
  actionsDisabled = false,
  refreshDisabled = false,
  onAutoMatchmake,
  onCreateRoom,
  onRefreshRooms,
}: LobbyActionsProps) {
  return (
    <div className="action-row">
      <button className="action-button primary-cta" disabled={actionsDisabled} onClick={onAutoMatchmake} type="button">
        Queue Match
      </button>
      <button className="action-button secondary-action" disabled={actionsDisabled} onClick={onCreateRoom} type="button">
        Host Room
      </button>
      <button className="action-button tertiary-action" disabled={refreshDisabled} onClick={onRefreshRooms} type="button">
        Refresh List
      </button>
    </div>
  );
}
