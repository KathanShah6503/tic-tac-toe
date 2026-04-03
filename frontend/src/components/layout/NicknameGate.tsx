import { FormEvent, useMemo, useState } from "react";

interface NicknameGateProps {
  initialValue?: string;
  onSubmit: (nickname: string) => void;
}

const MIN_NICKNAME_LENGTH = 3;
const MAX_NICKNAME_LENGTH = 20;

export function NicknameGate({ initialValue = "", onSubmit }: NicknameGateProps) {
  const [nickname, setNickname] = useState(initialValue);
  const trimmedNickname = nickname.trim();

  const validationMessage = useMemo(() => {
    if (!trimmedNickname) {
      return "Choose a nickname to get started.";
    }

    if (trimmedNickname.length < MIN_NICKNAME_LENGTH) {
      return `Use at least ${MIN_NICKNAME_LENGTH} characters.`;
    }

    if (trimmedNickname.length > MAX_NICKNAME_LENGTH) {
      return `Use ${MAX_NICKNAME_LENGTH} characters or fewer.`;
    }

    return null;
  }, [trimmedNickname]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) {
      return;
    }

    onSubmit(trimmedNickname);
  }

  return (
    <main className="nickname-shell">
      <section className="nickname-card">
        <div className="nickname-copy-block">
          <p className="eyebrow">Arena Entry</p>
          <h1>Choose your player name.</h1>
          <p className="hero-copy">Your name will appear in matches, rooms, and the rankings.</p>
        </div>

        <form className="nickname-form" onSubmit={handleSubmit}>
          <label className="nickname-label" htmlFor="nickname">
            Nickname
          </label>
          <input
            id="nickname"
            className="nickname-input"
            maxLength={MAX_NICKNAME_LENGTH}
            minLength={MIN_NICKNAME_LENGTH}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Player-764"
            type="text"
            value={nickname}
          />
          <div className="nickname-footer">
            <small className={validationMessage ? "form-note error" : "form-note"}>
              {validationMessage ?? "You can change this later if you add a profile settings flow."}
            </small>
            <button className="primary-cta" disabled={!!validationMessage} type="submit">
              Enter Game
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
