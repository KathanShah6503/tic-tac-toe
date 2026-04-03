import type { RoomListing } from "../../types";

interface RoomListProps {
  disabled?: boolean;
  rooms: RoomListing[];
  onJoinRoom: (matchId: string) => void;
}

export function RoomList({ disabled = false, rooms, onJoinRoom }: RoomListProps) {
  if (rooms.length === 0) {
    return (
      <div className="empty-state-card">
        <span className="match-status-tag">No Open Challenges</span>
        <p className="empty-copy">No open rooms in this mode yet. Host a room or enter the queue to start the next match.</p>
      </div>
    );
  }

  return (
    <div className="room-list">
      {rooms.map((room) => (
        <button
          key={room.matchId}
          className="room-card"
          disabled={disabled}
          onClick={() => onJoinRoom(room.matchId)}
          type="button"
        >
          <div className="room-card-top">
            <span>{getRoomTitle(room)}</span>
            <span className="room-badge">Open Challenge</span>
          </div>
          <div className="room-card-meta">
            <small>{room.label.mode} mode</small>
            <small>{(room.label.players ?? room.size)}/2 players</small>
          </div>
        </button>
      ))}
    </div>
  );
}

function getRoomTitle(room: RoomListing) {
  const ownerUsername = room.label.ownerUsername?.trim();
  if (ownerUsername) {
    return `${ownerUsername}'s Match`;
  }

  return "Open Match";
}
