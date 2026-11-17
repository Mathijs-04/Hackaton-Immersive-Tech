// Input as *actions*, not raw keys, so controllers (free-fly camera, butterfly) can read
// `input.move` / `input.ascend` / `input.boost` regardless of keyboard or touch.
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor() {
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // x: turn/strafe right, y: forward
    this.ascend = 0;            // +1 up, -1 down
    this.boost = false;
    // On-screen touch controls write here (joystick + up/down buttons).
    this.virtual = { x: 0, y: 0, ascend: 0 };
    // Arrow keys and Space belong to the timeline unless a flight mode claims them.
    this.flightKeys = false;
    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update() {
    const k = this.keys;
    const on = (...codes) => codes.some((c) => k.has(c));
    const f = this.flightKeys;
    const right = on('KeyD') || (f && on('ArrowRight'));
    const left = on('KeyA') || (f && on('ArrowLeft'));
    const fwd = on('KeyW') || (f && on('ArrowUp'));
    const back = on('KeyS') || (f && on('ArrowDown'));
    const up = on('KeyE') || (f && on('Space'));
    const down = on('KeyQ', 'KeyC');
    this.move.x = clamp1((right ? 1 : 0) - (left ? 1 : 0) + this.virtual.x);
    this.move.y = clamp1((fwd ? 1 : 0) - (back ? 1 : 0) + this.virtual.y);
    this.ascend = clamp1((up ? 1 : 0) - (down ? 1 : 0) + this.virtual.ascend);
    this.boost = on('ShiftLeft', 'ShiftRight');
  }

  get active() { return this.move.x || this.move.y || this.ascend; }
}
