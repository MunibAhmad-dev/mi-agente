'use strict';

const path = require('path');
const fs = require('fs');

/**
 * FileProcessor - Multi-format file processing
 * Handles PDFs, images, spreadsheets, DOCX, and audio files.
 * Gracefully degrades if optional packages are not installed.
 */
class FileProcessor {
  constructor(config = {}) {
    this.maxFileSizeMB = config.maxFileSizeMB || 50;
    this.tempDir = config.tempDir || './data/temp';
    this.ocrLang = config.ocrLang || 'eng';

    // Lazy-loaded packages
    this._pdfParse = null;
    this._xlsx = null;
    this._mammoth = null;
    this._sharp = null;
    this._tesseract = null;
    this._initComplete = false;

    this._init();
  }

  _init() {
    try {
      this._pdfParse = require('pdf-parse');
      console.log('[FileProcessor] pdf-parse loaded');
    } catch (e) {
      console.warn('[FileProcessor] pdf-parse not available');
    }

    try {
      this._xlsx = require('xlsx');
      console.log('[FileProcessor] xlsx loaded');
    } catch (e) {
      console.warn('[FileProcessor] xlsx not available');
    }

    try {
      this._mammoth = require('mammoth');
      console.log('[FileProcessor] mammoth loaded');
    } catch (e) {
      console.warn('[FileProcessor] mammoth not available');
    }

    try {
      this._sharp = require('sharp');
      console.log('[FileProcessor] sharp loaded');
    } catch (e) {
      console.warn('[FileProcessor] sharp not available');
    }

    try {
      this._tesseract = require('tesseract.js');
      console.log('[FileProcessor] tesseract.js loaded');
    } catch (e) {
      console.warn('[FileProcessor] tesseract.js not available');
    }

    this._initComplete = true;
  }

