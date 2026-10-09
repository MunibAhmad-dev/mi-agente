// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Animation Agent (anime.js)
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON } from '../core/utils.js';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export class AnimationAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'animation',
      name: 'Animation Agent',
      capabilities: ['animation-analysis', 'transition-detection', 'animation-generation'],
    });
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Animation action: ${action}`);

    switch (action) {
      case 'analyze': return this.analyzeAnimations(task, context);
      case 'generate': return this.generateAnimations(task, context);
      case 'add-transitions': return this.addTransitions(task, context);
      case 'add-entrance': return this.addEntranceAnimations(task, context);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  // ─── Analyze existing animations ─────────────────────────────────────────

  async analyzeAnimations(task, context) {
    const projectId = context?.projectId;
    const styles = this.safeReadJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    const animations = [];
    const transitions = [];

    for (const s of (styles || [])) {
      if (s.styles?.animation && s.styles.animation !== 'none') {
        animations.push({ selector: s.selector, animation: s.styles.animation });
      }
      if (s.styles?.transition && s.styles.transition !== 'all 0s ease 0s') {
        transitions.push({ selector: s.selector, transition: s.styles.transition });
      }
    }

    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/animations.json', { animations, transitions });
    }

    return { evidence: [{ type: 'file', description: `Found ${animations.length} animations, ${transitions.length} transitions` }] };
  }

  // ─── Generate anime.js animations ────────────────────────────────────────

  async generateAnimations(task, context) {
    const { style = 'modern' } = task;
    const projectId = context?.projectId;
    const outputDir = ensureDir(projectDir(projectId) + '/output');

    this.log.info(`Generating ${style} animations with anime.js...`);

    const animationCSS = this.generateAnimationCSS(style);
    const animationJS = this.generateAnimationJS(style);

    // Append animations to existing HTML
    const htmlPath = join(outputDir, 'reconstruction.html');
    if (existsSync(htmlPath)) {
      let html = readFileSync(htmlPath, 'utf-8');

      // Add anime.js CDN if not present
      if (!html.includes('anime')) {
        html = html.replace('</head>',
          `  <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>\n</head>`);
      }

      // Add animation styles
      html = html.replace('</style>', `\n${animationCSS}\n</style>`);

      // Add animation script
      html = html.replace('</body>', `\n<script>\n${animationJS}\n</script>\n</body>`);

      writeFileSync(htmlPath, html, 'utf-8');
      this.log.info('Animations added to reconstruction');
    }

    return { evidence: [{ type: 'file', description: 'anime.js animations generated' }] };
  }

  // ─── Add CSS transitions ─────────────────────────────────────────────────

  async addTransitions(task, context) {
    const { selectors = [] } = task;
    const projectId = context?.projectId;
    const outputDir = projectDir(projectId) + '/output';
    const cssPath = join(outputDir, 'styles.css');

    if (!existsSync(cssPath)) return { evidence: [{ type: 'log', description: 'No CSS file to modify' }] };

    let css = readFileSync(cssPath, 'utf-8');

    // Add smooth transitions to interactive elements
    const transitionRules = `
/* Smooth transitions */
a, button, input, [role="button"], .nav-item, .card, .tab, .btn {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
a:hover, button:hover, [role="button"]:hover, .nav-item:hover, .card:hover, .tab:hover, .btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
a:active, button:active, [role="button"]:active, .btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
/* Focus states */
a:focus-visible, button:focus-visible, input:focus-visible {
  outline: 2px solid var(--color-accent, #5b6ef5);
  outline-offset: 2px;
}
`;

    css += transitionRules;
    writeFileSync(cssPath, css, 'utf-8');

    return { evidence: [{ type: 'file', description: 'CSS transitions added' }] };
  }

  // ─── Add entrance animations ─────────────────────────────────────────────

  async addEntranceAnimations(task, context) {
    const { type = 'fade-up' } = task;
    const projectId = context?.projectId;
    const outputDir = projectDir(projectId) + '/output';
    const htmlPath = join(outputDir, 'reconstruction.html');

    if (!existsSync(htmlPath)) return { evidence: [{ type: 'log', description: 'No HTML file to modify' }] };

    let html = readFileSync(htmlPath, 'utf-8');

    const entranceCSS = `
/* Entrance animations */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-in { animation: fadeInUp 0.6s ease forwards; }
.animate-fade { animation: fadeIn 0.4s ease forwards; }
.animate-slide { animation: slideInLeft 0.5s ease forwards; }
.animate-scale { animation: scaleIn 0.3s ease forwards; }
`;

    const entranceJS = `
// Entrance animations with Intersection Observer
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        entry.target.style.animationDelay = \`\${index * 0.05}s\`;
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('section, .card, .panel, article, [class*="card"]').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
});
`;

    if (!html.includes('fadeInUp')) {
      html = html.replace('</style>', `\n${entranceCSS}\n</style>`);
      html = html.replace('</body>', `\n<script>\n${entranceJS}\n</script>\n</body>`);
      writeFileSync(htmlPath, html, 'utf-8');
      this.log.info('Entrance animations added');
    }

    return { evidence: [{ type: 'file', description: 'Entrance animations added' }] };
  }

  // ─── Animation CSS Generation ────────────────────────────────────────────

  generateAnimationCSS(style) {
    return `
/* anime.js powered animations */
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px rgba(91, 110, 245, 0.3); }
  50% { box-shadow: 0 0 20px rgba(91, 110, 245, 0.6); }
}
.anim-pulse { animation: pulse 2s ease-in-out infinite; }
.anim-float { animation: float 3s ease-in-out infinite; }
.anim-glow { animation: glow 2s ease-in-out infinite; }
.anim-shimmer {
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}
`;
  }

  generateAnimationJS(style) {
    return `
// anime.js powered micro-interactions
document.addEventListener('DOMContentLoaded', () => {
  if (typeof anime === 'undefined') return;

  // Stagger card entrance
  const cards = document.querySelectorAll('.card, [class*="card"], .stat-card, .project-card');
  if (cards.length) {
    anime({
      targets: cards,
      opacity: [0, 1],
      translateY: [20, 0],
      delay: anime.stagger(80),
      easing: 'easeOutCubic',
      duration: 600,
    });
  }

  // Nav item hover effect
  document.querySelectorAll('.nav-item, .tab, .btn').forEach(el => {
    el.addEventListener('mouseenter', () => {
      anime({
        targets: el,
        scale: 1.02,
        duration: 200,
        easing: 'easeOutQuad',
      });
    });
    el.addEventListener('mouseleave', () => {
      anime({
        targets: el,
        scale: 1,
        duration: 200,
        easing: 'easeOutQuad',
      });
    });
  });

  // Number counter animation
  document.querySelectorAll('.stat-value, .score-val').forEach(el => {
    const target = parseInt(el.textContent);
    if (!isNaN(target) && target > 0) {
      el.textContent = '0';
      anime({
        targets: el,
        innerHTML: [0, target],
        round: 1,
        duration: 1500,
        easing: 'easeOutExpo',
        update: function(anim) {
          el.textContent = Math.round(anim.animations[0].currentValue);
        }
      });
    }
  });

  // Sidebar logo glow
  const logo = document.querySelector('.sidebar-logo, .logo-icon');
  if (logo) {
    anime({
      targets: logo,
      boxShadow: ['0 0 0px rgba(91,110,245,0)', '0 0 20px rgba(91,110,245,0.4)'],
      duration: 2000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });
  }
});
`;
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}
