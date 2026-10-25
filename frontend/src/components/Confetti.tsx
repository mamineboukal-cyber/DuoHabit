import { useMemo } from "react";

const COLORS = ["bg-accent", "bg-success", "bg-danger", "bg-content-muted"];

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
}

export default function Confetti() {
  const pieces = useMemo<ConfettiPiece[]>(
    () =>
      Array.from({ length: 24 }, (_, id) => ({
        id,
        left: Math.random() * 100,
        delay: Math.random() * 350,
        duration: 1400 + Math.random() * 700,
        color: COLORS[id % COLORS.length] ?? "bg-accent",
      })),
    [],
  );

  return (
    <div
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden"
    >
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className={`absolute top-0 h-2 w-2 animate-confetti rounded-pill motion-reduce:animate-none ${piece.color}`}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}ms`,
            animationDuration: `${piece.duration}ms`,
          }}
        />
      ))}
    </div>
  );
}
