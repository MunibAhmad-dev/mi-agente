'use strict';

/**
 * PresentationGenerator - Generate presentations (PPTX + HTML)
 */
class PresentationGenerator {
  constructor(config = {}) {
    this.outputDir = config.outputDir || './presentations';
  }

  async generatePPTX(slides, outputPath) {
    try {
      const PptxGenJS = require('pptxgenjs');
      const pptx = new PptxGenJS();
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });

      for (const slide of slides) {
        const s = pptx.addSlide();
        if (slide.title) {
          s.addText(slide.title, { x: 0.5, y: 0.5, w: 9, fontSize: 28, bold: true });
        }
        if (slide.content) {
          s.addText(slide.content, { x: 0.5, y: 1.5, w: 9, fontSize: 16 });
        }
        if (slide.bullets) {
          s.addText(
            slide.bullets.map(b => ({ text: b, options: { bullet: true, fontSize: 14 } })),
            { x: 0.5, y: 1.5, w: 9 }
          );
        }
        if (slide.image) {
          s.addImage({ path: slide.image, x: 0.5, y: 1.5, w: 8 });
        }
        if (slide.chart) {
          s.addChart(slide.chart.type || 'bar', slide.chart.data || [], {
            x: 0.5, y: 1.5, w: 8, h: 4,
          });
        }
      }

      const path = outputPath || `${this.outputDir}/presentation_${Date.now()}.pptx`;
      await pptx.writeFile({ fileName: path });
      return { success: true, path, slideCount: slides.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateHTML(slides, outputPath) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });

      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Presentation</title>
<style>body{font-family:sans-serif;margin:0;padding:0}.slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:60px;border-bottom:1px solid #ccc}.slide h1{font-size:2.5em}.slide p,.slide li{font-size:1.2em}</style></head><body>`;

      for (const slide of slides) {
        html += '<div class="slide">';
        if (slide.title) html += `<h1>${slide.title}</h1>`;
        if (slide.content) html += `<p>${slide.content}</p>`;
        if (slide.bullets) {
          html += '<ul>' + slide.bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
        }
        if (slide.image) html += `<img src="${slide.image}" style="max-width:80%">`;
        html += '</div>';
      }

      html += '</body></html>';
      const path = outputPath || `${this.outputDir}/presentation_${Date.now()}.html`;
      fs.writeFileSync(path, html);
      return { success: true, path, slideCount: slides.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateFromTemplate(template, data, outputPath) {
    const fs = require('fs');
    const slides = (template.slides || []).map((slide) => ({
      ...slide,
      content: (slide.content || '').replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] || ''),
    }));
    const filled = { ...template, slides, generatedAt: new Date().toISOString() };
    const path = outputPath || `${this.outputDir}/template_${Date.now()}.json`;
    fs.writeFileSync(path, JSON.stringify(filled, null, 2));
    return { success: true, path, slideCount: slides.length };
  }

  getStats() {
    return { outputDir: this.outputDir, formats: ['pptx', 'html', 'template'] };
  }
}

module.exports = PresentationGenerator;
