import { atom } from 'recoil';
import { defaultPreferences, type SoundPreferences } from '~/services/sound/SoundService';

/** Preferencias de sonido del usuario (persistidas en backend, no en localStorage). */
export const soundPreferencesAtom = atom<SoundPreferences>({
  key: 'soundPreferences',
  default: defaultPreferences(),
});
