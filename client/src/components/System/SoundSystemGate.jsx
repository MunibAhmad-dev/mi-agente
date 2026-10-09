import useSoundSystem from '~/hooks/useSoundSystem';

/**
 * Monta el sistema de sonidos una sola vez (carga preferencias del backend,
 * conecta el EventBus). No renderiza nada.
 */
export default function SoundSystemGate() {
  useSoundSystem();
  return null;
}
