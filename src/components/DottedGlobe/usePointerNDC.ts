import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

export type PointerInteractionState = {
  /** Normalized device x [-1, 1] */
  ndcX: number;
  /** Normalized device y [-1, 1] */
  ndcY: number;
  /** Cursor currently over the canvas */
  active: boolean;
  /** Pointer pressed down (drag in progress) */
  dragging: boolean;
  /** Accumulated horizontal drag in radians */
  dragYaw: number;
  /** Accumulated vertical drag in radians */
  dragPitch: number;
};

/** Drag sensitivity: radians per pixel of mouse movement */
const DRAG_SENSITIVITY = 0.006;

export function usePointerInteraction() {
  const gl = useThree((s) => s.gl);
  const ref = useRef<PointerInteractionState>({
    ndcX: 0,
    ndcY: 0,
    active: false,
    dragging: false,
    dragYaw: 0,
    dragPitch: 0,
  });
  const lastX = useRef(0);
  const lastY = useRef(0);

  useEffect(() => {
    const el = gl.domElement;

    const updateNDC = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      ref.current.ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      ref.current.ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onMove = (e: PointerEvent) => {
      updateNDC(e.clientX, e.clientY);
      ref.current.active = true;

      if (ref.current.dragging) {
        const dx = e.clientX - lastX.current;
        const dy = e.clientY - lastY.current;
        ref.current.dragYaw += dx * DRAG_SENSITIVITY;
        ref.current.dragPitch += dy * DRAG_SENSITIVITY;
        lastX.current = e.clientX;
        lastY.current = e.clientY;
      }
    };

    const onDown = (e: PointerEvent) => {
      ref.current.dragging = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      el.style.cursor = 'grabbing';
    };

    const endDrag = (e: PointerEvent) => {
      ref.current.dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      el.style.cursor = '';
    };

    const onLeave = () => {
      ref.current.active = false;
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerout', onLeave);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerout', onLeave);
    };
  }, [gl]);

  return ref;
}
