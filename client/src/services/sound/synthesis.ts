/**
 * Synthesis — generación de los tonos de la biblioteca local con Web Audio API.
 * No usa archivos externos: cada preset es una secuencia de osciladores con
 * envolvente de ganancia. Licencia: generado localmente, sin atribución.
 */

type Note = {
  freq: number;
  at: number; // segundos desde el inicio
  dur: number; // duración de la nota
  type?: OscillatorType;
  gain?: number; // 0..1 relativo
};

const A4 = 440;

function note(semitones: number): number {
  return A4 * Math.pow(2, semitones / 12);
}

const presets: Record<string, Note[]> = {
  // Respuesta IA: arpegio suave ascendente
  'chime-soft-digital': [
    { freq: note(7), at: 0, dur: 0.55, type: 'sine', gain: 0.5 },
    { freq: note(11), at: 0.12, dur: 0.55, type: 'sine', gain: 0.5 },
    { freq: note(14), at: 0.24, dur: 0.7, type: 'sine', gain: 0.55 },
  ],
  // Tarea completada: arpegio mayor brillante
  'success-chime': [
    { freq: note(0), at: 0, dur: 0.4, type: 'triangle', gain: 0.5 },
    { freq: note(4), at: 0.1, dur: 0.4, type: 'triangle', gain: 0.5 },
    { freq: note(7), at: 0.2, dur: 0.45, type: 'triangle', gain: 0.5 },
    { freq: note(12), at: 0.3, dur: 0.6, type: 'triangle', gain: 0.55 },
  ],
  // Mensaje IA: doble pitido corto
  'message-digital': [
    { freq: note(9), at: 0, dur: 0.2, type: 'square', gain: 0.18 },
    { freq: note(9), at: 0.25, dur: 0.25, type: 'square', gain: 0.18 },
  ],
  // Notificación suave: un ding
  'notification-soft': [
    { freq: note(12), at: 0, dur: 0.5, type: 'sine', gain: 0.45 },
    { freq: note(12.5), at: 0, dur: 0.5, type: 'sine', gain: 0.2 },
  ],
  // Advertencia: dos tonos descendentes
  'alert-soft': [
    { freq: note(4), at: 0, dur: 0.25, type: 'square', gain: 0.22 },
    { freq: note(0), at: 0.28, dur: 0.35, type: 'square', gain: 0.22 },
  ],
  // Error: tono grave descendente
  'error-notification': [
    { freq: note(-7), at: 0, dur: 0.4, type: 'sawtooth', gain: 0.2 },
    { freq: note(-10), at: 0.35, dur: 0.5, type: 'sawtooth', gain: 0.22 },
  ],
  // Proceso iniciado: ascendente corto
  'process-start': [
    { freq: note(2), at: 0, dur: 0.2, type: 'triangle', gain: 0.4 },
    { freq: note(7), at: 0.15, dur: 0.3, type: 'triangle', gain: 0.45 },
  ],
  // Operación de archivos terminada: doble pop
  'file-done': [
    { freq: note(9), at: 0, dur: 0.12, type: 'sine', gain: 0.5 },
    { freq: note(12), at: 0.14, dur: 0.18, type: 'sine', gain: 0.5 },
  ],
  // Conexión establecida: tono limpio
  'connection-ok': [
    { freq: note(7), at: 0, dur: 0.25, type: 'sine', gain: 0.5 },
    { freq: note(10), at: 0.18, dur: 0.35, type: 'sine', gain: 0.5 },
  ],
  // Click
  'click-pop': [{ freq: 1200, at: 0, dur: 0.06, type: 'sine', gain: 0.5 }],
  // Sci-fi: sweep de frecuencia
  'sci-fi-digital': [
    { freq: note(5), at: 0, dur: 0.4, type: 'sine', gain: 0.4 },
    { freq: note(17), at: 0.2, dur: 0.5, type: 'sine', gain: 0.4 },
  ],
  // Chime de interfaz
  'interface-chime': [
    { freq: note(7), at: 0, dur: 0.4, type: 'sine', gain: 0.45 },
    { freq: note(11), at: 0.15, dur: 0.5, type: 'sine', gain: 0.45 },
  ],
};

/** Reproduce un preset local en el contexto dado, con volumen 0..1. */
export function playPreset(ctx: AudioContext, id: string, volume: number): void {
  const notes = presets[id];
  if (!notes) {
    return;
  }
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);

  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const g = ctx.createGain();
    const start = now + n.at;
    const dur = n.dur;
    const peak = (n.gain ?? 0.5) * 0.8;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

/** Los ids que tienen preset local. */
export function isLocalPreset(id: string): boolean {
  return id in presets;
}
