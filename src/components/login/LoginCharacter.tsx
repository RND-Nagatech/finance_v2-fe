import type { CharacterState } from "./types";
import "./LoginCharacter.css";

import characterIcon from "../../../assets/accounting_character_layers_rive_ready/icon-optimized.webp";

interface LoginCharacterProps {
  state: CharacterState;
  className?: string;
}

export default function LoginCharacter({ state, className = "" }: LoginCharacterProps) {
  return (
    <div className={`login-character ${className}`} data-state={state} aria-hidden="true">
      <img className="login-character__image" src={characterIcon} alt="" loading="eager" decoding="async" />
    </div>
  );
}
