/**
 * Web MIDI input — connects to drum pads, parses NoteOn/NoteOff/Aftertouch.
 */

export interface MidiInputEvent {
  type: "noteon" | "noteoff" | "aftertouch";
  note: number;
  velocity: number;
  timestamp: number;
}

export type MidiInputCallback = (event: MidiInputEvent) => void;

export interface MidiDevice {
  id: string;
  name: string;
}

export class MidiInput {
  private access: MIDIAccess | null = null;
  private activeInput: MIDIInput | null = null;
  private callback: MidiInputCallback | null = null;

  /** Request MIDI access and return available input devices */
  async init(): Promise<MidiDevice[]> {
    if (!navigator.requestMIDIAccess) {
      throw new Error("Web MIDI API not supported in this browser");
    }
    this.access = await navigator.requestMIDIAccess();
    return this.listDevices();
  }

  /** List available MIDI input devices */
  listDevices(): MidiDevice[] {
    if (!this.access) return [];
    const devices: MidiDevice[] = [];
    for (const [id, input] of this.access.inputs) {
      devices.push({ id, name: input.name ?? `MIDI Input ${id}` });
    }
    return devices;
  }

  /** Connect to a specific device by ID */
  connect(deviceId: string, callback: MidiInputCallback): boolean {
    if (!this.access) return false;

    // Disconnect previous
    this.disconnect();

    const input = this.access.inputs.get(deviceId);
    if (!input) return false;

    this.activeInput = input;
    this.callback = callback;
    input.onmidimessage = this.handleMessage;
    return true;
  }

  /** Disconnect from current device */
  disconnect(): void {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    this.callback = null;
  }

  /** Listen for device connect/disconnect */
  onStateChange(cb: () => void): void {
    if (this.access) {
      this.access.onstatechange = cb;
    }
  }

  get connected(): boolean {
    return this.activeInput !== null;
  }

  get deviceName(): string {
    return this.activeInput?.name ?? "";
  }

  private handleMessage = (e: MIDIMessageEvent): void => {
    if (!this.callback || !e.data || e.data.length < 2) return;

    const status = e.data[0] & 0xf0;
    const note = e.data[1];
    const velocity = e.data.length > 2 ? e.data[2] : 0;

    switch (status) {
      case 0x90: // Note On
        if (velocity > 0) {
          this.callback({
            type: "noteon",
            note,
            velocity,
            timestamp: e.timeStamp,
          });
        } else {
          // Note On with velocity 0 = Note Off
          this.callback({
            type: "noteoff",
            note,
            velocity: 0,
            timestamp: e.timeStamp,
          });
        }
        break;
      case 0x80: // Note Off
        this.callback({
          type: "noteoff",
          note,
          velocity,
          timestamp: e.timeStamp,
        });
        break;
      case 0xa0: // Aftertouch (cymbal grab on Alesis)
        this.callback({
          type: "aftertouch",
          note,
          velocity,
          timestamp: e.timeStamp,
        });
        break;
    }
  };
}
