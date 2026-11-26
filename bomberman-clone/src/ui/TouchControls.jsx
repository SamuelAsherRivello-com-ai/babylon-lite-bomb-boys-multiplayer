import { useEffect, useRef } from 'react';

export function TouchControls({ controls }) {
  const pressed = useRef(new Set());
  useEffect(
    () => () => {
      for (const id of pressed.current) controls.current?.release(id);
      pressed.current.clear();
    },
    [controls],
  );

  const button = (action, label, text) => (
    <button
      type="button"
      className={`touch-control touch-${action}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pressed.current.add(event.pointerId);
        controls.current?.touch(event.pointerId, action);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={(event) => {
        if (event.detail === 0) {
          controls.current?.touch(`keyboard-${action}`, action);
          controls.current?.release(`keyboard-${action}`);
        }
      }}
    >
      {text}
    </button>
  );
  function release(event) {
    event.stopPropagation();
    pressed.current.delete(event.pointerId);
    controls.current?.release(event.pointerId);
  }
  return (
    <div className="touch-controls menu-section" aria-label="Touch controls">
      {button('bomb', 'Place bomb', 'Bomb')}
      <div className="touch-direction-pad" aria-label="Movement controls">
        {button('up', 'Move up', '▲')}
        {button('left', 'Move left', '◀')}
        {button('right', 'Move right', '▶')}
        {button('down', 'Move down', '▼')}
      </div>
    </div>
  );
}
