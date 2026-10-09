const crypto = require('crypto');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { providers, isValidProvider } = require('~/server/services/Connectors/providers');
const {
  saveConnectorToken,
  getConnectorToken,
  disconnectProvider,
} = require('~/server/services/Connectors/ConnectorAuthService');

const router = express.Router();
router.use(requireJwtAuth);

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

/** Guarda el state anti-CSRF de forma efímera en memoria por usuario+provider. */
const pendingStates = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;

function stashState(userId, provider, state) {
  const key = `${userId}:${provider}`;
  pendingStates.set(key, state);
  setTimeout(() => pendingStates.delete(key), STATE_TTL_MS).unref?.();
}

function consumeState(userId, provider, state) {
  const key = `${userId}:${provider}`;
  const expected = pendingStates.get(key);
  pendingStates.delete(key);
  return expected && expected === state;
}

/**
 * GET /api/connectors
 * Lista los proveedores disponibles y si el usuario ya los conectó.
 */
router.get('/', async (req, res) => {
  try {
    const list = await Promise.all(
      Object.values(providers).map(async (provider) => {
        const token = await getConnectorToken({ userId: req.user.id, provider: provider.key });
        return {
          provider: provider.key,
          label: provider.label,
          connected: !!token,
          meta: token?.meta || null,
        };
      }),
    );
    res.json(list);
  } catch (error) {
    logger.error('[Connectors] Failed to list providers', error);
    res.status(500).json({ error: 'Failed to list connectors' });
  }
});

/**
 * GET /api/connectors/:provider/login
 * Redirige al usuario a la pantalla de autorización de GitHub / Hugging Face.
 */
router.get('/:provider/login', (req, res) => {
  const { provider: providerName } = req.params;
  if (!isValidProvider(providerName)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  const provider = providers[providerName];

  if (!provider.clientId() || !provider.clientSecret()) {
    return res
      .status(500)
      .json({ error: `${provider.label} connector is not configured on the server` });
  }

  const state = crypto.randomBytes(24).toString('hex');
  stashState(req.user.id, providerName, state);

  const redirectUri = `${domains.server}/api/connectors/${providerName}/callback`;
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', provider.clientId());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', provider.scope);
  url.searchParams.set('state', state);
  if (providerName === 'huggingface') {
    url.searchParams.set('response_type', 'code');
  }

  res.redirect(url.toString());
});

/**
 * GET /api/connectors/:provider/callback
 * Intercambia el código OAuth por un access_token y lo guarda encriptado.
 */
router.get('/:provider/callback', async (req, res) => {
  const { provider: providerName } = req.params;
  const { code, state, error: oauthError } = req.query;
  const failRedirect = `${domains.client}/c/new?connector_error=${encodeURIComponent(
    providerName,
  )}`;

  if (oauthError) {
    logger.warn(`[Connectors] ${providerName} OAuth error: ${oauthError}`);
    return res.redirect(failRedirect);
  }
  if (!isValidProvider(providerName)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  if (!consumeState(req.user.id, providerName, state)) {
    logger.warn(`[Connectors] ${providerName} invalid OAuth state for user ${req.user.id}`);
    return res.redirect(failRedirect);
  }

  const provider = providers[providerName];
  const redirectUri = `${domains.server}/api/connectors/${providerName}/callback`;

  try {
    const tokenResp = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: provider.clientId(),
        client_secret: provider.clientSecret(),
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      logger.error(`[Connectors] ${providerName} token exchange failed`, tokenData);
      return res.redirect(failRedirect);
    }

    const identity = await provider.fetchIdentity(tokenData.access_token);

    await saveConnectorToken({
      userId: req.user.id,
      provider: providerName,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      meta: identity,
    });

    res.redirect(`${domains.client}/c/new?connector_connected=${providerName}`);
  } catch (error) {
    logger.error(`[Connectors] ${providerName} callback failed`, error);
    res.redirect(failRedirect);
  }
});

/**
 * DELETE /api/connectors/:provider
 * Desconecta (borra el token guardado del) proveedor para el usuario actual.
 */
router.delete('/:provider', async (req, res) => {
  const { provider: providerName } = req.params;
  if (!isValidProvider(providerName)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  await disconnectProvider({ userId: req.user.id, provider: providerName });
  res.json({ success: true });
});

/**
 * GET /api/connectors/:provider/search?q=...
 * Busca repos/modelos/datasets/spaces usando el token guardado del usuario.
 */
router.get('/:provider/search', async (req, res) => {
  const { provider: providerName } = req.params;
  const { q } = req.query;

  if (!isValidProvider(providerName)) {
    return res.status(400).json({ error: 'Unknown provider' });
  }
  const provider = providers[providerName];

  try {
    const token = await getConnectorToken({ userId: req.user.id, provider: providerName });
    if (!token && providerName === 'github') {
      return res.status(401).json({ error: 'not_connected' });
    }
    const results = await provider.search(token?.accessToken, q);
    res.json({ results });
  } catch (error) {
    logger.error(`[Connectors] ${providerName} search failed`, error);
    res.status(502).json({ error: 'search_failed' });
  }
});

module.exports = router;
