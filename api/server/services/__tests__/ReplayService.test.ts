/**
 * Tests para ReplayService
 */

import { ReplayService } from '../Replay/ReplayService';

describe('ReplayService', () => {
  let replayService: ReplayService;

  beforeEach(() => {
    // Crear nueva instancia para cada test
    replayService = ReplayService.getInstance();
    // Limpiar sesiones existentes
    replayService.listSessions().forEach((session) => {
      replayService.deleteSession(session.id);
    });
  });

  afterEach(() => {
    // Limpiar después de cada test
    replayService.listSessions().forEach((session) => {
      replayService.stopReplay(session.id);
      replayService.deleteSession(session.id);
    });
  });

  describe('Gestión de Sesiones', () => {
    test('should create a new session', () => {
      const sessionId = replayService.createSession('Test Session', 'Description', {
        user: 'test',
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      const session = replayService.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session?.name).toBe('Test Session');
      expect(session?.description).toBe('Description');
      expect(session?.metadata).toEqual({ user: 'test' });
    });

    test('should add events to a session', () => {
      const sessionId = replayService.createSession('Test Session');
      const eventId = replayService.addEvent(sessionId, 'agent:created', 'orchestrator', {
        agentId: 'agent-1',
      });

      expect(eventId).toBeDefined();

      const session = replayService.getSession(sessionId);
      expect(session?.events).toHaveLength(1);
      expect(session?.events[0].type).toBe('agent:created');
      expect(session?.events[0].source).toBe('orchestrator');
    });

    test('should throw error when adding event to non-existent session', () => {
      expect(() => {
        replayService.addEvent('non-existent', 'agent:created', 'test', {});
      }).toThrow('Sesión no encontrada');
    });

    test('should finalize a session', () => {
      const sessionId = replayService.createSession('Test Session');
      replayService.addEvent(sessionId, 'agent:created', 'test', {});

      const session = replayService.finalizeSession(sessionId);

      expect(session).not.toBeNull();
      expect(session?.endTime).toBeDefined();
      expect(session?.duration).toBeGreaterThanOrEqual(0);
    });

    test('should list sessions sorted by date', () => {
      const session1 = replayService.createSession('Session 1');
      const session2 = replayService.createSession('Session 2');
      const session3 = replayService.createSession('Session 3');

      // Agregar evento a session1 para que tenga duración
      replayService.addEvent(session1, 'test', 'test', {});

      const sessions = replayService.listSessions();

      expect(sessions).toHaveLength(3);
      // Más reciente primero
      expect(sessions[0].id).toBe(session3);
      expect(sessions[1].id).toBe(session2);
      expect(sessions[2].id).toBe(session1);
    });

    test('should limit sessions in list', () => {
      for (let i = 0; i < 5; i++) {
        replayService.createSession(`Session ${i}`);
      }

      const sessions = replayService.listSessions(3);

      expect(sessions).toHaveLength(3);
    });

    test('should delete a session', () => {
      const sessionId = replayService.createSession('Test Session');

      const deleted = replayService.deleteSession(sessionId);

      expect(deleted).toBe(true);
      expect(replayService.getSession(sessionId)).toBeNull();
    });
  });

  describe('Reproducción', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = replayService.createSession('Test Session');
      replayService.addEvent(sessionId, 'agent:created', 'orchestrator', { id: 'agent-1' });
      replayService.addEvent(sessionId, 'tool:started', 'agent-1', { tool: 'read_file' });
      replayService.addEvent(sessionId, 'tool:completed', 'agent-1', { tool: 'read_file' });
      replayService.addEvent(sessionId, 'agent:completed', 'orchestrator', { id: 'agent-1' });
      replayService.finalizeSession(sessionId);
    });

    afterEach(() => {
      replayService.stopReplay(sessionId);
    });

    test('should start replay', () => {
      let eventCount = 0;

      const result = replayService.startReplay(
        sessionId,
        () => {
          eventCount++;
        },
        { startIndex: 0, speed: 100 },
      );

      expect(result).toBe(true);

      // Esperar a que se procesen eventos
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          replayService.stopReplay(sessionId);
          expect(eventCount).toBeGreaterThan(0);
          resolve();
        }, 500);
      });
    });

    test('should pause and resume replay', () => {
      replayService.startReplay(sessionId, () => {});

      const paused = replayService.pauseReplay(sessionId);
      expect(paused).toBe(true);

      const state = replayService.getReplayState(sessionId);
      expect(state?.isPaused).toBe(true);
      expect(state?.isPlaying).toBe(false);

      const resumed = replayService.resumeReplay(sessionId);
      expect(resumed).toBe(true);

      const resumedState = replayService.getReplayState(sessionId);
      expect(resumedState?.isPaused).toBe(false);
      expect(resumedState?.isPlaying).toBe(true);

      replayService.stopReplay(sessionId);
    });

    test('should seek to specific index', () => {
      replayService.startReplay(sessionId, () => {});

      const seeked = replayService.seekTo(sessionId, 2);
      expect(seeked).toBe(true);

      const state = replayService.getReplayState(sessionId);
      expect(state?.currentIndex).toBe(2);

      replayService.stopReplay(sessionId);
    });

    test('should go to next event', () => {
      replayService.startReplay(sessionId, () => {});
      replayService.seekTo(sessionId, 0);

      const next = replayService.nextEvent(sessionId);
      expect(next).toBe(true);

      const state = replayService.getReplayState(sessionId);
      expect(state?.currentIndex).toBe(1);

      replayService.stopReplay(sessionId);
    });

    test('should go to previous event', () => {
      replayService.startReplay(sessionId, () => {});
      replayService.seekTo(sessionId, 2);

      const prev = replayService.previousEvent(sessionId);
      expect(prev).toBe(true);

      const state = replayService.getReplayState(sessionId);
      expect(state?.currentIndex).toBe(1);

      replayService.stopReplay(sessionId);
    });

    test('should set playback speed', () => {
      replayService.startReplay(sessionId, () => {});

      const result = replayService.setPlaybackSpeed(sessionId, 2);
      expect(result).toBe(true);

      const state = replayService.getReplayState(sessionId);
      expect(state?.playbackSpeed).toBe(2);

      replayService.stopReplay(sessionId);
    });
  });

  describe('Exportación', () => {
    test('should export session as JSON', () => {
      const sessionId = replayService.createSession('Test Session');
      replayService.addEvent(sessionId, 'test', 'source', { data: 'value' });
      replayService.finalizeSession(sessionId);

      const json = replayService.exportSession(sessionId);

      expect(json).toBeDefined();
      expect(() => JSON.parse(json!)).not.toThrow();

      const parsed = JSON.parse(json!);
      expect(parsed.id).toBe(sessionId);
      expect(parsed.events).toHaveLength(1);
    });

    test('should export session as CSV', () => {
      const sessionId = replayService.createSession('Test Session');
      replayService.addEvent(sessionId, 'test', 'source', { data: 'value' });
      replayService.finalizeSession(sessionId);

      const csv = replayService.exportSessionAsCSV(sessionId);

      expect(csv).toBeDefined();
      expect(csv).toContain('id,timestamp,type,source,data');
      expect(csv).toContain('test');
    });

    test('should import session from JSON', () => {
      const sessionId = replayService.createSession('Test Session');
      replayService.addEvent(sessionId, 'test', 'source', { data: 'value' });
      replayService.finalizeSession(sessionId);

      const json = replayService.exportSession(sessionId)!;

      // Importar en nueva sesión
      const newSessionId = replayService.importSession(json);

      expect(newSessionId).not.toBe(sessionId); // Nuevo ID generado
      expect(newSessionId).toBeDefined();

      const imported = replayService.getSession(newSessionId);
      expect(imported).not.toBeNull();
      expect(imported?.events).toHaveLength(1);
      expect(imported?.name).toBe('Test Session');
    });

    test('should return null when exporting non-existent session', () => {
      const json = replayService.exportSession('non-existent');
      expect(json).toBeNull();
    });
  });

  describe('Eventos', () => {
    test('should emit session:created event', async () => {
      const promise = new Promise<void>((resolve) => {
        replayService.on('session:created', (session) => {
          expect(session.name).toBe('Test');
          resolve();
        });
      });

      replayService.createSession('Test');
      await promise;
    });

    test('should emit session:finalized event', async () => {
      const sessionId = replayService.createSession('Test');

      const promise = new Promise<void>((resolve) => {
        replayService.on('session:finalized', (session) => {
          expect(session.id).toBe(sessionId);
          resolve();
        });
      });

      replayService.finalizeSession(sessionId);
      await promise;
    });

    test('should emit replay:completed event', async () => {
      const sessionId = replayService.createSession('Test');
      replayService.addEvent(sessionId, 'test', 'source', {});
      replayService.finalizeSession(sessionId);

      const promise = new Promise<void>((resolve) => {
        replayService.on('replay:completed', (state) => {
          expect(state.sessionId).toBe(sessionId);
          replayService.stopReplay(sessionId);
          resolve();
        });
      });

      // Configurar velocidad alta para completar rápido
      replayService.startReplay(sessionId, () => {}, { speed: 100 });
      await promise;
    });
  });
});
