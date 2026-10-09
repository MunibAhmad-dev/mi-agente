'use strict';

/**
 * WebsiteGenerator - Generate websites using Handlebars templates
 */
class WebsiteGenerator {
  constructor(config = {}) {
    this.outputDir = config.outputDir || './generated_sites';
  }

  async generateSite(templateName, data, outputPath) {
    try {
      const Handlebars = require('handlebars');
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });

      const templates = {
        landing: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{title}}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@latest/css/pico.min.css"></head><body><main class="container"><h1>{{title}}</h1><p>{{description}}</p>{{#each features}}<article><h3>{{this.title}}</h3><p>{{this.description}}</p></article>{{/each}}</main></body></html>`,
        blog: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{title}}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@latest/css/pico.min.css"></head><body><main class="container"><h1>{{title}}</h1>{{#each posts}}<article><h2>{{this.title}}</h2><time>{{this.date}}</time><p>{{this.excerpt}}</p></article>{{/each}}</main></body></html>`,
        docs: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{title}}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@latest/css/pico.min.css"></head><body><nav class="container-fluid"><ul><li><strong>{{title}}</strong></li></ul></nav><main class="container"><h1>{{title}}</h1>{{#each sections}}<section><h2>{{this.title}}</h2><p>{{this.content}}</p></section>{{/each}}</main></body></html>`,
      };

      const template = Handlebars.compile(templates[templateName] || templates.landing);
      const html = template(data);
      const path = outputPath || `${this.outputDir}/${templateName}_${Date.now()}.html`;
      fs.writeFileSync(path, html);
      return { success: true, path, template: templateName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateBlog(posts, title = 'Blog') {
    return this.generateSite('blog', { title, posts });
  }

  async generateDocs(sections, title = 'Documentation') {
    return this.generateSite('docs', { title, sections });
  }

  async generateLanding(data) {
    return this.generateSite('landing', data);
  }

  getStats() {
    return { outputDir: this.outputDir, templates: ['landing', 'blog', 'docs'] };
  }
}

module.exports = WebsiteGenerator;
