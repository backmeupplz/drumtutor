import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import { MidiInput, type MidiDevice, type MidiInputCallback } from "../engine/midi-input";

export function useMidiInput(onNoteOn?: (note: number, velocity: number) => void) {
  const inputRef = useRef<MidiInput | null>(null);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    try {
      const input = new MidiInput();
      const devs = await input.init();
      inputRef.current = input;
      setDevices(devs);
      setError(null);

      // Auto-refresh on device connect/disconnect
      input.onStateChange(() => {
        const updated = input.listDevices();
        setDevices(updated);
      });

      return devs;
    } catch (e: any) {
      setError(e.message);
      return [];
    }
  }, []);

  const connect = useCallback(
    (deviceId: string) => {
      if (!inputRef.current) return false;

      const callback: MidiInputCallback = (event) => {
        if (event.type === "noteon" && onNoteOn) {
          onNoteOn(event.note, event.velocity);
        }
      };

      const ok = inputRef.current.connect(deviceId, callback);
      if (ok) {
        setConnected(true);
        setDeviceName(inputRef.current.deviceName);
      }
      return ok;
    },
    [onNoteOn]
  );

  const disconnect = useCallback(() => {
    inputRef.current?.disconnect();
    setConnected(false);
    setDeviceName("");
  }, []);

  useEffect(() => {
    return () => {
      inputRef.current?.disconnect();
    };
  }, []);

  return { devices, connected, deviceName, error, init, connect, disconnect };
}
