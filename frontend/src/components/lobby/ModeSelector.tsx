import type { GameMode } from "../../types";
import { MODE_OPTIONS } from "../../constants/game";

interface ModeSelectorProps {
  disabled?: boolean;
  selectedMode: GameMode;
  onSelectMode: (mode: GameMode) => void;
}

export function ModeSelector({ disabled = false, selectedMode, onSelectMode }: ModeSelectorProps) {
  return (
    <div className="mode-grid">
      {MODE_OPTIONS.map((mode) => (
        <button
          key={mode.value}
          className={selectedMode === mode.value ? "mode-button active" : "mode-button"}
          disabled={disabled}
          onClick={() => onSelectMode(mode.value)}
          type="button"
        >
          <span>{mode.label}</span>
          <small>{mode.description}</small>
        </button>
      ))}
    </div>
  );
}
