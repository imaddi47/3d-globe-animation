import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export type PointerState = { x: number; y: number; active: boolean };

export function usePointerNDC() {
  const gl = useThree((s) => s.gl);
  const ref = useRef<PointerState>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const el = gl.domElement;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ref.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ref.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      ref.current.active = true;
    };
    const onLeave = () => {
      ref.current.active = false;
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerout', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerout', onLeave);
    };
  }, [gl]);

  return ref;
}
