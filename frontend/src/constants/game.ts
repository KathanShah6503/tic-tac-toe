import type { GameMode } from "../types";

export interface ModeOption {
  value: GameMode;
  label: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  {
    value: "classic",
    label: "Classic",
    description: "No turn timer. Play at your own pace.",
  },
  {
    value: "timed",
    label: "Timed",
    description: "You have 30 seconds per turn, so every move counts.",
  },
];

export const EMPTY_BOARD = Array.from({ length: 9 }, () => null);
export const TICK_RATE = 5;
