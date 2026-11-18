// Keyboard and mouse state for the whole game: a held-key set, edge-triggered presses,
// and pointer-lock look deltas, all read once per frame by the controllers.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.firing = false;
    this.locked = false;

    addEventListener('keydown', (event) => {
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
    });
    addEventListener('keyup', (event) => this.held.delete(event.code));
    addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('click', () => {
      if (!this.locked && this.wantsLock) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.lookDX += event.movementX || 0;
      this.lookDY += event.movementY || 0;
    });
    addEventListener('mousedown', (event) => {
      if (this.locked && event.button === 0) this.firing = true;
    });
    addEventListener('mouseup', (event) => {
      if (event.button === 0) this.firing = false;
    });
    this.wantsLock = true;
  }

  /** True while a key (KeyboardEvent.code) is down. */
  down(code) {
    return this.held.has(code);
  }

  /** True only on the frame a key first went down; clears the edge set when read at frame end. */
  hit(code) {
    return this.pressed.has(code);
  }

  /** Call once at the end of each frame: drops edge presses and look deltas. */
  endFrame() {
    this.pressed.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }
}
