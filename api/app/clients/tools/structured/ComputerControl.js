'use strict';

const { Tool } = require('@librechat/agents/langchain/tools');

const computerControlJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'screenshot',
        'open_app',
        'list_windows',
        'focus_window',
        'list_files',
        'click',
        'type_text',
        'press_key',
        'scroll',
        'clipboard_read',
        'clipboard_write',
        'screen_size',
      ],
      description:
        'screenshot: take desktop screenshot; open_app: launch an application by name; ' +
        'list_windows: list open windows; focus_window: bring a window to front; ' +
        'list_files: list files in a directory using OS file explorer; ' +
        'click: click at x,y coordinates; type_text: type text at cursor; ' +
        'press_key: press a key (Enter, Tab, Escape, ctrl+c, Win+E, etc.); ' +
        'scroll: scroll up or down; clipboard_read: read clipboard; ' +
        'clipboard_write: write to clipboard; screen_size: get screen resolution.',
    },
    app: {
      type: 'string',
      description: 'App to open (for action=open_app). Examples: "explorer", "notepad", "chrome", "calc", "mspaint", "cmd".',
    },
    title: {
      type: 'string',
      description: 'Window title (partial match) for focus_window.',
    },
    x: { type: 'number', description: 'X coordinate for click.' },
    y: { type: 'number', description: 'Y coordinate for click.' },
    text: { type: 'string', description: 'Text for type_text or clipboard_write.' },
    key: { type: 'string', description: 'Key for press_key. Examples: "Enter", "ctrl+c", "Win+E", "alt+F4".' },
    direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction.' },
    path: { type: 'string', description: 'Directory path for list_files (optional, defaults to Desktop).' },
  },
  required: ['action'],
};

/**
 * ComputerControl — unified desktop control tool for the agent.
 * Wraps ComputerUse.js (PowerShell on Windows).
 */
class ComputerControl extends Tool {
  static lc_name() {
    return 'computer_control';
  }

  static get jsonSchema() {
    return computerControlJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'computer_control';
    this.description =
      'Control the desktop computer: take screenshots, open programs (File Explorer, Notepad, Chrome, ' +
      'image viewer, calculator), list open windows, click, type text, press keys, read/write clipboard. ' +
      'Use this to interact with the operating system and open/close applications.';
    this.schema = computerControlJsonSchema;
    this._cu = null;
  }

  _getCU() {
    if (!this._cu) {
      const { ComputerUse } = require('~/server/services/Harness/ComputerUse');
      this._cu = new ComputerUse({ browserHeadless: false });
    }
    return this._cu;
  }

