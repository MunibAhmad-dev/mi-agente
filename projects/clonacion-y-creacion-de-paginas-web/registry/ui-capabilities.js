// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL UI CAPABILITY REGISTRY
// Central registry for all UI components, animations, icons, charts, editors
// ═══════════════════════════════════════════════════════════════════════════════

export const UI_CAPABILITIES = {

  // ═══ PRIMITIVES ═══════════════════════════════════════════════════════════
  primitives: {
    category: 'Primitives',
    description: 'Base UI building blocks',
    items: {
      button: {
        name: 'Button',
        variants: ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link', 'icon', 'loading'],
        states: ['default', 'hover', 'active', 'disabled', 'loading'],
        features: ['gradient', 'glow', 'shadow', 'rounded', 'icon-left', 'icon-right', 'badge'],
        sources: ['reui', 'shadcn', 'tailgrids', 'animate-ui'],
        css: ['display:inline-flex', 'align-items:center', 'border-radius', 'transition'],
      },
      input: {
        name: 'Input',
        variants: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
        features: ['icon-left', 'icon-right', 'clear', 'counter', 'masked', 'otp'],
        sources: ['reui', 'shadcn', 'velora'],
      },
      card: {
        name: 'Card',
        variants: ['default', 'interactive', 'glass', 'gradient', 'bordered', 'elevated'],
        features: ['hover-lift', 'click-ripple', 'skeleton', 'loading'],
        sources: ['reui', 'tailgrids', 'animate-ui'],
      },
      badge: { name: 'Badge', variants: ['solid', 'outline', 'dot', 'count', 'status'], sources: ['shadcn', 'reui'] },
      avatar: { name: 'Avatar', variants: ['circle', 'square', 'group', 'badge', 'status-dot'], sources: ['reui', 'shadcn'] },
      separator: { name: 'Separator', variants: ['horizontal', 'vertical', 'dashed', 'gradient'], sources: ['shadcn'] },
      tooltip: { name: 'Tooltip', variants: ['dark', 'light', 'glass', 'animated'], sources: ['shadcn', 'reui'] },
      typography: { name: 'Typography', variants: ['heading', 'subheading', 'body', 'caption', 'code', 'gradient-text'], sources: ['reui'] },
    },
  },

  // ═══ NAVIGATION ═══════════════════════════════════════════════════════════
  navigation: {
    category: 'Navigation',
    description: 'Navigation components and patterns',
    items: {
      navbar: { name: 'Navbar', variants: ['fixed', 'sticky', 'transparent', 'glass', 'sidebar-integrated'], features: ['responsive-hamburger', 'mega-menu', 'search-bar', 'user-menu'], sources: ['tailgrids', 'reui', 'coreui'] },
      sidebar: { name: 'Sidebar', variants: ['fixed', 'collapsible', 'mini', 'overlay', 'nested'], features: ['active-indicator', 'badges', 'groups', 'animations'], sources: ['coreui', 'shadcn-admin', 'kiranism'] },
      breadcrumbs: { name: 'Breadcrumbs', variants: ['default', 'with-icons', 'chevron', 'dropdown'], sources: ['shadcn', 'reui'] },
      tabs: { name: 'Tabs', variants: ['underline', 'pill', 'enclosed', 'vertical', 'animated'], features: ['scrollable', 'icon-left', 'badge', 'lazy'], sources: ['shadcn', 'reui', 'animate-ui'] },
      menu: { name: 'Menu', variants: ['dropdown', 'context', 'nested', 'mega'], sources: ['shadcn', 'reui'] },
      pagination: { name: 'Pagination', variants: ['default', 'mini', 'jump', 'prev-next'], sources: ['shadcn', 'reui'] },
      command: { name: 'Command Palette', variants: ['modal', 'sidebar', 'inline'], sources: ['shadcn'] },
    },
  },

  // ═══ OVERLAYS ═════════════════════════════════════════════════════════════
  overlays: {
    category: 'Overlays',
    description: 'Modal, drawer, popover and overlay components',
    items: {
      modal: { name: 'Modal', variants: ['center', 'bottom-sheet', 'fullscreen', 'alert', 'confirm'], features: ['close-on-escape', 'close-on-backdrop', 'animation', 'stacked'], sources: ['shadcn', 'reui', 'animate-ui'] },
      drawer: { name: 'Drawer', variants: ['left', 'right', 'top', 'bottom'], features: ['swipe-to-close', 'backdrop', 'nested'], sources: ['reui', 'shadcn'] },
      popover: { name: 'Popover', variants: ['default', 'hover', 'click', 'context-menu'], sources: ['shadcn', 'reui'] },
      alert: { name: 'Alert', variants: ['info', 'success', 'warning', 'error', 'toast'], features: ['auto-dismiss', 'action-button', 'stacked'], sources: ['shadcn', 'reui'] },
      sheet: { name: 'Sheet', variants: ['side', 'bottom', 'confirmation'], sources: ['shadcn'] },
      'sheet-overlay': { name: 'Overlay', variants: ['blur', 'dark', 'light', 'gradient'], sources: ['animate-ui'] },
    },
  },

  // ═══ FORMS ════════════════════════════════════════════════════════════════
  forms: {
    category: 'Forms',
    description: 'Form components, validation, and builders',
    items: {
      form: { name: 'Form', variants: ['single-step', 'multi-step', 'wizard'], features: ['validation', 'auto-save', 'dirty-tracking'], sources: ['shadcn', 'react-form-builder'] },
      select: { name: 'Select', variants: ['single', 'multi', 'searchable', 'async', 'grouped'], sources: ['shadcn', 'reui'] },
      checkbox: { name: 'Checkbox', variants: ['default', 'card', 'group', 'indeterminate'], sources: ['shadcn'] },
      radio: { name: 'Radio', variants: ['default', 'card', 'button', 'group'], sources: ['shadcn'] },
      switch: { name: 'Switch', variants: ['default', 'with-icons', 'color'], sources: ['shadcn'] },
      slider: { name: 'Slider', variants: ['single', 'range', 'stepped', 'marked'], sources: ['shadcn'] },
      'date-picker': { name: 'DatePicker', variants: ['single', 'range', 'with-time', 'inline'], sources: ['shadcn'] },
      upload: { name: 'File Upload', variants: ['single', 'drag-drop', 'paste', 'preview-grid'], sources: ['reui'] },
      textarea: { name: 'Textarea', variants: ['default', 'auto-resize', 'rich-editor'], sources: ['shadcn'] },
      'color-picker': { name: 'ColorPicker', variants: ['hex', 'rgb', 'hsb', 'with-presets', 'gradient'], sources: ['react-colorpicker'], capabilities: ['COLOR_EXTRACTION'] },
    },
  },

  // ═══ DATA DISPLAY ═════════════════════════════════════════════════════════
  data: {
    category: 'Data Display',
    description: 'Tables, charts, calendars, and data visualization',
    items: {
      table: { name: 'Table', variants: ['basic', 'sortable', 'filterable', 'paginated', 'virtual-scroll', 'editable'], features: ['row-selection', 'column-resize', 'export', 'sticky-header'], sources: ['shadcn', 'coreui'] },
      'data-table': { name: 'DataTable', features: ['sorting', 'filtering', 'pagination', 'column-visibility', 'row-actions', 'bulk-actions'], sources: ['shadcn-admin'] },
      calendar: { name: 'Calendar', variants: ['month', 'week', 'day', 'range'], sources: ['shadcn'] },
      timeline: { name: 'Timeline', variants: ['vertical', 'horizontal', 'with-icons'], sources: ['reui'] },
      stat: { name: 'Stat Card', variants: ['default', 'with-chart', 'with-icon', 'trend'], sources: ['coreui', 'kiranism'] },
      'progress-bar': { name: 'Progress', variants: ['linear', 'circular', 'segmented', 'indeterminate'], sources: ['shadcn', 'reui'] },
      skeleton: { name: 'Skeleton', variants: ['text', 'card', 'avatar', 'chart', 'custom'], sources: ['shadcn'] },
    },
  },

  // ═══ CHARTS ═══════════════════════════════════════════════════════════════
  charts: {
    category: 'Charts',
    description: 'Charting and data visualization libraries',
    items: {
      recharts: { name: 'Recharts', type: 'library', charts: ['line', 'bar', 'area', 'pie', 'radial', 'scatter', 'composed', 'funnel', 'treemap'], features: ['responsive', 'tooltips', 'animations', 'custom-shapes'], license: 'MIT', stars: 27000, usage: 'primary' },
      'apache-echarts': { name: 'Apache ECharts', type: 'library', charts: ['line', 'bar', 'pie', 'scatter', 'map', 'graph', 'treemap', 'sankey', 'gauge', 'heatmap', 'boxplot'], license: 'Apache-2.0', usage: 'advanced' },
      nivo: { name: 'Nivo', type: 'library', charts: ['bar', 'line', 'area', 'pie', 'radar', 'treemap', 'chord', 'funnel', 'bullet'], features: ['isomorphic', 'theming', 'animations'], license: 'MIT', usage: 'alternative' },
      d3: { name: 'D3.js', type: 'library', charts: ['all'], features: ['low-level', 'svg', 'canvas', 'custom'], license: 'ISC', usage: 'low-level' },
      chartjs: { name: 'Chart.js', type: 'library', charts: ['line', 'bar', 'pie', 'doughnut', 'radar', 'polar', 'scatter', 'bubble'], license: 'MIT', usage: 'simple' },
      visx: { name: 'visx', type: 'library', features: ['low-level', 'react', 'd3-based'], license: 'MIT', usage: 'advanced' },
      plotly: { name: 'Plotly', type: 'library', charts: ['all'], features: ['3d', 'maps', 'animations'], license: 'MIT', usage: 'scientific' },
    },
  },

  // ═══ ANIMATION ════════════════════════════════════════════════════════════
  animation: {
    category: 'Animation',
    description: 'Animation libraries and patterns',
    items: {
      'anime-js': { name: 'anime.js', type: 'library', features: ['tweens', 'timelines', 'stagger', 'svg', 'keyframes', 'css-variables'], license: 'MIT', usage: 'general' },
      'framer-motion': { name: 'Framer Motion', type: 'library', features: ['layout', 'variants', 'gestures', 'animate-presence', 'scroll', 'drag'], license: 'MIT', usage: 'react-primary' },
      'motion-one': { name: 'Motion (One)', type: 'library', features: ['spring', 'scroll', 'in-view', 'timeline', 'animate'], license: 'MIT', usage: 'lightweight' },
      gsap: { name: 'GSAP', type: 'library', features: ['tweens', 'timelines', 'scroll-trigger', 'morph', 'flip', 'split-text'], license: 'free-with-conditions', usage: 'advanced', note: 'Check license for commercial use' },
      'react-bits': { name: 'React Bits', type: 'collection', count: 165, features: ['text-animations', 'backgrounds', 'ui-animations', 'interactive', 'visual-effects'], license: 'MIT', usage: 'components' },
      'animate-ui': { name: 'Animate UI', type: 'collection', features: ['copy-first', 'motion', 'tailwind', 'shadcn'], license: 'MIT', usage: 'components' },
      velora: { name: 'Velora UI', type: 'collection', count: 32, features: ['animated', 'saas-pages', 'pricing', 'blog', 'auth'], license: 'MIT', usage: 'landing-pages' },
      olova: { name: 'Olova UI', type: 'collection', count: 500, features: ['animated', 'react', 'tailwind', 'framer-motion', 'dark-mode'], license: 'MIT', usage: 'general' },
    },
    entrance: ['fade-in', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'scale-in', 'blur-in', 'bounce-in', 'flip-in', 'rotate-in'],
    exit: ['fade-out', 'slide-out', 'scale-out', 'blur-out'],
    hover: ['lift', 'glow', 'scale', 'rotate', 'shake', 'pulse', 'ripple'],
    scroll: ['fade-in-view', 'slide-in-view', 'parallax', 'sticky-reveal'],
    text: ['typewriter', 'split-text', 'wave', 'gradient-shift', 'blur-reveal'],
    background: ['gradient-shift', 'particle', 'aurora', 'mesh', 'noise'],
  },

  // ═══ ICONS ════════════════════════════════════════════════════════════════
  icons: {
    category: 'Icons',
    description: 'Icon libraries and animated icons',
    items: {
      lucide: { name: 'Lucide', type: 'library', count: 1500, features: ['tree-shakeable', 'svg', 'consistent-style'], license: 'ISC' },
      'lucide-animated': { name: 'Lucide Animated', type: 'collection', count: 350, features: ['motion-based', 'smooth-transitions'], license: 'MIT', source: 'pqoqubbw' },
      itshover: { name: 'itshover', type: 'collection', features: ['hover-animated', 'react'], license: 'Apache-2.0' },
      'motion-icons': { name: 'Motion Icons', type: 'collection', count: 3500, features: ['presets', '15-animations'], license: 'MIT' },
      'react-icons-animated': { name: 'React Icons Animated', type: 'library', features: ['animated', 'multiple-sets'], license: 'MIT' },
      fontawesome: { name: 'Font Awesome', type: 'library', count: 2000, features: ['solid', 'regular', 'brands'], license: 'free-tier' },
      heroicons: { name: 'Heroicons', type: 'library', count: 300, features: ['outline', 'solid', 'mini'], license: 'MIT' },
    },
  },

  // ═══ GRAPHICS / CANVAS ════════════════════════════════════════════════════
  graphics: {
    category: 'Graphics',
    description: 'Canvas, SVG, 3D, and drawing tools',
    items: {
      threejs: { name: 'Three.js', type: 'library', features: ['3d', 'webgl', 'scenes', 'particles', 'shaders', 'animation'], license: 'MIT', usage: '3d-when-needed' },
      fabric: { name: 'Fabric.js', type: 'library', features: ['canvas', 'shapes', 'text', 'images', 'filters', 'layers', 'undo-redo'], license: 'MIT', usage: 'canvas-editor' },
      fabriceditor: { name: 'Fabric Canvas Editor', type: 'tool', features: ['shapes', 'text', 'fonts', 'drawing', 'images', 'filters', 'colors', 'stroke', 'opacity', 'layers', 'clipboard', 'resize', 'export-png-jpg-svg-json', 'ai-bg-removal'], license: 'MIT', framework: 'fabric+react+tailwind+shadcn', usage: 'visual-editor' },
      excalidraw: { name: 'Excalidraw', type: 'tool', features: ['freehand', 'rectangles', 'circles', 'arrows', 'text', 'images', 'zoom', 'pan', 'undo-redo', 'export-png-svg-json'], license: 'MIT', usage: 'annotation-whiteboard' },
      lottie: { name: 'Lottie', type: 'library', features: ['vector-animation', 'after-effects-export'], license: 'MIT', note: 'lottie-react archived Jun 2026' },
    },
  },

  // ═══ MARKETING / LANDING ══════════════════════════════════════════════════
  marketing: {
    category: 'Marketing',
    description: 'Landing page sections and marketing patterns',
    items: {
      hero: { name: 'Hero Section', variants: ['centered', 'split', 'with-image', 'with-video', 'gradient', 'particles'], sources: ['velora', 'tailgrids'] },
      pricing: { name: 'Pricing', variants: ['cards', 'table', 'toggle-monthly-yearly', 'feature-compare'], sources: ['velora', 'reui'] },
      testimonials: { name: 'Testimonials', variants: ['cards', 'carousel', 'with-rating', 'video'], sources: ['velora', 'tailgrids'] },
      faq: { name: 'FAQ', variants: ['accordion', 'tabs', 'searchable'], sources: ['reui'] },
      cta: { name: 'CTA', variants: ['banner', 'inline', 'gradient', 'with-image'], sources: ['velora', 'tailgrids'] },
      footer: { name: 'Footer', variants: ['simple', 'multi-column', 'newsletter', 'social'], sources: ['tailgrids'] },
      funnel: { name: 'Funnel Pattern', steps: ['hero', 'problem', 'solution', 'features', 'social-proof', 'testimonials', 'pricing', 'faq', 'cta', 'footer'] },
    },
  },

  // ═══ DASHBOARD TEMPLATES ═════════════════════════════════════════════════
  dashboard: {
    category: 'Dashboard Templates',
    description: 'Pre-built dashboard layouts and patterns',
    items: {
      coreui: { name: 'CoreUI React', stack: 'React/Vite', license: 'MIT', score: 9.8, features: ['40+ components', 'dark-mode', 'RTL', 'i18n', 'charts'], source: 'https://github.com/coreui/coreui-free-react-admin-template' },
      antdesign: { name: 'Ant Design Pro', stack: 'React', license: 'MIT', score: 9.8, features: ['pro-components', 'dashboards', 'forms', 'tables', 'charts'], source: 'https://github.com/ant-design/ant-design-pro' },
      shadcnadmin: { name: 'Shadcn Admin', stack: 'React/Vite', license: 'MIT', score: 9.7, features: ['shadcn-ui', 'dark-mode', 'sidebar', 'authentication'], source: 'https://github.com/shadcn-ui/ui' },
      kiranism: { name: 'Kiranism Dashboard', stack: 'Next.js', license: 'MIT', score: 9.7, features: ['shadcn', 'dark-mode', 'responsive', 'auth'], source: 'https://github.com/Kiranism/next-shadcn-dashboard-starter' },
      nextadmin: { name: 'NextAdmin', stack: 'Next.js', license: 'MIT', score: 9.7, features: ['shadcn', 'prisma', 'next-auth'], source: 'https://github.com/NextAdminHQ/nextjs-admin-dashboard' },
      orbynadmin: { name: 'OrbynAdmin', stack: 'Next.js', license: 'MIT', score: 9.4, features: ['modern-ui', 'components', 'dark-mode'], source: 'https://github.com/masondevx/orbynadmin' },
      horizon: { name: 'Horizon UI', stack: 'React/Tailwind', license: 'MIT', score: 8.7, features: ['chakra-based', 'dashboards', 'charts'], source: 'https://github.com/horizon-ui/horizon-tailwind-react' },
      tailadmin: { name: 'TailAdmin', stack: 'React', license: 'MIT', score: 9.4, features: ['tailwind', 'admin', 'dashboard'], source: 'https://github.com/TailAdmin/free-react-tailwind-admin-dashboard' },
      shadcndashboard: { name: 'Shadcn Dashboard', stack: 'React/Vite', license: 'MIT', score: 9.4, features: ['shadcn', 'responsive', 'dark-mode'], source: 'https://github.com/shadcndashboard/shadcndashboard' },
      tokio: { name: 'Tokyo Free White', stack: 'React', license: 'MIT', score: 8.3, features: ['admin', 'react', 'components'], source: 'https://github.com/bloomui/tokyo-free-white-react-admin-dashboard' },
      zce: { name: 'ZCE Dashboard', stack: 'React', license: 'MIT', score: 8.3, features: ['dashboard', 'admin'], source: 'https://github.com/zce/dashboard' },
      sakai: { name: 'PrimeFaces Sakai React', stack: 'Next.js/React', license: 'MIT', score: 9.2, features: ['prime-react', 'dashboards', 'components'], source: 'https://github.com/primefaces/sakai-react' },
    },
  },

  // ═══ FORM BUILDERS ════════════════════════════════════════════════════════
  'form-builders': {
    category: 'Form Builders',
    description: 'Dynamic form and UI builder tools',
    items: {
      coltor: { name: 'Coltor Builder', type: 'tool', features: ['website-builder', 'ui-builder', 'dashboard-builder', 'landing-page-builder', 'headless', 'full-stack', 'framework-agnostic'], license: 'MIT', usage: 'critical' },
      reactformbuilder: { name: 'React Form Builder', type: 'tool', features: ['drag-drop', 'preview', 'validation', 'json-schema'], license: 'MIT' },
      onebeyond: { name: 'OneBeyond Form Builder', type: 'tool', features: ['dynamic', 'configurable', 'react'], license: 'MIT' },
    },
  },
};

