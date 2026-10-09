import { describe, it, expect, beforeEach } from "vitest";
import { CreativeCompiler } from "../src/creative-compiler/index.js";
import { EventBus } from "../src/core/index.js";

describe("CreativeCompiler", () => {
  let compiler: CreativeCompiler;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    compiler = new CreativeCompiler(eventBus);
  });

  describe("analyzeIntent", () => {
    it("should detect TikTok platform", () => {
      const analysis = compiler.analyzeIntent("Haz un TikTok de 30 segundos");
      expect(analysis.detectedPlatform).toBe("tiktok");
    });

    it("should detect YouTube Shorts platform", () => {
      const analysis = compiler.analyzeIntent("Create a YouTube Short");
      expect(analysis.detectedPlatform).toBe("youtube_shorts");
    });

    it("should detect duration from seconds", () => {
      const analysis = compiler.analyzeIntent("Un vídeo de 45 segundos");
      expect(analysis.detectedDuration).toBe(45000);
    });

    it("should detect duration from minutes", () => {
      const analysis = compiler.analyzeIntent("Un documental de 5 minutos");
      expect(analysis.detectedDuration).toBe(300000);
    });

    it("should detect fast pacing", () => {
      const analysis = compiler.analyzeIntent("Ritmo rápido, dinámico");
      expect(analysis.detectedPacing).toBe("fast");
    });

    it("should detect slow pacing", () => {
      const analysis = compiler.analyzeIntent("Vídeo lento y relajado");
      expect(analysis.detectedPacing).toBe("slow");
    });

    it("should detect cinematic style", () => {
      const analysis = compiler.analyzeIntent("Estilo cinematográfico con subtítulos");
      expect(analysis.detectedStyle).toBe("cinematic");
    });

    it("should detect educational style", () => {
      const analysis = compiler.analyzeIntent("Un tutorial educativo paso a paso");
      expect(analysis.detectedStyle).toBe("educational");
    });

    it("should calculate confidence", () => {
      const analysis = compiler.analyzeIntent(
        "Haz un Short de TikTok de 30 segundos, ritmo rápido, cinematográfico",
      );
      expect(analysis.confidence).toBeGreaterThan(50);
    });

    it("should detect ambiguities", () => {
      const analysis = compiler.analyzeIntent("Haz algo");
      expect(analysis.ambiguities.length).toBeGreaterThan(0);
    });
  });

  describe("compile", () => {
    it("should compile a full creative specification", async () => {
      const { specification, analysis } = await compiler.compile(
        "Haz un Short de 30 segundos, ritmo rápido, cinematográfico, con subtítulos y animaciones",
      );

      expect(specification.platform).toBe("tiktok");
      expect(specification.duration).toBe(30000);
      expect(specification.pacing).toBe("fast");
      expect(specification.style).toBe("cinematic");
      expect(specification.aspectRatio).toBe("9:16");
      expect(specification.resolution).toEqual({ width: 1080, height: 1920 });
      expect(specification.captions.enabled).toBe(true);
      expect(specification.storyStructure.scenes.length).toBeGreaterThan(0);
    });

    it("should apply overrides", async () => {
      const { specification } = await compiler.compile(
        "Un vídeo rápido",
        { duration: 60000, fps: 60 },
      );
      expect(specification.duration).toBe(60000);
      expect(specification.fps).toBe(60);
    });

    it("should emit INTENT_COMPILED event", async () => {
      let eventEmitted = false;
      eventBus.on("INTENT_COMPILED", () => { eventEmitted = true; });
      await compiler.compile("Haz algo cinematográfico");
      expect(eventEmitted).toBe(true);
    });
  });

  describe("buildSpecification", () => {
    it("should generate scenes from analysis", () => {
      const analysis = compiler.analyzeIntent("Un vídeo de 60 segundos");
      const spec = compiler.buildSpecification(analysis, {});
      expect(spec.storyStructure.scenes.length).toBeGreaterThan(0);
      expect(spec.storyStructure.scenes[0].shots.length).toBeGreaterThan(0);
    });

    it("should set correct aspect ratio for YouTube", () => {
      const analysis = compiler.analyzeIntent("Un vídeo de YouTube largo");
      const spec = compiler.buildSpecification(analysis, {});
      expect(spec.aspectRatio).toBe("16:9");
    });
  });
});
