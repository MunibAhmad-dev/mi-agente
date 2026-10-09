/**
 * LocalSoundProvider — biblioteca local de tonos sintetizados (FASE 20).
 *
 * Los tonos se GENERAN en el navegador (Web Audio API) según el `id`; el
 * backend solo sirve la metadata (nombre, duración, categoría, licencia).
 * No requiere red, no tiene atribución y permite uso comercial — sin
 * dependencias de terceros ni claves.
 */

const LOCAL_SOUNDS = [
  {
    id: 'chime-soft-digital',
    name: 'Soft Digital Chime',
    category: 'AI',
    duration: 0.9,
    tags: ['ai', 'notification', 'chime', 'digital', 'soft'],
  },
  {
    id: 'success-chime',
    name: 'Success Chime',
    category: 'Success',
    duration: 1.0,
    tags: ['success', 'task complete', 'task finished', 'chime', 'positive'],
  },
  {
    id: 'message-digital',
    name: 'Digital Message',
    category: 'Message',
    duration: 0.6,
    tags: ['message', 'ai', 'notification', 'digital', 'pop'],
  },
  {
    id: 'notification-soft',
    name: 'Soft Notification',
    category: 'Notification',
    duration: 0.7,
    tags: ['notification', 'system', 'ding', 'soft'],
  },
  {
    id: 'alert-soft',
    name: 'Soft Alert',
    category: 'Warning',
    duration: 0.8,
    tags: ['warning', 'alert', 'attention', 'soft'],
  },
  {
    id: 'error-notification',
    name: 'Error Notification',
    category: 'Error',
    duration: 0.9,
    tags: ['error', 'failure', 'notification', 'digital'],
  },
  {
    id: 'process-start',
    name: 'Process Start',
    category: 'Task',
    duration: 0.5,
    tags: ['task', 'process', 'start', 'begin', 'interface'],
  },
  {
    id: 'file-done',
    name: 'File Operation Done',
    category: 'File',
    duration: 0.5,
    tags: ['file', 'task complete', 'done', 'pop'],
  },
  {
    id: 'connection-ok',
    name: 'Connection Established',
    category: 'System',
    duration: 0.4,
    tags: ['connection', 'api', 'success', 'system'],
  },
  {
    id: 'click-pop',
    name: 'Click Pop',
    category: 'Interface',
    duration: 0.15,
    tags: ['click', 'pop', 'interface', 'ui'],
  },
  {
    id: 'sci-fi-digital',
    name: 'Sci-Fi Digital',
    category: 'Interface',
    duration: 0.8,
    tags: ['sci-fi', 'digital', 'interface', 'processing'],
  },
  {
    id: 'interface-chime',
    name: 'Interface Chime',
    category: 'Interface',
    duration: 0.7,
    tags: ['interface', 'chime', 'system', 'notification'],
  },
];

const LIC = {
  license: 'Sintetizado localmente (Web Audio API)',
  licenseUrl: '',
  attributionRequired: false,
  commercialUseAllowed: true,
  provider: 'local',
};

function searchLocalCatalog({ q = '', category = '', maxDuration = 0 }) {
  const query = q.toLowerCase();
  return LOCAL_SOUNDS.filter((s) => {
    if (category && s.category.toLowerCase() !== category.toLowerCase()) return false;
    if (maxDuration > 0 && s.duration > maxDuration) return false;
    if (!query) return true;
    const hay = [s.name, s.category, ...s.tags].join(' ').toLowerCase();
    return query.split(/\s+/).every((part) => hay.includes(part));
  }).map((s) => ({ ...s, ...LIC, id: `local:${s.id}` }));
}

function getLocalSound(id) {
  const bare = String(id || '').replace(/^local:/, '');
  const found = LOCAL_SOUNDS.find((s) => s.id === bare);
  if (!found) return null;
  return { ...found, ...LIC, id: `local:${found.id}` };
}

module.exports = { searchLocalCatalog, getLocalSound, LOCAL_SOUNDS };