// ═══ CAPABILITY ROUTER ═══════════════════════════════════════════════════════
// Maps detected UI elements → required capabilities → recommended sources

export const CAPABILITY_MAP = {
  'button-gradient': ['primitives.button'],
  'button-animated': ['primitives.button'],
  'card-glass': ['primitives.card'],
  'card-hover-lift': ['primitives.card'],
  'modal-animated': ['overlays.modal'],
  'modal-bottom-sheet': ['overlays.modal'],
  'sidebar-collapsible': ['navigation.sidebar'],
  'table-sortable': ['data.table'],
  'chart-line': ['charts.recharts'],
  'chart-bar': ['charts.recharts'],
  'chart-pie': ['charts.recharts'],
  'chart-advanced': ['charts.apache-echarts'],
  'chart-3d': ['charts.plotly'],
  'form-wizard': ['forms.form'],
  'upload-drag': ['forms.upload'],
  'icon-animated': ['icons.lucide-animated'],
  '3d-scene': ['graphics.threejs'],
  'canvas-editor': ['graphics.fabriceditor'],
  'whiteboard': ['graphics.excalidraw'],
  'landing-hero': ['marketing.hero'],
  'landing-pricing': ['marketing.pricing'],
  'funnel': ['marketing.funnel'],
  'dashboard-analytics': ['dashboard.coreui'],
  'dashboard-admin': ['dashboard.shadcnadmin'],
  'color-picker': ['forms.color-picker'],
  'date-picker': ['forms.date-picker'],
  'tabs-animated': ['navigation.tabs'],
  'navbar-glass': ['navigation.navbar'],
  'tooltip-animated': ['primitives.tooltip'],
  'avatar-group': ['primitives.avatar'],
  'badge-count': ['primitives.badge'],
  'progress-bar': ['data.progress-bar'],
  'skeleton-loading': ['data.skeleton'],
  'timeline': ['data.timeline'],
  'stat-card': ['data.stat'],
  'pagination': ['navigation.pagination'],
  'breadcrumbs': ['navigation.breadcrumbs'],
  'context-menu': ['navigation.menu'],
  'command-palette': ['navigation.command'],
  'drawer': ['overlays.drawer'],
  'popover': ['overlays.popover'],
  'alert-toast': ['overlays.alert'],
  'checkbox': ['forms.checkbox'],
  'radio': ['forms.radio'],
  'switch': ['forms.switch'],
  'slider': ['forms.slider'],
  'select': ['forms.select'],
  'textarea': ['forms.textarea'],
  'hero-section': ['marketing.hero'],
  'pricing-cards': ['marketing.pricing'],
  'testimonial': ['marketing.testimonials'],
  'faq': ['marketing.faq'],
  'cta-section': ['marketing.cta'],
  'footer': ['marketing.footer'],
  'chart-area': ['charts.recharts'],
  'chart-scatter': ['charts.recharts'],
  'chart-funnel': ['charts.recharts'],
  'chart-gauge': ['charts.apache-echarts'],
  'chart-heatmap': ['charts.apache-echarts'],
  'canvas-drawing': ['graphics.fabric'],
  'vector-animation': ['graphics.lottie'],
  '3d-webgl': ['graphics.threejs'],
  'form-builder': ['form-builders.coltor'],
  'dashboard-modern': ['dashboard.coreui', 'dashboard.kiranism'],
  'dashboard-shadcn': ['dashboard.shadcnadmin', 'dashboard.kiranism'],
};

