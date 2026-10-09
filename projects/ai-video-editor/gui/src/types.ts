/**
 * AI Creative OS - GUI TypeScript Types
 */

export interface AICreativeOSAPI {
  system: {
    status: () => Promise<any>;
    initialize: () => Promise<any>;
  };
  creative: {
    process: (intent: string, options?: any) => Promise<any>;
    parse: (intent: string) => Promise<any>;
    simulate: (intent: string) => Promise<any>;
  };
  capabilities: { list: () => Promise<any[]> };
  providers: { list: () => Promise<any[]> };
  models: { list: () => Promise<any[]> };
  catalog: { list: () => Promise<any[]> };
  adapters: { detect: () => Promise<any[]> };
  hardware: { detect: () => Promise<any> };
  style: {
    analyze: (params: any) => Promise<any>;
    compare: (dnaA: any, dnaB: any) => Promise<any>;
    learn: (videoPath: string) => Promise<any>;
  };
  color: {
    analyze: (path: string) => Promise<any>;
    correct: (input: string, output: string, options: any) => Promise<any>;
    applyLUT: (input: string, output: string, lutPath: string) => Promise<any>;
  };
  voice: {
    transcribe: (path: string, options?: any) => Promise<any>;
    noiseReduce: (input: string, output: string, intensity?: string) => Promise<any>;
    tts: (text: string, output: string, options?: any) => Promise<any>;
  };
  thumbnail: { extract: (video: string, output: string, options?: any) => Promise<any> };
  ocr: { analyze: (path: string, options?: any) => Promise<any> };
  tasks: { list: () => Promise<any[]>; submit: (task: any) => Promise<any> };
  projects: { list: () => Promise<any[]>; create: (name: string) => Promise<any> };
  dialog: {
    openFile: (options?: any) => Promise<string | null>;
    openFiles: (options?: any) => Promise<string[] | null>;
    saveFile: (options?: any) => Promise<string | null>;
    openDirectory: () => Promise<string | null>;
  };
  shell: { openPath: (p: string) => Promise<void> };
}

declare global {
  interface Window {
    api: AICreativeOSAPI;
  }
}

export type TabId = "studio" | "style" | "providers" | "hardware" | "tasks" | "projects";

export interface SystemStatus {
  capabilities: number;
  providers: number;
  adapters: number;
  installedAdapters: number;
  projects: any;
  assets: any;
  memory: any;
  quality: number;
  observability: any;
  security: any;
  plugins: number;
}
