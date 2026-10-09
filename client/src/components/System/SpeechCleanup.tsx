import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

/**
 * SpeechCleanup — FASE 26.
 *
 * Detiene la lectura en voz alta (speechSynthesis) cuando:
 *  - el usuario sale del chat (cambio de ruta: /c/:id → /c/new, /search, ...)
 *  - el usuario borra el chat activo (navega a /c/new tras el borrado)
 *
 * Sin esto, el audio seguía sonando aunque la conversación ya no estuviera
 * visible. Es un oyente global: no depende de que el componente del mensaje
 * se desmonte (que es lo que fallaba al navegar dentro del layout).
 */
export default function SpeechCleanup() {
  const location = useLocation();
  const { conversationId } = useParams();

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
  }, [location.pathname, conversationId]);

  return null;
}
