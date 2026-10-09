'use strict';

/**
 * DiagramGenerator - Generate diagrams using mermaid and Chart.js
 */
class DiagramGenerator {
  constructor(config = {}) {
    this.outputDir = config.outputDir || './diagrams';
  }

  async generateFlowchart(description, outputPath) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      const mermaidDef = `graph TD\n${description}`;
      const html = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head><body><div class="mermaid">${mermaidDef}</div><script>mermaid.initialize({startOnLoad:true})</script></body></html>`;
      const path = outputPath || `${this.outputDir}/flowchart_${Date.now()}.html`;
      fs.writeFileSync(path, html);
      return { success: true, path, type: 'flowchart' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateSequence(steps, outputPath) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      let seqDef = 'sequenceDiagram\n';
      for (const step of steps) {
        seqDef += `    ${step.from}->>${step.to}: ${step.message}\n`;
        if (step.response) seqDef += `    ${step.to}-->>${step.from}: ${step.response}\n`;
      }
      const html = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script></head><body><div class="mermaid">${seqDef}</div><script>mermaid.initialize({startOnLoad:true})</script></body></html>`;
      const path = outputPath || `${this.outputDir}/sequence_${Date.now()}.html`;
      fs.writeFileSync(path, html);
      return { success: true, path, type: 'sequence' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateChart(type, data, outputPath) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      const html = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/chart.js"></script></head><body><canvas id="chart"></canvas><script>new Chart(document.getElementById('chart'),{type:'${type}',data:${JSON.stringify(data)},options:{responsive:true}})</script></body></html>`;
      const path = outputPath || `${this.outputDir}/chart_${Date.now()}.html`;
      fs.writeFileSync(path, html);
      return { success: true, path, type: 'chart' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async generateArchitecture(components, outputPath) {
    try {
      let desc = '';
      for (let i = 0; i < components.length; i++) {
        desc += `    ${components[i].name}["${components[i].name}"]\n`;
        if (components[i].connections) {
          for (const conn of components[i].connections) {
            desc += `    ${components[i].name} --> ${conn}\n`;
          }
        }
      }
      return this.generateFlowchart(desc, outputPath);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStats() {
    return { outputDir: this.outputDir, types: ['flowchart', 'sequence', 'chart', 'architecture'] };
  }
}

module.exports = DiagramGenerator;
