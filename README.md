# DrumTutor

Interactive web-based drum tutor. Upload any MIDI file, listen to the drum part, then practice along with real-time hit detection and feedback. Connect a MIDI drum pad or use your keyboard.

**[Try it live](https://borodutch.github.io/drumtutor/)**

## Features

- **MIDI file upload** — drop in any `.mid` file and the app extracts the drum track automatically
- **Listen mode** — play back the drum part with scrolling notation so you can hear and see what to play
- **Practice mode** — play along at any tempo with real-time hit grading (correct / early / late / miss)
- **Auto-learn curriculum** — progressive system that breaks songs into segments and gradually increases BPM
- **MIDI input** — plug in any MIDI drum pad or electronic kit for real instrument practice
- **Adjustable BPM** — slow down difficult parts and work your way up to full speed
- **Metronome** — built-in click track with configurable time signatures
- **Drum notation** — color-coded note lanes with General MIDI drum mapping
- **Recent files** — quickly reload previously opened MIDI files from browser storage

## Tech stack

- [Preact](https://preactjs.com/) + TypeScript
- [Vite](https://vitejs.dev/) build system
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) for sample playback
- [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) for drum pad input
- [@tonejs/midi](https://github.com/Tonejs/Midi) for MIDI file parsing

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/drumtutor/` in your browser.

## Build

```bash
npm run build
npm run preview
```

## License

MIT
