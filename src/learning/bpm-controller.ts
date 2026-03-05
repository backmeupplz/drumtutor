/**
 * Adaptive BPM controller for progressive learning.
 * Start at 50% target, +5 on pass, -10 after 3 consecutive fails.
 */

export class BpmController {
  readonly targetBpm: number;
  private _currentBpm: number;
  private consecutiveFails = 0;

  constructor(targetBpm: number) {
    this.targetBpm = targetBpm;
    this._currentBpm = Math.round(targetBpm * 0.5);
  }

  get currentBpm(): number {
    return this._currentBpm;
  }

  get atTarget(): boolean {
    return this._currentBpm >= this.targetBpm;
  }

  /** Call after a passing attempt. Returns new BPM. */
  onPass(): number {
    this.consecutiveFails = 0;
    this._currentBpm = Math.min(this._currentBpm + 5, this.targetBpm);
    return this._currentBpm;
  }

  /** Call after a failing attempt. Returns new BPM. */
  onFail(): number {
    this.consecutiveFails++;
    if (this.consecutiveFails >= 3) {
      const floor = Math.round(this.targetBpm * 0.3);
      this._currentBpm = Math.max(this._currentBpm - 10, floor);
      this.consecutiveFails = 0;
    }
    return this._currentBpm;
  }

  /** Reset to starting BPM */
  reset(): void {
    this._currentBpm = Math.round(this.targetBpm * 0.5);
    this.consecutiveFails = 0;
  }

  /** Set a specific BPM (for combined segments) */
  setBpm(bpm: number): void {
    this._currentBpm = bpm;
    this.consecutiveFails = 0;
  }
}