// ═══ REPOSITORY INTEGRATION LIST ════════════════════════════════════════════

export const REPO_INTEGRATIONS = [
  // GitHub repos the user wants integrated
  { url: 'https://github.com/NextAdminHQ/nextjs-admin-dashboard', name: 'NextAdmin', priority: 1, status: 'registered' },
  { url: 'https://github.com/Kiranism/next-shadcn-dashboard-starter', name: 'Kiranism Dashboard', priority: 1, status: 'registered' },
  { url: 'https://github.com/shadcndashboard/shadcndashboard', name: 'Shadcn Dashboard', priority: 1, status: 'registered' },
  { url: 'https://github.com/masondevx/orbynadmin', name: 'OrbynAdmin', priority: 1, status: 'registered' },
  { url: 'https://github.com/TailAdmin/free-react-tailwind-admin-dashboard', name: 'TailAdmin React', priority: 1, status: 'registered' },
  { url: 'https://github.com/horizon-ui/horizon-tailwind-react', name: 'Horizon UI', priority: 2, status: 'registered' },
  { url: 'https://github.com/bloomui/tokyo-free-white-react-admin-dashboard', name: 'Tokyo Free White', priority: 2, status: 'registered' },
  { url: 'https://github.com/creativetimofficial/material-tailwind-dashboard-react', name: 'Material Tailwind', priority: 2, status: 'registered' },
  { url: 'https://github.com/zce/dashboard', name: 'ZCE Dashboard', priority: 3, status: 'registered' },
  { url: 'https://github.com/wilocampo/tailadminlte-vue', name: 'TailAdmin Vue', priority: 3, status: 'registered' },
  { url: 'https://github.com/chanseek/shadcn-dashboard', name: 'Shadcn Dashboard (chanseek)', priority: 2, status: 'registered' },
];

