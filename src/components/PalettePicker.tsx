import { useEffect, useRef, useState } from 'react';
import { Palette as PaletteIcon, Check } from 'lucide-react';
import { PALETTES, getPalette, setPalette } from '../lib/palette';

/**
 * Pick the interface palette.
 *
 * Separate from the light/dark button next to it, because they answer
 * different questions: dark mode is about the room you are in, the palette is
 * about what is easy to look at for an hour. Each preset works in both.
 */
export function PalettePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(getPalette);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Listeners only exist while the menu is open, so there is nothing to
    // leak and nothing firing on every click elsewhere in the app.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    setPalette(id);
    setCurrent(id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
        aria-label="Change colour theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Colour theme"
      >
        <PaletteIcon className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Colour theme"
          className="absolute right-0 mt-1 w-64 z-50 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
        >
          {PALETTES.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={current === p.id}
              onClick={() => choose(p.id)}
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span
                aria-hidden
                className="mt-0.5 w-4 h-4 shrink-0 rounded-full border border-black/10 dark:border-white/15"
                style={{ background: p.swatch }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-900 dark:text-gray-100">{p.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{p.hint}</span>
              </span>
              {current === p.id && (
                <Check className="mt-0.5 w-4 h-4 shrink-0 text-gray-900 dark:text-gray-100" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
