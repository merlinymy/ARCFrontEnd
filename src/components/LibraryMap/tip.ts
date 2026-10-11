// Hover + focus tooltips for DOM marks (barcode segments, heatmap cells, bars).
// One floating bubble per component, positioned from the target's rect.
import { useCallback, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react';

export interface TipState {
  x: number;
  y: number;
  below: boolean;
  content: ReactNode;
}

export interface TipBindings {
  onPointerEnter: (e: PointerEvent<Element>) => void;
  onPointerLeave: () => void;
  onFocus: (e: FocusEvent<Element>) => void;
  onBlur: () => void;
}

export function useTip(): {
  tip: TipState | null;
  bind: (content: ReactNode) => TipBindings;
  hide: () => void;
} {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((el: Element, content: ReactNode) => {
    const r = el.getBoundingClientRect();
    const below = r.top < 96;
    setTip({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const bind = useCallback(
    (content: ReactNode): TipBindings => ({
      onPointerEnter: (e) => show(e.currentTarget, content),
      onPointerLeave: hide,
      onFocus: (e) => show(e.currentTarget, content),
      onBlur: hide,
    }),
    [show, hide]
  );
  return { tip, bind, hide };
}
