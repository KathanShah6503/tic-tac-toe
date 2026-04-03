import { useEffect, useReducer, useRef } from "react";
import type { Session, Socket } from "@heroiclabs/nakama-js";
import { getDeviceId, nakamaClient, nakamaConfig } from "../lib/nakama";
import { OP_CODES, type GameMode, type LeaderboardRow, type MatchStateView, type RoomListing } from "../types";

type Status = "Idle" | "Authenticating" | "Ready" | "Matchmaking" | "Joining" | "Playing" | "Finished" | "Error";

interface State {
  status: Status;
  session: Session | null;
  socket: Socket | null;
  selfUserId: string | null;
  username: string;
  error: string | null;
  activeMatchId: string | null;
  matchState: MatchStateView | null;
  rooms: RoomListing[];
  leaderboard: LeaderboardRow[];
}

type Action =
  | { type: "status"; status: Status }
  | { type: "connected"; session: Session; socket: Socket; username: string; selfUserId: string }
  | { type: "active_match"; activeMatchId: string | null }
  | { type: "clear_match" }
  | { type: "rooms"; rooms: RoomListing[] }
  | { type: "leaderboard"; leaderboard: LeaderboardRow[] }
  | { type: "match_state"; matchState: MatchStateView; status?: Status; activeMatchId?: string | null }
  | { type: "error"; message: string }
  | { type: "clear_error" };

const initialState: State = {
  status: "Idle",
  session: null,
  socket: null,
  selfUserId: null,
  username: "",
  error: null,
  activeMatchId: null,
  matchState: null,
  rooms: [],
  leaderboard: [],
};

const SOCKET_CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_DISCONNECT_GRACE_MS = 250;
const USERNAME_STORAGE_KEY = "nakama-username";

type SharedConnection = {
  session: Session;
  socket: Socket;
  username: string;
  selfUserId: string;
};

