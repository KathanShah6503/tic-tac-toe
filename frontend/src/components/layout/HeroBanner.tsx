interface HeroBannerProps {
  isMatchFocused: boolean;
  username: string;
}

export function HeroBanner({ isMatchFocused, username }: HeroBannerProps) {
  return (
    <section className={isMatchFocused ? "hero-card compact" : "hero-card"}>
      <div className="hero-player-tag">{username || "Player"}</div>
      <div className="hero-copy-block">
        <p className="eyebrow">{isMatchFocused ? "Match Focus" : "Live Arena"}</p>
        <h1>{isMatchFocused ? "Stay sharp. One move can swing it." : "Step in. Square up. Take the board."}</h1>
        <p className="hero-copy">
          {isMatchFocused
            ? "The match is live now. Watch the board, the timer, and the next opening."
            : "Queue up, host a room, and build your spot in the rankings one round at a time."}
        </p>
      </div>
    </section>
  );
}
