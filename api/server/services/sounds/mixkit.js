/**
 * MixkitSoundProvider — Mixkit NO tiene API pública para búsqueda de sonidos
 * (verificado: solo ofrece descargas desde su web; los acortadores/scrapers
 * violan sus términos). En lugar de acoplar scraping frágil, este proveedor
 * expone un catálogo CURADO de sonidos populares de Mixkit con su enlace
 * oficial. FASE 22.
 *
 * - Sin API key, sin scraping: cada entrada apunta a la página de Mixkit.
 * - Licencia Mixkit Free: uso comercial y personal libre, sin atribución
 *   (https://mixkit.co/license/). El usuario descarga desde su web.
 * - previewUrl: null (no hotlinking directo de sus assets, que son inestables).
 */

const MIXKIT_SOUNDS = [
  {
    id: 'mixkit:soft-digital-chime',
    name: 'Soft Digital Chime',
    category: 'Notification',
    duration: 1.0,
    tags: ['notification', 'chime', 'digital', 'soft'],
    pageUrl: 'https://mixkit.co/free-sound-effects/notification/',
  },
  {
    id: 'mixkit:message-tone',
    name: 'Message Tone',
    category: 'Message',
    duration: 1.2,
    tags: ['message', 'notification', 'pop', 'digital'],
    pageUrl: 'https://mixkit.co/free-sound-effects/notification/',
  },
  {
    id: 'mixkit:success-chime',
    name: 'Success Chime',
    category: 'Success',
    duration: 1.4,
    tags: ['success', 'task complete', 'chime', 'positive'],
    pageUrl: 'https://mixkit.co/free-sound-effects/success/',
  },
  {
    id: 'mixkit:error-alert',
    name: 'Error Alert',
    category: 'Error',
    duration: 1.0,
    tags: ['error', 'alert', 'warning', 'digital'],
    pageUrl: 'https://mixkit.co/free-sound-effects/error/',
  },
  {
    id: 'mixkit:warning-beep',
    name: 'Warning Beep',
    category: 'Warning',
    duration: 0.8,
    tags: ['warning', 'beep', 'attention', 'alert'],
    pageUrl: 'https://mixkit.co/free-sound-effects/warning/',
  },
  {
    id: 'mixkit:ai-interface',
    name: 'AI Interface',
    category: 'AI',
    duration: 1.6,
    tags: ['ai', 'interface', 'digital', 'sci-fi', 'processing'],
    pageUrl: 'https://mixkit.co/free-sound-effects/technology/',
  },
  {
    id: 'mixkit:click-pop',
    name: 'Click Pop',
    category: 'Interface',
    duration: 0.2,
    tags: ['click', 'pop', 'interface', 'ui'],
    pageUrl: 'https://mixkit.co/free-sound-effects/click/',
  },
  {
    id: 'mixkit:task-done',
    name: 'Task Done',
    category: 'Task',
    duration: 1.1,
    tags: ['task', 'done', 'complete', 'pop'],
    pageUrl: 'https://mixkit.co/free-sound-effects/success/',
  },
  {
    id: 'mixkit:system-ding',
    name: 'System Ding',
    category: 'System',
    duration: 0.9,
    tags: ['system', 'ding', 'notification', 'interface'],
    pageUrl: 'https://mixkit.co/free-sound-effects/notification/',
  },
  {
    id: 'mixkit:file-transfer',
    name: 'File Transfer',
    category: 'File',
    duration: 1.3,
    tags: ['file', 'transfer', 'task', 'done'],
    pageUrl: 'https://mixkit.co/free-sound-effects/technology/',
  },
  {
    id: 'mixkit:connection-up',
    name: 'Connection Up',
    category: 'System',
    duration: 0.7,
    tags: ['connection', 'api', 'success', 'network'],
    pageUrl: 'https://mixkit.co/free-sound-effects/technology/',
  },
  {
    id: 'mixkit:keyboard-typing',
    name: 'Keyboard Typing',
    category: 'Interface',
    duration: 0.6,
    tags: ['keyboard', 'typing', 'interface', 'ui'],
    pageUrl: 'https://mixkit.co/free-sound-effects/click/',
  },
];

const LICENSE = {
  license: 'Mixkit Free License — uso comercial y personal, sin atribución',
  licenseUrl: 'https://mixkit.co/license/',
  attributionRequired: false,
  commercialUseAllowed: true,
  provider: 'mixkit',
};

function searchMixkit({ q = '', category = '', maxDuration = 0 }) {
  const query = q.toLowerCase();
  return MIXKIT_SOUNDS.filter((s) => {
    if (category && s.category.toLowerCase() !== category.toLowerCase()) return false;
    if (maxDuration > 0 && s.duration > maxDuration) return false;
    if (!query) return true;
    const hay = [s.name, s.category, ...s.tags].join(' ').toLowerCase();
    return query.split(/\s+/).every((part) => hay.includes(part));
  }).map((s) => ({ ...s, ...LICENSE, previewUrl: null }));
}

function getMixkitSound(id) {
  const bare = String(id || '').replace(/^mixkit:/, '');
  const found = MIXKIT_SOUNDS.find((s) => s.id === `mixkit:${bare}` || s.id === bare);
  if (!found) {
    return null;
  }
  return { ...found, ...LICENSE, previewUrl: null };
}

module.exports = { searchMixkit, getMixkitSound, MIXKIT_SOUNDS };
