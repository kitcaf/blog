import { useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { normalizeHexInput } from '../utils/typographyTheme';

interface HexColorFieldProps {
  initialValue: string;
  onCommit: (value: string) => void;
}

export function HexColorField({ initialValue, onCommit }: HexColorFieldProps) {
  const [draftValue, setDraftValue] = useState(initialValue);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraftValue(event.target.value);
  }

  function handleCommit() {
    const normalizedHex = normalizeHexInput(draftValue);

    if (!normalizedHex) {
      setDraftValue(initialValue);
      return;
    }

    setDraftValue(normalizedHex);
    onCommit(normalizedHex);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    handleCommit();
  }

  return (
    <input
      type="text"
      value={draftValue}
      onChange={handleChange}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      className="min-w-0 flex-1 rounded-xl border border-border bg-app-bg px-3 py-2 text-sm text-app-fg-deeper outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/40"
      placeholder="#18181b"
    />
  );
}
