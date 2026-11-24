import React, { useRef } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  Undo2,
  X,
} from 'lucide-react';

interface TouchRemoteProps {
  visible: boolean;
  onDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
  onOkTap: () => void;
  onOkLongPress: () => void;
  onBack: () => void;
  onHome: () => void;
  onHide: () => void;
}

export const TouchRemote: React.FC<TouchRemoteProps> = ({
  visible,
  onDirection,
  onOkTap,
  onOkLongPress,
  onBack,
  onHome,
  onHide,
}) => {
  const holdTimer = useRef<number | null>(null);
  const didHold = useRef(false);

  if (!visible) return null;

  const startOk = () => {
    didHold.current = false;
    holdTimer.current = window.setTimeout(() => {
      didHold.current = true;
      onOkLongPress();
    }, 500);
  };

  const endOk = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <div
      aria-label="On-screen TV D-pad remote"
      className="tv-surface fixed right-4 bottom-24 z-[65] flex flex-col items-center gap-2 rounded-3xl border border-white/20 bg-[#0D1017]/85 p-3 shadow-2xl backdrop-blur-2xl sm:right-6 sm:bottom-8"
    >
      <div className="flex w-full items-center justify-between px-1">
        <span className="text-[11px] font-medium text-white/60">D-Pad</span>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onHide}
          aria-label="Hide on-screen remote"
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Circular D-Pad */}
      <div className="grid grid-cols-3 gap-1.5">
        <div />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDirection('up')}
          aria-label="D-pad Up"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white active:scale-95 active:bg-white/25"
        >
          <ChevronUp size={20} />
        </button>
        <div />

        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDirection('left')}
          aria-label="D-pad Left"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white active:scale-95 active:bg-white/25"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={startOk}
          onPointerUp={endOk}
          onPointerCancel={endOk}
          onPointerLeave={endOk}
          onClick={() => {
            if (didHold.current) {
              didHold.current = false;
              return;
            }
            onOkTap();
          }}
          aria-label="OK Select (hold for long press)"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/20 text-xs font-semibold text-white active:scale-95 active:bg-white/35"
        >
          OK
        </button>

        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDirection('right')}
          aria-label="D-pad Right"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white active:scale-95 active:bg-white/25"
        >
          <ChevronRight size={20} />
        </button>

        <div />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onDirection('down')}
          aria-label="D-pad Down"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/8 text-white active:scale-95 active:bg-white/25"
        >
          <ChevronDown size={20} />
        </button>
        <div />
      </div>

      {/* Back & Home */}
      <div className="flex w-full gap-1.5 pt-1">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
          aria-label="Back"
          className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/8 text-white/85 active:scale-95"
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onHome}
          aria-label="Home"
          className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-white/12 bg-white/8 text-white/85 active:scale-95"
        >
          <Home size={15} />
        </button>
      </div>
    </div>
  );
};