  async _call(input) {
    try {
      const cu = this._getCU();
      const { action } = input;

      if (action === 'screenshot') {
        const r = await cu.screenshot();
        return JSON.stringify({ success: r.success, path: r.path, message: r.success ? 'Screenshot taken at ' + r.path : r.error });
      }

      if (action === 'open_app') {
        const app = (input.app || 'explorer').toLowerCase();
        const appMap = {
          explorer: 'explorer.exe',
          'file explorer': 'explorer.exe',
          notepad: 'notepad.exe',
          chrome: 'chrome',
          firefox: 'firefox',
          calc: 'calc.exe',
          calculator: 'calc.exe',
          paint: 'mspaint.exe',
          mspaint: 'mspaint.exe',
          cmd: 'cmd.exe',
          terminal: 'cmd.exe',
          powershell: 'powershell.exe',
          wordpad: 'wordpad.exe',
        };
        const exe = appMap[app] || app;
        const openPath = input.path || '';
        const { execSync, execFile } = require('child_process');
        const os = require('os');
        const fss = require('fs');
        try {
          // Write a temp PS1 that launches the app then moves it to the right half
          // so it doesn't overlay the Claude chat window on the left
          const tmpScript = require('path').join(os.tmpdir(), `mi-agente-open-${Date.now()}.ps1`);
          const psLines = [
            `$ErrorActionPreference = 'SilentlyContinue'`,
            openPath
              ? `$proc = Start-Process '${exe}' -ArgumentList '${openPath}' -PassThru`
              : `$proc = Start-Process '${exe}' -PassThru`,
            `Start-Sleep -Milliseconds 1500`,
            `$proc.Refresh()`,
            `$hwnd = $proc.MainWindowHandle`,
            `if ($hwnd -eq 0) { Start-Sleep -Milliseconds 800; $proc.Refresh(); $hwnd = $proc.MainWindowHandle }`,
            `if ($hwnd -ne 0) {`,
            `  $code = @'`,
            `using System; using System.Runtime.InteropServices;`,
            `public class WinPos {`,
            `  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);`,
            `  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);`,
            `}`,
            `'@`,
            `  Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue`,
            `  [WinPos]::ShowWindow($hwnd, 9) | Out-Null`,
            `  [WinPos]::MoveWindow($hwnd, 970, 40, 930, 1000, $true) | Out-Null`,
            `}`,
            `Write-Output "pid:$($proc.Id)"`,
          ];
          fss.writeFileSync(tmpScript, psLines.join('\r\n'), 'utf-8');
          const out = execSync(`powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}"`, { timeout: 10000, encoding: 'utf-8', windowsHide: true });
          try { fss.unlinkSync(tmpScript); } catch {}
          const pid = (out.match(/pid:(\d+)/) || [])[1];
          return JSON.stringify({
            success: true, app: exe,
            message: `Launched ${exe} — positioned on right half of screen so chat stays visible`,
            pid: pid ? Number(pid) : undefined,
            path: openPath || undefined,
          });
        } catch (e) {
          // Fallback: plain detached launch
          try {
            execFile('cmd.exe', ['/c', 'start', '', exe, ...(openPath ? [openPath] : [])], { detached: true, windowsHide: true });
            return JSON.stringify({ success: true, app: exe, message: `Launched ${exe}` });
          } catch (e2) {
            return JSON.stringify({ success: false, app: exe, error: e2.message });
          }
        }
      }

      if (action === 'list_windows') {
        const r = await cu.listWindows();
        return JSON.stringify(r);
      }

      if (action === 'focus_window') {
        if (!input.title) return JSON.stringify({ error: 'title is required' });
        // Use PowerShell to focus window by title
        const { execSync } = require('child_process');
        try {
          execSync(`powershell -WindowStyle Hidden -Command "Get-Process | Where-Object {$_.MainWindowTitle -like '*${input.title}*'} | ForEach-Object { $wsh = New-Object -ComObject WScript.Shell; $wsh.AppActivate($_.Id) }"`, { timeout: 5000, windowsHide: true });
          return JSON.stringify({ success: true, title: input.title });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.message });
        }
      }

      if (action === 'list_files') {
        const fsm = require('fs').promises;
        const os = require('os');
        const targetPath = input.path || require('path').join(os.homedir(), 'Desktop');
        const entries = await fsm.readdir(targetPath, { withFileTypes: true });
        const items = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'folder' : 'file' }));
        return JSON.stringify({ path: targetPath, entries: items, count: items.length });
      }

      if (action === 'click') {
        if (input.x === undefined || input.y === undefined) return JSON.stringify({ error: 'x and y required' });
        const r = await cu.mouseClick(input.x, input.y);
        return JSON.stringify(r);
      }

      if (action === 'type_text') {
        if (!input.text) return JSON.stringify({ error: 'text required' });
        const r = await cu.typeText(input.text);
        return JSON.stringify(r);
      }

      if (action === 'press_key') {
        if (!input.key) return JSON.stringify({ error: 'key required' });
        const r = await cu.pressKey(input.key);
        return JSON.stringify(r);
      }

      if (action === 'scroll') {
        const dir = input.direction || 'down';
        const r = await cu.mouseScroll(dir);
        return JSON.stringify(r);
      }

      if (action === 'clipboard_read') {
        const r = await cu.clipboardRead();
        return JSON.stringify(r);
      }

      if (action === 'clipboard_write') {
        if (!input.text) return JSON.stringify({ error: 'text required' });
        const r = await cu.clipboardWrite(input.text);
        return JSON.stringify(r);
      }

      if (action === 'screen_size') {
        // Get screen size via PowerShell on Windows
        const { execSync } = require('child_process');
        try {
          const out = execSync('powershell -WindowStyle Hidden -Command "[System.Windows.Forms.Screen]::PrimaryScreen | Select-Object -Property Bounds | ConvertTo-Json"', { timeout: 5000, encoding: 'utf8', windowsHide: true });
          const data = JSON.parse(out);
          return JSON.stringify({ success: true, width: data?.Bounds?.Width, height: data?.Bounds?.Height });
        } catch {
          return JSON.stringify({ success: true, width: 1920, height: 1080, note: 'default estimate' });
        }
      }

      return JSON.stringify({ error: `Unknown action: ${action}` });
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
}

module.exports = ComputerControl;
