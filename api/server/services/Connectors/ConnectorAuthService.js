/**
 * ConnectorAuthService
 * ---------------------------------------------------------------------------
 * Guarda y recupera de forma segura los tokens OAuth que un usuario conecta
 * para navegar/buscar SUS propios repositorios en GitHub o Hugging Face desde
 * el chat. Reutiliza el mismo mecanismo de cifrado que ya usa LibreChat para
 * las credenciales de plugins (PluginAuth), pero con un "pluginKey" propio
 * para no mezclarse con las auth de plugins/acciones existentes.
 *
 * IMPORTANTE: esto es DISTINTO del login social /oauth/github (SSO para
 * entrar a LibreChat). Aquí el usuario YA está logueado en LibreChat y sólo
 * está conectando una cuenta externa para poder buscar/seleccionar repos.
 */
const { encrypt, decrypt } = require('@librechat/api');
const { findOnePluginAuth, updatePluginAuth, deletePluginAuth } = require('~/models');

const CONNECTOR_PREFIX = 'connector';

/** @param {'github'|'huggingface'} provider */
const pluginKey = (provider) => `${CONNECTOR_PREFIX}:${provider}`;

/**
 * Guarda (o actualiza) el token de acceso de un proveedor para un usuario.
 * @param {{ userId: string, provider: 'github'|'huggingface', accessToken: string, refreshToken?: string, meta?: object }} params
 */
async function saveConnectorToken({ userId, provider, accessToken, refreshToken, meta }) {
  const value = JSON.stringify({
    accessToken,
    refreshToken: refreshToken || null,
    meta: meta || null,
    connectedAt: new Date().toISOString(),
  });

  return updatePluginAuth({
    userId,
    authField: 'CONNECTOR_TOKEN',
    pluginKey: pluginKey(provider),
    value: await encrypt(value),
  });
}

/**
 * Recupera y desencripta el token guardado de un proveedor para un usuario.
 * @returns {Promise<null|{accessToken: string, refreshToken: string|null, meta: object|null, connectedAt: string}>}
 */
async function getConnectorToken({ userId, provider }) {
  const record = await findOnePluginAuth({
    userId,
    authField: 'CONNECTOR_TOKEN',
    pluginKey: pluginKey(provider),
  });

  if (!record) {
    return null;
  }

  const decrypted = await decrypt(record.value);
  return JSON.parse(decrypted);
}

async function disconnectProvider({ userId, provider }) {
  return deletePluginAuth({
    userId,
    authField: 'CONNECTOR_TOKEN',
    pluginKey: pluginKey(provider),
  });
}

module.exports = {
  saveConnectorToken,
  getConnectorToken,
  disconnectProvider,
};
