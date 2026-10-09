'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * ReportGenerator - Generate reports from Markdown
 * Converts Markdown → HTML → PDF
 * Uses: marked (MD→HTML), pdfkit (HTML→PDF)
 */
class ReportGenerator {
  constructor(config = {}) {
    this.outputDir = config.outputDir || './data/reports';
    this.templateDir = config.templateDir || null;
    this.defaultStyle = config.defaultStyle || 'default';

    this.marked = null;
    this.PDFDocument = null;

    try {
      this.marked = require('marked');
      console.log('[Report] marked loaded');
    } catch (e) {
      console.warn('[Report] marked not available');
    }

    try {
      this.PDFDocument = require('pdfkit');
      console.log('[Report] pdfkit loaded');
    } catch (e) {
      console.warn('[Report] pdfkit not available');
    }

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Convert Markdown to HTML.
   */
  markdownToHTML(markdown, options = {}) {
    if (!this.marked) {
      return this._fallbackMarkdownToHTML(markdown);
    }

    const html = this.marked.parse(markdown, {
      headerIds: options.headerIds !== false,
      mangle: options.mangle !== false,
      breaks: options.breaks || false
    });

    return this._wrapHTML(html, options);
  }

  /**
   * Generate PDF from Markdown.
   */
  async markdownToPDF(markdown, options = {}) {
    const html = this.markdownToHTML(markdown, options);
    const outputPath = options.outputPath || path.join(
      this.outputDir,
      `report_${Date.now()}.pdf`
    );

    if (!this.PDFDocument) {
      // Fallback: save as HTML
      const htmlPath = outputPath.replace('.pdf', '.html');
      fs.writeFileSync(htmlPath, html, 'utf-8');
      return {
        success: true,
        format: 'html',
        path: htmlPath,
        message: 'pdfkit not available, saved as HTML'
      };
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new this.PDFDocument({
          size: options.pageSize || 'A4',
          margins: {
            top: options.marginTop || 72,
            bottom: options.marginBottom || 72,
            left: options.marginLeft || 72,
            right: options.marginRight || 72
          },
          info: {
            Title: options.title || 'Report',
            Author: options.author || 'Harness Agent',
            Subject: options.subject || '',
            CreationDate: new Date()
          }
        });

        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Parse markdown sections and render
        const lines = markdown.split('\n');
        let inCodeBlock = false;
        let codeContent = '';
        let codeLang = '';

        for (const line of lines) {
          // Handle code blocks
          if (line.startsWith('```')) {
            if (inCodeBlock) {
              doc.fontSize(8).font('Courier').text(codeContent, { lineGap: 2 });
              doc.moveDown(0.5);
              inCodeBlock = false;
              codeContent = '';
            } else {
              inCodeBlock = true;
              codeLang = line.substring(3).trim();
            }
            continue;
          }

          if (inCodeBlock) {
            codeContent += line + '\n';
            continue;
          }

          // Headers
          if (line.startsWith('# ')) {
            doc.fontSize(24).font('Helvetica-Bold').text(line.substring(2));
            doc.moveDown(0.5);
          } else if (line.startsWith('## ')) {
            doc.fontSize(18).font('Helvetica-Bold').text(line.substring(3));
            doc.moveDown(0.3);
          } else if (line.startsWith('### ')) {
            doc.fontSize(14).font('Helvetica-Bold').text(line.substring(4));
            doc.moveDown(0.3);
          } else if (line.startsWith('#### ')) {
            doc.fontSize(12).font('Helvetica-Bold').text(line.substring(5));
            doc.moveDown(0.2);
          }
          // Horizontal rule
          else if (line.match(/^[-*_]{3,}$/)) {
            doc.moveDown(0.5);
            doc.moveTo(doc.x, doc.y)
              .lineTo(doc.x + 450, doc.y)
              .stroke();
            doc.moveDown(0.5);
          }
          // List items
          else if (line.match(/^[\s]*[-*+]\s/)) {
            const text = line.replace(/^[\s]*[-*+]\s/, '').replace(/[*_`]/g, '');
            doc.fontSize(10).font('Helvetica').text(`  •  ${text}`, { lineGap: 3 });
          }
          else if (line.match(/^[\s]*\d+\.\s/)) {
            const text = line.replace(/^[\s]*\d+\.\s/, '').replace(/[*_`]/g, '');
            doc.fontSize(10).font('Helvetica').text(`  ${text}`, { lineGap: 3 });
          }
          // Table rows (simple rendering)
          else if (line.startsWith('|')) {
            const clean = line.replace(/[|]/g, ' ').replace(/[-]{3,}/g, '').trim();
            if (clean) {
              doc.fontSize(8).font('Courier').text(clean);
            }
          }
          // Empty line
          else if (line.trim() === '') {
            doc.moveDown(0.3);
          }
          // Normal text
          else {
            const clean = line.replace(/[*_`~]/g, '');
            if (clean.trim()) {
              doc.fontSize(10).font('Helvetica').text(clean, { lineGap: 2 });
            }
          }
        }

        doc.end();
        stream.on('finish', () => {
          const stats = fs.statSync(outputPath);
          resolve({
            success: true,
            format: 'pdf',
            path: outputPath,
            size: stats.size,
            title: options.title || 'Report'
          });
        });
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate HTML report directly.
   */
  async generateHTML(content, options = {}) {
    const outputPath = options.outputPath || path.join(
      this.outputDir,
      `report_${Date.now()}.html`
    );

    let html;
    if (content.startsWith('<')) {
      html = content; // Already HTML
    } else {
      html = this.markdownToHTML(content, options);
    }

    fs.writeFileSync(outputPath, html, 'utf-8');
    return { success: true, format: 'html', path: outputPath };
  }

  /**
   * Generate JSON report.
   */
  generateJSON(data, options = {}) {
    const outputPath = options.outputPath || path.join(
      this.outputDir,
      `report_${Date.now()}.json`
    );

    const report = {
      title: options.title || 'Report',
      generatedAt: new Date().toISOString(),
      data
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    return { success: true, format: 'json', path: outputPath };
  }

  /**
   * Wrap HTML content in a full page with styles.
   */
  _wrapHTML(bodyContent, options = {}) {
    const title = options.title || 'Report';
    const css = this._getCSS(options.style || this.defaultStyle);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div class="container">
${bodyContent}
</div>
</body>
</html>`;
  }

  _getCSS(style) {
    const base = `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }
h1 { color: #1a1a2e; border-bottom: 2px solid #16213e; padding-bottom: 10px; }
h2 { color: #16213e; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; }
h3 { color: #0f3460; }
code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
pre { background: #1a1a2e; color: #e0e0e0; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; color: inherit; }
table { border-collapse: collapse; width: 100%; margin: 16px 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
th { background: #f8f9fa; font-weight: 600; }
tr:nth-child(even) { background: #f8f9fa; }
blockquote { border-left: 4px solid #0f3460; margin: 16px 0; padding: 8px 16px; background: #f8f9fa; }
a { color: #0f3460; }
hr { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
.container { padding: 20px; }
@media print { .container { max-width: 100%; } }
`;
    return base;
  }

  /**
   * Simple fallback Markdown → HTML (no dependencies).
   */
  _fallbackMarkdownToHTML(markdown) {
    let html = markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
  }

  /**
   * Get available output formats.
   */
  getFormats() {
    return {
      html: { available: true, method: 'generateHTML' },
      pdf: { available: !!this.PDFDocument, method: 'markdownToPDF', package: 'pdfkit' },
      markdown: { available: true, method: 'markdownToHTML' },
      json: { available: true, method: 'generateJSON' }
    };
  }

  getStats() {
    return {
      formats: this.getFormats(),
      outputDir: this.outputDir,
      markedAvailable: !!this.marked,
      pdfkitAvailable: !!this.PDFDocument
    };
  }
}

module.exports = ReportGenerator;
