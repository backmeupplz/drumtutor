import type { MidiDevice } from "../engine/midi-input";

interface Props {
  devices: MidiDevice[];
  connected: boolean;
  deviceName: string;
  error: string | null;
  onInit: () => void;
  onConnect: (id: string) => void;
  onDisconnect: () => void;
}

export function ConnectScreen({
  devices,
  connected,
  deviceName,
  error,
  onInit,
  onConnect,
  onDisconnect,
}: Props) {
  if (connected) {
    return (
      <div class="flex items-center gap-3 px-4 py-2 bg-[#141414] border border-[#2a2a2a] rounded">
        <div class="w-2 h-2 rounded-full bg-[#22c55e]" />
        <span class="text-sm text-[#e0e0e0]">{deviceName}</span>
        <button
          class="text-xs text-[#888] hover:text-[#e0e0e0] ml-auto"
          onClick={onDisconnect}
        >
          disconnect
        </button>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-3 p-6 bg-[#141414] border border-[#2a2a2a] rounded max-w-md mx-auto">
      <h2 class="text-lg text-[#f59e0b]">Connect MIDI Device</h2>

      {error && <p class="text-sm text-[#ef4444]">{error}</p>}

      {devices.length === 0 ? (
        <div class="flex flex-col gap-2">
          <p class="text-sm text-[#888]">
            No MIDI devices detected. Connect your drum kit and click detect.
          </p>
          <button
            class="px-4 py-2 bg-[#f59e0b] text-[#0a0a0a] rounded text-sm font-bold hover:bg-[#d97706]"
            onClick={onInit}
          >
            Detect MIDI Devices
          </button>
        </div>
      ) : (
        <div class="flex flex-col gap-2">
          {devices.map((d) => (
            <button
              key={d.id}
              class="px-4 py-2 bg-[#2a2a2a] text-[#e0e0e0] rounded text-sm hover:bg-[#333] text-left"
              onClick={() => onConnect(d.id)}
            >
              {d.name}
            </button>
          ))}
          <button
            class="text-xs text-[#888] hover:text-[#e0e0e0] mt-1"
            onClick={onInit}
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