// ═══ HELPER FUNCTIONS ════════════════════════════════════════════════════════

export function searchCapabilities(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const [catKey, cat] of Object.entries(UI_CAPABILITIES)) {
    if (!cat.items) continue;
    for (const [itemKey, item] of Object.entries(cat.items)) {
      const searchable = [item.name, item.type, item.license, ...(item.features || []), ...(item.variants || [])].join(' ').toLowerCase();
      if (searchable.includes(q) || itemKey.includes(q) || catKey.includes(q)) {
        results.push({ category: cat.category, key: itemKey, ...item });
      }
    }
  }
  return results;
}

export function getCapabilitiesForElement(elementType) {
  const caps = CAPABILITY_MAP[elementType] || [];
  const resolved = [];
  for (const cap of caps) {
    const parts = cap.split('.');
    let ref = UI_CAPABILITIES;
    for (const p of parts) {
      // Try direct property, then items sub-object
      if (ref && ref.items && ref.items[p]) ref = ref.items[p];
      else ref = ref?.[p];
    }
    if (ref) resolved.push({ path: cap, ...ref });
  }
  return resolved;
}

export function getAllLicenses() {
  const licenses = new Map();
  for (const cat of Object.values(UI_CAPABILITIES)) {
    if (!cat.items) continue;
    for (const item of Object.values(cat.items)) {
      if (item.license) {
        const existing = licenses.get(item.license) || { count: 0, items: [] };
        existing.count++;
        existing.items.push(item.name);
        licenses.set(item.license, existing);
      }
    }
  }
  return Object.fromEntries(licenses);
}

export function getRepoStatus() {
  return REPO_INTEGRATIONS.map(r => ({
    name: r.name,
    url: r.url,
    priority: r.priority,
    status: r.status,
  }));
}
