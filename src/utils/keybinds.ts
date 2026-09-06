import { KeybindsConfig } from '../types';

export interface KeybindItem {
  id: keyof KeybindsConfig;
  label: string;
  category: 'gate' | 'queue' | 'movement';
  description: string;
}

export const KEYBIND_DEFINITIONS: KeybindItem[] = [
  // 1-8 Gates (1 gate selected at once)
  { id: 'gate1', label: 'Gate 1 (Car 1, Row 1)', category: 'gate', description: 'Select Gate 1 (1 gate selected at once)' },
  { id: 'gate2', label: 'Gate 2 (Car 1, Row 2)', category: 'gate', description: 'Select Gate 2 (1 gate selected at once)' },
  { id: 'gate3', label: 'Gate 3 (Car 2, Row 1)', category: 'gate', description: 'Select Gate 3 (1 gate selected at once)' },
  { id: 'gate4', label: 'Gate 4 (Car 2, Row 2)', category: 'gate', description: 'Select Gate 4 (1 gate selected at once)' },
  { id: 'gate5', label: 'Gate 5 (Car 3, Row 1)', category: 'gate', description: 'Select Gate 5 (1 gate selected at once)' },
  { id: 'gate6', label: 'Gate 6 (Car 3, Row 2)', category: 'gate', description: 'Select Gate 6 (1 gate selected at once)' },
  { id: 'gate7', label: 'Gate 7 (Car 4, Row 1)', category: 'gate', description: 'Select Gate 7 (1 gate selected at once)' },
  { id: 'gate8', label: 'Gate 8 (Car 4, Row 2)', category: 'gate', description: 'Select Gate 8 (1 gate selected at once)' },

  // Queue & Grouping Actions
  { id: 'confirmGroup', label: 'Confirm Group (Send to Gates)', category: 'queue', description: 'Finish grouping stage and walk guests to selected gates' },
  { id: 'callMainQueue', label: 'Call Main Queue', category: 'queue', description: 'Select the front group from the Main Queue line' },
  { id: 'callSingleQueue', label: 'Call Single Rider', category: 'queue', description: 'Select a solo guest from the Single Rider queue' },
  { id: 'deselect', label: 'Deselect / Cancel Group', category: 'queue', description: 'Cancel current group allocations' },
  { id: 'interact', label: 'Interact / Push Button', category: 'queue', description: 'Physical interaction button for console & stoplines' },
  { id: 'pause', label: 'Pause / Open Menu', category: 'queue', description: 'Pause simulation and open station settings' },

  // Movement
  { id: 'moveForward', label: 'Walk Forward', category: 'movement', description: 'Move station operator forward' },
  { id: 'moveBackward', label: 'Walk Backward', category: 'movement', description: 'Move station operator backward' },
  { id: 'moveLeft', label: 'Strafe Left', category: 'movement', description: 'Strafe station operator left' },
  { id: 'moveRight', label: 'Strafe Right', category: 'movement', description: 'Strafe station operator right' },
  { id: 'jump', label: 'Jump', category: 'movement', description: 'Jump on the station platform' },
  { id: 'sprint', label: 'Sprint (Fast Walk)', category: 'movement', description: 'Increase operator movement speed' },
];

export function formatKeyName(code: string | undefined): string {
  if (!code) return 'UNBOUND';

  if (code.startsWith('Digit')) {
    return code.replace('Digit', '');
  }
  if (code.startsWith('Key')) {
    return code.replace('Key', '');
  }
  if (code.startsWith('Numpad')) {
    return `NUM ${code.replace('Numpad', '')}`;
  }

  switch (code) {
    case 'Space':
      return 'SPACE';
    case 'ShiftLeft':
      return 'L-SHIFT';
    case 'ShiftRight':
      return 'R-SHIFT';
    case 'ControlLeft':
      return 'L-CTRL';
    case 'ControlRight':
      return 'R-CTRL';
    case 'AltLeft':
      return 'L-ALT';
    case 'AltRight':
      return 'R-ALT';
    case 'ArrowUp':
      return '↑ UP';
    case 'ArrowDown':
      return '↓ DOWN';
    case 'ArrowLeft':
      return '← LEFT';
    case 'ArrowRight':
      return '→ RIGHT';
    case 'Escape':
      return 'ESC';
    case 'Enter':
      return 'ENTER';
    case 'Tab':
      return 'TAB';
    case 'Backspace':
      return 'BKSP';
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Semicolon':
      return ';';
    case 'Quote':
      return "'";
    case 'Comma':
      return ',';
    case 'Period':
      return '.';
    case 'Slash':
      return '/';
    default:
      return code.toUpperCase();
  }
}