const subscribers = new Set<(action: Action) => void>();
let sharedConnection: SharedConnection | null = null;
let sharedConnectionPromise: Promise<SharedConnection> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let handlersBound = false;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "status":
      return { ...state, status: action.status };
    case "connected":
      return {
        ...state,
        session: action.session,
        socket: action.socket,
        selfUserId: action.selfUserId,
        username: action.username,
        status: "Ready",
      };
    case "rooms":
      return { ...state, rooms: action.rooms };
    case "leaderboard":
      return { ...state, leaderboard: action.leaderboard };
    case "active_match":
      return {
        ...state,
        activeMatchId: action.activeMatchId,
      };
    case "clear_match":
      return {
        ...state,
        activeMatchId: null,
        matchState: null,
        status: "Ready",
      };
    case "match_state":
      return {
        ...state,
        matchState: action.matchState,
        status: action.status ?? deriveStatusFromMatchState(action.matchState),
        activeMatchId: action.activeMatchId ?? action.matchState.matchId ?? state.activeMatchId,
      };
    case "error":
      return { ...state, error: action.message };
    case "clear_error":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useNakamaGame() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const storedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";

    let active = true;
    subscribers.add(dispatch);

    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }

    if (sharedConnection) {
      socketRef.current = sharedConnection.socket;
      dispatch({
        type: "connected",
        session: sharedConnection.session,
        socket: sharedConnection.socket,
        username: sharedConnection.username,
        selfUserId: sharedConnection.selfUserId,
      });
    } else {
      dispatch({ type: "status", status: "Authenticating" });

      void getSharedConnection(storedUsername)
        .then((connection) => {
          if (!active) {
            return;
          }

          socketRef.current = connection.socket;
          dispatch({
            type: "connected",
            session: connection.session,
            socket: connection.socket,
            username: connection.username,
            selfUserId: connection.selfUserId,
          });
        })
        .catch((error) => {
          if (!active) {
            return;
          }

          dispatch({
            type: "error",
            message: formatConnectionError(error),
          });
        });
    }

    return () => {
      active = false;
      subscribers.delete(dispatch);
      scheduleSharedDisconnect();
    };
  }, []);

  async function refreshRooms(mode?: GameMode) {
    await runAction(async () => {
      if (!state.session) {
        return;
      }

      const response = await nakamaClient.rpc(state.session, "list_matches", mode ? { mode } : {});
      const payload = decodePayload(response.payload) as { matches?: RoomListing[] } | null;
      const rooms =
        payload?.matches?.map((match) => ({
          matchId: match.matchId ?? "",
          size: match.size ?? 0,
          authoritative: match.authoritative ?? true,
          label: match.label ?? {},
        })) ?? [];
      dispatch({ type: "rooms", rooms: rooms.filter((room) => room.matchId) });
    });
  }

  async function refreshLeaderboard() {
    await runAction(async () => {
      if (!state.session) {
        return;
      }

      const response = await nakamaClient.rpc(state.session, "leaderboard_with_stats", { limit: 10 });
      const payload = decodePayload(response.payload) as { entries?: LeaderboardRow[] } | null;
      const leaderboard =
        payload?.entries?.map((entry) => ({
          ownerId: entry.ownerId ?? "unknown",
          username: entry.username,
          score: Number(entry.score ?? 0),
          rank: entry.rank,
          wins: Number(entry.wins ?? 0),
          losses: Number(entry.losses ?? 0),
          draws: Number(entry.draws ?? 0),
          totalGames: Number(entry.totalGames ?? 0),
          currentStreak: Number(entry.currentStreak ?? 0),
          bestStreak: Number(entry.bestStreak ?? 0),
          lastUpdated: entry.lastUpdated ?? null,
        })) ?? [];
      dispatch({ type: "leaderboard", leaderboard });
    });
  }

  async function createRoom(mode: GameMode) {
    await runAction(async () => {
      if (!state.session || !socketRef.current) {
        return;
      }

      assertLobbyActionAllowed(state.status);
      dispatch({ type: "clear_error" });
      dispatch({ type: "status", status: "Joining" });
      const response = await nakamaClient.rpc(state.session, "create_match", { mode });
      const payload = decodePayload(response.payload) as { matchId: string } | null;
      if (!payload?.matchId) {
        throw new Error("We couldn't open a room right now. Please try again.");
      }

      const joined = await socketRef.current.joinMatch(payload.matchId);
      dispatch({
        type: "active_match",
        activeMatchId: joined.match_id ?? payload.matchId,
      });
    });
  }

  async function joinRoom(matchId: string) {
    await runAction(async () => {
      if (!socketRef.current) {
        return;
      }

      assertLobbyActionAllowed(state.status);
      dispatch({ type: "clear_error" });
      dispatch({ type: "status", status: "Joining" });
      const joined = await socketRef.current.joinMatch(matchId);
      dispatch({
        type: "active_match",
        activeMatchId: joined.match_id ?? matchId,
      });
    });
  }

  async function startMatchmaking(mode: GameMode) {
    await runAction(async () => {
      if (!state.session || !socketRef.current) {
        return;
      }

      assertLobbyActionAllowed(state.status);
      dispatch({ type: "clear_error" });
      const response = await nakamaClient.rpc(state.session, "list_matches", { mode });
      const payload = decodePayload(response.payload) as { matches?: RoomListing[] } | null;
      const openRoom = payload?.matches?.find((room) => room.matchId);

      if (openRoom?.matchId) {
        dispatch({ type: "status", status: "Joining" });
        const joined = await socketRef.current.joinMatch(openRoom.matchId);
        dispatch({
          type: "active_match",
          activeMatchId: joined.match_id ?? openRoom.matchId,
        });
        return;
      }

      dispatch({ type: "status", status: "Matchmaking" });
      await socketRef.current.addMatchmaker(`+properties.mode:${mode}`, 2, 2, { mode });
    });
  }

  async function playMove(position: number) {
    await runAction(async () => {
      if (!socketRef.current || !state.activeMatchId) {
        return;
      }

      await socketRef.current.sendMatchState(state.activeMatchId, OP_CODES.MOVE, JSON.stringify({ position }));
    });
  }

  function leaveMatchView() {
    dispatch({ type: "clear_error" });
    dispatch({ type: "clear_match" });
  }

  return {
    state,
    actions: {
      createRoom,
      joinRoom,
      leaveMatchView,
      playMove,
      refreshLeaderboard,
      refreshRooms,
      startMatchmaking,
    },
  };

  async function runAction(action: () => Promise<void>) {
    try {
      dispatch({ type: "clear_error" });
      await action();
    } catch (error) {
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong. Please try again.",
      });
    }
  }
}

