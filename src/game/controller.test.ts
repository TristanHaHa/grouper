import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ControllerInput } from './controller';

test('Y only switches gate banks and right trigger always requests interaction', () => {
  const input = new ControllerInput();
  const pad = { index: 0, id: 'Xbox', connected: true, mapping: 'standard', timestamp: 0, vibrationActuator: null, hapticActuators: [], axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 } as GamepadButton)) } satisfies Gamepad;
  input.sample([pad], 0, 'gameplay');
  pad.buttons[3] = { pressed: true, touched: true, value: 1 };
  assert.deepEqual(input.sample([pad], 10, 'gameplay').actions, ['switchTrack']);
  pad.buttons[3] = { pressed: false, touched: false, value: 0 };
  input.sample([pad], 20, 'gameplay');
  pad.buttons[7] = { pressed: true, touched: true, value: 1 };
  assert.deepEqual(input.sample([pad], 30, 'gameplay').actions, ['interact']);
});
