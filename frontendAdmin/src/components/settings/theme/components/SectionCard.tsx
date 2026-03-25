import type { ReactNode } from 'react';

interface SectionCardProps {
  children: ReactNode;
  className?: string;
}

export function SectionCard({ children, className = '' }: SectionCardProps) {
  return (
    <div
      className={`rounded-[24px] border border-border/80 bg-app-bg/85 px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}