  /**
   * Detect file type from extension.
   */
  detectType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.pdf': 'pdf',
      '.docx': 'docx',
      '.doc': 'docx',
      '.xlsx': 'spreadsheet',
      '.xls': 'spreadsheet',
      '.csv': 'spreadsheet',
      '.tsv': 'spreadsheet',
      '.txt': 'text',
      '.md': 'text',
      '.json': 'text',
      '.js': 'text',
      '.ts': 'text',
      '.py': 'text',
      '.html': 'text',
      '.xml': 'text',
      '.yaml': 'text',
      '.yml': 'text',
      '.png': 'image',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.gif': 'image',
      '.webp': 'image',
      '.svg': 'image',
      '.bmp': 'image',
      '.tiff': 'image',
      '.mp3': 'audio',
      '.wav': 'audio',
      '.ogg': 'audio',
      '.flac': 'audio',
      '.m4a': 'audio',
      '.mp4': 'video',
      '.avi': 'video',
      '.mov': 'video'
    };
    return typeMap[ext] || 'unknown';
  }

  /**
   * Process a file based on its type.
   */
  async processFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size > this.maxFileSizeMB * 1024 * 1024) {
      throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(1)}MB (max: ${this.maxFileSizeMB}MB)`);
    }

    const type = this.detectType(filePath);
    const result = {
      filePath,
      type,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      content: null,
      metadata: {},
      error: null
    };

    try {
      switch (type) {
        case 'pdf':
          result.content = await this._processPDF(filePath);
          break;
        case 'docx':
          result.content = await this._processDOCX(filePath);
          break;
        case 'spreadsheet':
          result.content = await this._processSpreadsheet(filePath, options);
          break;
        case 'text':
          result.content = await this._processText(filePath);
          break;
        case 'image':
          result.content = await this._processImage(filePath, options);
          break;
        case 'audio':
          result.content = await this._processAudio(filePath, options);
          break;
        default:
          result.content = await this._processGeneric(filePath);
      }
    } catch (err) {
      result.error = err.message;
    }

    return result;
  }

  /**
   * Process PDF files.
   */
  async _processPDF(filePath) {
    if (!this._pdfParse) {
      return { text: '[pdf-parse not installed] Run: npm install pdf-parse', pages: 0 };
    }
    const buffer = fs.readFileSync(filePath);
    const data = await this._pdfParse(buffer);
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info || {},
      wordCount: data.text.split(/\s+/).length
    };
  }

  /**
   * Process DOCX files.
   */
  async _processDOCX(filePath) {
    if (!this._mammoth) {
      return { text: '[mammoth not installed] Run: npm install mammoth', html: '' };
    }
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const html = await mammoth.convertToHtml({ buffer });
    return {
      text: result.value,
      html: html.value,
      messages: result.messages || [],
      wordCount: result.value.split(/\s+/).length
    };
  }

  /**
   * Process spreadsheet files (XLSX, XLS, CSV).
   */
  async _processSpreadsheet(filePath, options = {}) {
    if (!this._xlsx) {
      return { text: '[xlsx not installed] Run: npm install xlsx', sheets: [] };
    }
    const workbook = this._xlsx.readFile(filePath);
    const sheets = [];
    const allText = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = this._xlsx.utils.sheet_to_csv(sheet);
      const json = this._xlsx.utils.sheet_to_json(sheet);
      const text = this._xlsx.utils.sheet_to_txt(sheet);

      sheets.push({
        name: sheetName,
        rows: json.length,
        columns: json.length > 0 ? Object.keys(json[0]).length : 0,
        text: csv
      });
      allText.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }

    return {
      text: allText.join('\n\n'),
      sheets,
      sheetCount: workbook.SheetNames.length,
      totalRows: sheets.reduce((sum, s) => sum + s.rows, 0)
    };
  }

  /**
   * Process plain text files.
   */
  async _processText(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      text: content,
      encoding: 'utf-8',
      lines: content.split('\n').length,
      wordCount: content.split(/\s+/).length,
      charCount: content.length
    };
  }

  /**
   * Process image files.
   */
  async _processImage(filePath, options = {}) {
    const result = { text: '', metadata: {}, ocrResult: null };

    // Get metadata with sharp
    if (this._sharp) {
      try {
        const metadata = await this._sharp(filePath).metadata();
        result.metadata = {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          space: metadata.space,
          channels: metadata.channels,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha
        };

        // Resize if requested
        if (options.resize) {
          const resizedPath = filePath.replace(/(\.\w+)$/, '_resized$1');
          await this._sharp(filePath)
            .resize(options.resize.width || 800, options.resize.height || 600, { fit: 'inside' })
            .toFile(resizedPath);
          result.resizedPath = resizedPath;
        }
      } catch (err) {
        result.metadata.error = err.message;
      }
    }

    // OCR with tesseract.js
    if (this._tesseract && options.ocr !== false) {
      try {
        const { data } = await this._tesseract.recognize(filePath, this.ocrLang);
        result.ocrResult = {
          text: data.text,
          confidence: data.confidence,
          words: data.words ? data.words.length : 0,
          lines: data.lines ? data.lines.length : 0
        };
        result.text = data.text;
      } catch (err) {
        result.ocrResult = { error: err.message };
      }
    }

    return result;
  }

  /**
   * Process audio files (basic metadata).
   */
  async _processAudio(filePath, options = {}) {
    const result = { text: '', metadata: {} };

    // Basic metadata from file
    const stats = fs.statSync(filePath);
    result.metadata = {
      fileSize: stats.size,
      duration: 'unknown (requires ffprobe)',
      format: path.extname(filePath).replace('.', '').toUpperCase()
    };

    // Try to get duration from ffprobe if available
    try {
      const { execSync } = require('child_process');
      const ffprobeOutput = execSync(`ffprobe -v quiet -print_format json -show_format "${filePath}"`, {
        encoding: 'utf-8',
        timeout: 5000
      });
      const ffData = JSON.parse(ffprobeOutput);
      if (ffData.format && ffData.format.duration) {
        result.metadata.duration = parseFloat(ffData.format.duration);
      }
    } catch (e) {
      // ffprobe not available
    }

    result.text = `[Audio file: ${path.basename(filePath)} - Duration: ${result.metadata.duration}s]`;
    result.text += '\n[For transcription, use VoiceManager with Whisper.cpp]';
    return result;
  }

  /**
   * Process unknown file types.
   */
  async _processGeneric(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8').substring(0, 10000);
    return {
      text: content,
      encoding: 'utf-8',
      truncated: fs.statSync(filePath).size > 10000
    };
  }

  /**
   * Batch process multiple files.
   */
  async processFiles(filePaths, options = {}) {
    const results = [];
    for (const fp of filePaths) {
      results.push(await this.processFile(fp, options));
    }
    return results;
  }

  /**
   * Get supported file types.
   */
  getSupportedTypes() {
    return {
      pdf: { available: !!this._pdfParse, package: 'pdf-parse' },
      docx: { available: !!this._mammoth, package: 'mammoth' },
      spreadsheet: { available: !!this._xlsx, package: 'xlsx' },
      text: { available: true, package: 'built-in' },
      image: { available: !!this._sharp, package: 'sharp' },
      image_ocr: { available: !!this._tesseract, package: 'tesseract.js' },
      audio: { available: true, package: 'ffprobe (optional)' }
    };
  }

  /**
   * Get processor stats.
   */
  getStats() {
    return {
      supportedTypes: this.getSupportedTypes(),
      maxFileSizeMB: this.maxFileSizeMB,
      ocrLang: this.ocrLang,
      tempDir: this.tempDir
    };
  }
}

module.exports = FileProcessor;
