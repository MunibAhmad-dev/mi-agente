/**
 * Browser Runtime - Automatización de Navegador con Playwright (JavaScript)
 *
 * Proporciona capacidades de automatización de navegador:
 * - Navegar a URLs
 * - Capturar screenshots
 * - Extraer contenido
 * - Interactuar con elementos (click, typing)
 *
 * FLUJO:
 * ExecutionEngine → BrowserRuntime.execute() → Playwright → Browser Actions
 */

const { getEventBus, EventType } = require('../EventBus');
const { Capability } = require('../RuntimeRegistry');

const logger = {
  debug: (...args) => console.log('[BrowserRuntime]', ...args),
  info: (...args) => console.log('[BrowserRuntime]', ...args),
  warn: (...args) => console.warn('[BrowserRuntime]', ...args),
  error: (...args) => console.error('[BrowserRuntime]', ...args),
};

// Estado del navegador
const BrowserState = {
  CLOSED: 'closed',
  OPEN: 'open',
  NAVIGATING: 'navigating',
};

// Acciones disponibles
const BrowserActions = {
  NAVIGATE: 'navigate',
  CLICK: 'click',
  TYPE: 'type',
  SCREENSHOT: 'screenshot',
  EXTRACT: 'extract',
  EVALUATE: 'evaluate',
  WAIT: 'wait',
  SCROLL: 'scroll',
};

/**
 * Mock Provider — SOLO para desarrollo/tests, NUNCA como fallback de
 * producción.
 *
 * (Auditoría forense 10-ago-2026, hallazgo S2: este provider se usaba como
 * fallback silencioso cuando Playwright no estaba disponible o fallaba,
 * haciendo que el sistema "creyera" que navegó/sacó screenshot cuando en
 * realidad no hizo nada. A partir de la Fase 7 el flujo de producción falla
 * explícitamente si Playwright no está disponible.)
 */
class MockBrowserProvider {
  constructor(config = {}) {
    this.name = 'mock';
    this.config = config;
    this.state = BrowserState.CLOSED;
    this.currentUrl = null;
  }

  async initialize() {
    this.state = BrowserState.OPEN;
    logger.info('[MockBrowser] Initialized');
    return true;
  }

  async navigate(url) {
    if (this.state !== BrowserState.OPEN) {
      await this.initialize();
    }

    this.state = BrowserState.NAVIGATING;
    logger.debug(`[MockBrowser] Navigating to: ${url}`);

    // Simular navegación
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.currentUrl = url;
    this.state = BrowserState.OPEN;

    return {
      url: url,
      title: `Mock Page - ${url}`,
      status: 200,
    };
  }

