const GAMEPAD_DEADZONE = 0.35;

export function createControls() {
  const keys = new Set(),
    touches = new Map();
  let bomb = false,
    epoch = 0,
    gamepadButtons = new Set(),
    gamepadNeedsNeutral = false,
    focused = true;
  const actions = {
    ArrowLeft: 'left',
    a: 'left',
    ArrowRight: 'right',
    d: 'right',
    ArrowUp: 'up',
    w: 'up',
    ArrowDown: 'down',
    s: 'down',
    ' ': 'bomb',
  };
  const clear = () => {
    keys.clear();
    touches.clear();
    bomb = false;
    gamepadButtons.clear();
    gamepadNeedsNeutral = true;
    epoch++;
  };
  const actionFor = (e) => actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  const down = (e) => {
    if (e.target.closest?.('input,textarea,select')) return;
    const action = actionFor(e);
    if (action) {
      e.preventDefault();
      keys.add(action);
      if (action === 'bomb' && !e.repeat) bomb = true;
    }
  };
  const up = (e) => {
    const action = actionFor(e);
    if (action) {
      e.preventDefault();
      keys.delete(action);
    }
  };
  const blur = () => {
      focused = false;
      clear();
    },
    focus = () => {
      focused = true;
    },
    pageHide = () => clear(),
    visibilityChange = () => {
      if (document.hidden) clear();
    };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  window.addEventListener('pagehide', pageHide);
  document.addEventListener('visibilitychange', visibilityChange);
  return {
    clear,
    get epoch() {
      return epoch;
    },
    touch(id, action) {
      touches.set(id, action);
      if (action === 'bomb') bomb = true;
    },
    release(id) {
      touches.delete(id);
    },
    read() {
      const all = new Set([...keys, ...touches.values()]);
      let pad;
      try {
        if (focused && !document.hidden) {
          pad = Array.from(globalThis.navigator?.getGamepads?.() || []).find(
            (candidate) => candidate?.connected && candidate.mapping === 'standard',
          );
        }
      } catch {
        pad = null;
      }
      const pressed = (index) => Boolean(pad?.buttons[index]?.pressed);
      const x = pad?.axes[0] || 0,
        y = pad?.axes[1] || 0;
      const faceButtons = new Set([0, 1, 2, 3].filter(pressed));
      const neutral =
        Math.abs(x) <= GAMEPAD_DEADZONE &&
        Math.abs(y) <= GAMEPAD_DEADZONE &&
        ![12, 13, 14, 15].some(pressed) &&
        faceButtons.size === 0;
      if (focused && !document.hidden && (!pad || neutral)) gamepadNeedsNeutral = false;
      if (pad && !gamepadNeedsNeutral) {
        if (x < -GAMEPAD_DEADZONE || pressed(14)) all.add('left');
        if (x > GAMEPAD_DEADZONE || pressed(15)) all.add('right');
        if (y < -GAMEPAD_DEADZONE || pressed(12)) all.add('up');
        if (y > GAMEPAD_DEADZONE || pressed(13)) all.add('down');
        if ([...faceButtons].some((button) => !gamepadButtons.has(button))) bomb = true;
      }
      gamepadButtons = faceButtons;
      const pending = bomb;
      bomb = false;
      return {
        x: Number(all.has('right')) - Number(all.has('left')),
        y: Number(all.has('down')) - Number(all.has('up')),
        bomb: pending,
      };
    },
    dispose() {
      clear();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', pageHide);
      document.removeEventListener('visibilitychange', visibilityChange);
    },
  };
}

export function createGestureHandlers(controlsRef) {
  const active = new Map();
  const release = (event) => {
    active.delete(event.pointerId);
    controlsRef.current?.release(event.pointerId);
  };
  return {
    arena: {
      onPointerDown(event) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        event.currentTarget.setPointerCapture(event.pointerId);
        controlsRef.current?.touch(event.pointerId, 'bomb');
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
    },
    panel: {
      onPointerDown(event) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        event.currentTarget.setPointerCapture(event.pointerId);
        active.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          action: null,
          epoch: controlsRef.current?.epoch,
        });
      },
      onPointerMove(event) {
        const point = active.get(event.pointerId);
        if (!point) return;
        if (point.epoch !== controlsRef.current?.epoch) {
          active.delete(event.pointerId);
          return;
        }
        const dx = event.clientX - point.x,
          dy = event.clientY - point.y;
        if (!point.action && Math.hypot(dx, dy) >= 14) {
          point.action =
            Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        }
        if (point.action) {
          event.preventDefault();
          controlsRef.current?.touch(event.pointerId, point.action);
        }
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
    },
    dispose() {
      active.clear();
    },
  };
}
