import type { ChangeEvent } from 'react';

interface RangeControlCardProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueLabel: string;
  className?: string;
}

export function RangeControlCard({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
  className = '',
}: RangeControlCardProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(Number(event.target.value));
  }

  return (
    <div className={`space-y-2 rounded-2xl border border-border/70 bg-app-fg-lightest/20 px-4 py-4 ${className}`}>
      <label className="flex items-center justify-between text-sm font-medium text-app-fg-deeper">
        <span>{label}</span>
        <span className="text-xs text-app-fg-light">{valueLabel}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full accent-app-fg-deeper"
      />
    </div>
  );
}