  async screenshot(options = {}) {
    logger.debug('[MockBrowser] Taking screenshot');

    // Generar placeholder SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width || 1280}" height="${options.height || 720}" viewBox="0 0 1280 720">
      <rect fill="#2d3748" width="1280" height="720"/>
      <text x="640" y="340" font-family="Arial" font-size="32" fill="white" text-anchor="middle">Screenshot Placeholder</text>
      <text x="640" y="380" font-family="Arial" font-size="16" fill="#a0aec0" text-anchor="middle">URL: ${this.currentUrl || 'N/A'}</text>
      <text x="640" y="420" font-family="Arial" font-size="12" fill="#718096" text-anchor="middle">(Install Playwright for real screenshots)</text>
    </svg>`;

    const base64 = Buffer.from(svg).toString('base64');

    return {
      image: `data:image/svg+xml;base64,${base64}`,
      format: 'svg',
      url: this.currentUrl,
    };
  }

  async extract(selector) {
    logger.debug(`[MockBrowser] Extracting: ${selector}`);

    return {
      html: `<div class="${selector}">Mock content for ${selector}</div>`,
      text: `Mock extracted text for selector: ${selector}`,
      url: this.currentUrl,
    };
  }

  async click(selector) {
    logger.debug(`[MockBrowser] Clicking: ${selector}`);
    return { success: true, selector };
  }

  async type(selector, text) {
    logger.debug(`[MockBrowser] Typing: ${text.substring(0, 20)}... in ${selector}`);
    return { success: true, selector, text };
  }

  async evaluate(script) {
    logger.debug(`[MockBrowser] Evaluating: ${script.substring(0, 50)}...`);
    return { result: 'Mock evaluation result' };
  }

  async close() {
    this.state = BrowserState.CLOSED;
    this.currentUrl = null;
    logger.info('[MockBrowser] Closed');
  }
}

/**
 * Playwright Provider real
 */
class PlaywrightProvider {
  constructor(config = {}) {
    this.name = 'playwright';
    this.config = config;
    this.browser = null;
    this.page = null;
    this.context = null;
    this.state = BrowserState.CLOSED;
  }

  async initialize() {
    // Fase 7 (auditoría S2): ya NO hay fallback silencioso a mock. Si
    // Playwright no está instalado o el navegador no puede lanzarse, esto
    // FALLA explícitamente con un error claro en vez de simular éxito.
    let playwright;
    try {
      playwright = require('playwright');
    } catch {
      throw new Error(
        '[PlaywrightProvider] Playwright no está instalado. Ejecuta: npm install playwright && npx playwright install chromium. ' +
          'No se usará el provider mock en producción.',
      );
    }

    const headless = this.config.headless !== false;
    try {
      this.browser = await playwright.chromium.launch({ headless });
      this.context = await this.browser.newContext({
        viewport: this.config.viewport || { width: 1280, height: 720 },
      });
      this.page = await this.context.newPage();
      this.state = BrowserState.OPEN;

      logger.info('[PlaywrightProvider] Browser launched');
      return true;
    } catch (error) {
      logger.error('[PlaywrightProvider] Failed to initialize:', error.message);
      throw new Error(
        `[PlaywrightProvider] No se pudo lanzar Chromium: ${error.message}. ` +
          'Verifica que playwright esté instalado (npx playwright install chromium) y que ' +
          'haya un navegador disponible en el sistema.',
      );
    }
  }

  async navigate(url) {
    this.state = BrowserState.NAVIGATING;
    const response = await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: this.config.navigationTimeout || 30000,
    });

    this.state = BrowserState.OPEN;

    return {
      url: this.page.url(),
      title: await this.page.title(),
      status: response?.status() || 200,
    };
  }

  async screenshot(options = {}) {
    const screenshot = await this.page.screenshot({
      fullPage: options.fullPage || false,
      type: options.format === 'jpeg' ? 'jpeg' : 'png',
      quality: options.quality,
    });

    return {
      image: `data:image/png;base64,${screenshot.toString('base64')}`,
      format: options.format || 'png',
      url: this.page.url(),
    };
  }

  async extract(selector) {
    const element = this.page.locator(selector).first();
    const html = await element.innerHTML();
    const text = await element.innerText();

    return {
      html,
      text,
      url: this.page.url(),
    };
  }

  async click(selector) {
    await this.page.locator(selector).click();
    return { success: true, selector };
  }

  async type(selector, text) {
    await this.page.locator(selector).fill(text);
    return { success: true, selector, text };
  }

  async evaluate(script) {
    const result = await this.page.evaluate(script);
    return { result };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    this.state = BrowserState.CLOSED;
    logger.info('[PlaywrightProvider] Browser closed');
  }
}

/**
 * Browser Runtime - Clase principal
 */
class BrowserRuntime {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.name = 'BrowserRuntime';
    this.capabilities = [
      Capability.BROWSER_AUTOMATION,
      Capability.WEB_SCRAPING,
      Capability.SCREENSHOT,
    ];
    this.status = 'initializing';

    // Inicializar proveedor
    this.provider = new PlaywrightProvider(config);

    this.config = {
      headless: config.headless !== false,
      viewport: config.viewport || { width: 1280, height: 720 },
      navigationTimeout: config.navigationTimeout || 30000,
      screenshotTimeout: config.screenshotTimeout || 60000,
      ...config,
    };
  }

  /**
   * Inicializar el runtime
   */
  async initialize() {
    await this.provider.initialize();
    this.status = 'ready';

    logger.info('[BrowserRuntime] Initialized with provider:', this.provider.name);

    this.eventBus.publish(
      'runtime.ready',
      {
        runtime: this.name,
        capabilities: this.capabilities,
        provider: this.provider.name,
      },
      'BrowserRuntime',
    );

    return true;
  }

  /**
   * Ejecutar acción de navegador
   */
  async execute(task) {
    const startTime = Date.now();
    const { action, url, selector, text, script, options = {} } = task;

    logger.debug(`[BrowserRuntime] Action: ${action}`);

    this.eventBus.publish(
      EventType.EXECUTION_STARTED,
      {
        runtime: this.name,
        action,
      },
      'BrowserRuntime',
    );

    try {
      let result;

      switch (action) {
        case BrowserActions.NAVIGATE:
          result = await this.provider.navigate(url);
          break;

        case BrowserActions.SCREENSHOT:
          if (!this.provider.currentUrl && !url) {
            throw new Error('Navigate to a URL first');
          }
          if (url) {
            await this.provider.navigate(url);
          }
          result = await this.provider.screenshot(options);
          break;

        case BrowserActions.CLICK:
          if (!this.provider.currentUrl) {
            throw new Error('Navigate to a URL first');
          }
          result = await this.provider.click(selector);
          break;

        case BrowserActions.TYPE:
          if (!this.provider.currentUrl) {
            throw new Error('Navigate to a URL first');
          }
          result = await this.provider.type(selector, text);
          break;

        case BrowserActions.EXTRACT:
          if (!this.provider.currentUrl) {
            throw new Error('Navigate to a URL first');
          }
          result = await this.provider.extract(selector);
          break;

        case BrowserActions.EVALUATE:
          if (!this.provider.currentUrl) {
            throw new Error('Navigate to a URL first');
          }
          result = await this.provider.evaluate(script);
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          runtime: this.name,
          action,
          duration,
        },
        'BrowserRuntime',
      );

      return {
        action,
        ...result,
        latency: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          runtime: this.name,
          action,
          error: error.message,
          duration,
        },
        'BrowserRuntime',
      );

      logger.error('[BrowserRuntime] Action failed:', error.message);
      throw error;
    }
  }

  /**
   * Navegar a URL
   */
  async navigate(url) {
    return this.execute({ action: BrowserActions.NAVIGATE, url });
  }

  /**
   * Tomar screenshot
   */
  async screenshot(options = {}) {
    return this.execute({ action: BrowserActions.SCREENSHOT, options });
  }

  /**
   * Extraer contenido
   */
  async extract(selector) {
    return this.execute({ action: BrowserActions.EXTRACT, selector });
  }

  /**
   * Verificar salud del runtime
   */
  async healthCheck() {
    return this.status === 'ready';
  }

  /**
   * Obtener capacidades del runtime
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Apagar el runtime
   */
  async shutdown() {
    if (this.provider) {
      await this.provider.close();
    }
    this.status = 'shutdown';
    logger.info('[BrowserRuntime] Shutdown complete');
  }
}

// Singleton
let runtimeInstance = null;

function getBrowserRuntime(config) {
  if (!runtimeInstance) {
    runtimeInstance = new BrowserRuntime(config);
  }
  return runtimeInstance;
}

function createBrowserRuntime(config) {
  runtimeInstance = new BrowserRuntime(config);
  return runtimeInstance;
}

module.exports = {
  BrowserRuntime,
  PlaywrightProvider,
  MockBrowserProvider,
  BrowserActions,
  BrowserState,
  getBrowserRuntime,
  createBrowserRuntime,
};
