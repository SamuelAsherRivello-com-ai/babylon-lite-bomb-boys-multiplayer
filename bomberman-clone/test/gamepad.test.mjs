import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from '../src/input/controls.js';

test('standard gamepad movement, face-button edges, and focus reset', () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = {
    connected: true,
    mapping: 'standard',
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => [null, pad] },
  });
  const controls = createControls();
  try {
    pad.axes = [0.2, -0.8];
    assert.deepEqual(controls.read(), { x: 0, y: -1, bomb: false });
    pad.buttons[15].pressed = true;
    assert.equal(controls.read().x, 1);
    for (let i = 0; i < 4; i++) {
      pad.buttons[i].pressed = true;
      assert.equal(controls.read().bomb, true, `face button ${i} places a bomb`);
      assert.equal(controls.read().bomb, false, 'holding a button does not repeat');
      pad.buttons[i].pressed = false;
      controls.read();
    }
    pad.buttons[0].pressed = true;
    window.dispatchEvent(new Event('blur'));
    assert.deepEqual(controls.read(), { x: 0, y: 0, bomb: false });
    window.dispatchEvent(new Event('focus'));
    assert.deepEqual(controls.read(), { x: 0, y: 0, bomb: false });
    pad.axes = [0, 0];
    pad.buttons[15].pressed = false;
    pad.buttons[0].pressed = false;
    controls.read();
    pad.buttons[0].pressed = true;
    assert.equal(controls.read().bomb, true, 'input resumes after returning to neutral');
    pad.connected = false;
    assert.deepEqual(controls.read(), { x: 0, y: 0, bomb: false });
  } finally {
    controls.dispose();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});