async function getSharedConnection(username: string): Promise<SharedConnection> {
  if (sharedConnection) {
    return sharedConnection;
  }

  if (!sharedConnectionPromise) {
    sharedConnectionPromise = (async () => {
      const session = await nakamaClient.authenticateDevice(getDeviceId(), true, username);
      await nakamaClient.updateAccount(session, { username });
      const socket = nakamaClient.createSocket(nakamaConfig.useSSL);
      await connectSocketWithTimeout(socket, session, true, SOCKET_CONNECT_TIMEOUT_MS);

      sharedConnection = {
        session,
        socket,
        username,
        selfUserId: session.user_id ?? getDeviceId(),
      };
      bindSocketHandlers(sharedConnection);
      if (subscribers.size === 0) {
        scheduleSharedDisconnect();
      }
      return sharedConnection;
    })().catch((error) => {
      clearSharedConnection();
      throw error;
    });
  }

  return sharedConnectionPromise;
}

async function connectSocketWithTimeout(socket: Socket, session: Session, createStatus: boolean, timeoutMs: number) {
  await Promise.race([
    socket.connect(session, createStatus),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("The socket timed out when trying to connect.")), timeoutMs);
    }),
  ]);
}

function bindSocketHandlers(connection: SharedConnection) {
  if (handlersBound) {
    return;
  }

  handlersBound = true;
  const { socket } = connection;

  socket.onerror = (error) => {
    broadcast({ type: "error", message: formatConnectionError(error) });
  };

  socket.ondisconnect = () => {
    clearSharedConnection();
    broadcast({ type: "error", message: "Socket disconnected." });
  };

  socket.onmatchdata = (message) => {
    const decoded = decodePayload(message.data);
    if (!decoded) {
      return;
    }

    if (message.op_code === OP_CODES.ERROR) {
      broadcast({ type: "error", message: decoded.message ?? "Unknown server error." });
      return;
    }

    broadcast({
      type: "match_state",
      matchState: decoded as MatchStateView,
    });
  };

  socket.onmatchmakermatched = async (matched) => {
    if (!matched.match_id && !matched.token) {
      broadcast({ type: "error", message: "Matchmaker returned neither a match id nor a token." });
      return;
    }

    try {
      broadcast({ type: "status", status: "Joining" });
      const joined = await socket.joinMatch(matched.match_id, matched.token);
      broadcast({
        type: "active_match",
        activeMatchId: joined.match_id ?? matched.match_id ?? null,
      });
    } catch (error) {
      broadcast({
        type: "error",
        message: error instanceof Error ? error.message : "We couldn't join the match that was found for you.",
      });
      return;
    }
  };
}

function broadcast(action: Action) {
  subscribers.forEach((dispatch) => dispatch(action));
}

function clearSharedConnection() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }

  sharedConnection = null;
  sharedConnectionPromise = null;
  handlersBound = false;
}

function scheduleSharedDisconnect() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }

  if (subscribers.size > 0 || !sharedConnection) {
    return;
  }

  disconnectTimer = setTimeout(() => {
    if (subscribers.size > 0 || !sharedConnection) {
      return;
    }

    sharedConnection.socket.disconnect(false);
    clearSharedConnection();
  }, SOCKET_DISCONNECT_GRACE_MS);
}

function deriveStatusFromMatchState(matchState: MatchStateView): Status {
  if (matchState.playing) {
    return "Playing";
  }

  return matchState.resultReason ? "Finished" : "Joining";
}

function formatConnectionError(error: unknown) {
  const endpoint = `${nakamaConfig.useSSL ? "wss" : "ws"}://${nakamaConfig.host}:${nakamaConfig.port}/ws`;

  if (error instanceof Error && error.message) {
    return `${error.message} Socket endpoint: ${endpoint}`;
  }

  if (typeof error === "string") {
    return `${error} Socket endpoint: ${endpoint}`;
  }

  return `Couldn't connect to the game server at ${endpoint}.`;
}

function decodePayload(payload: string | Uint8Array | object | undefined) {
  try {
    if (!payload) {
      return null;
    }

    if (typeof payload === "object" && !(payload instanceof Uint8Array)) {
      return payload;
    }

    if (typeof payload === "string") {
      return JSON.parse(payload);
    }

    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
}

function assertLobbyActionAllowed(status: Status) {
  if (status === "Authenticating") {
    throw new Error("Please wait until you are connected.");
  }

  if (status === "Matchmaking" || status === "Joining") {
    throw new Error("Please wait for the current action to finish first.");
  }

  if (status === "Playing") {
    throw new Error("Finish the current match before starting a new one.");
  }
}
