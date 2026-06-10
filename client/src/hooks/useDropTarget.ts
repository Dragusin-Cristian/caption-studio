import { useCallback, useState, type DragEvent } from 'react';

export function useDropTarget(onFile: (file: File) => void): {
  isOver: boolean;
  bind: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
} {
  const [isOver, setOver] = useState(false);

  const onDragEnter = useCallback((e: DragEvent) => { e.preventDefault(); setOver(true); }, []);
  const onDragOver  = useCallback((e: DragEvent) => { e.preventDefault(); setOver(true); }, []);
  const onDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setOver(false); }, []);
  const onDrop      = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return { isOver, bind: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
