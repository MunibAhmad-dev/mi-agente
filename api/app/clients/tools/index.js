const manifest = require('./manifest');

// Structured Tools
const DALLE3 = require('./structured/DALLE3');
const FluxAPI = require('./structured/FluxAPI');
const OpenWeather = require('./structured/OpenWeather');
const StructuredWolfram = require('./structured/Wolfram');
const StructuredACS = require('./structured/AzureAISearch');
const StructuredSD = require('./structured/StableDiffusion');
const GoogleSearchAPI = require('./structured/GoogleSearch');
const TraversaalSearch = require('./structured/TraversaalSearch');
const createOpenAIImageTools = require('./structured/OpenAIImageTools');
const TavilySearchResults = require('./structured/TavilySearchResults');
const createGeminiImageTool = require('./structured/GeminiImageGen');
const DuckDuckGoSearch = require('./structured/DuckDuckGoSearch');
const KnowledgeEngine = require('./structured/KnowledgeEngine');
const ImageGenerator = require('./structured/ImageGenerator');
const VideoGenerator = require('./structured/VideoGenerator');
const ImageAnalyzer = require('./structured/ImageAnalyzer');
const BrowserTool = require('./structured/BrowserTool');
const FilesystemOps = require('./structured/FilesystemOps');
const ComputerControl = require('./structured/ComputerControl');

module.exports = {
  ...manifest,
  // Structured Tools
  DALLE3,
  FluxAPI,
  OpenWeather,
  StructuredSD,
  StructuredACS,
  GoogleSearchAPI,
  TraversaalSearch,
  StructuredWolfram,
  TavilySearchResults,
  DuckDuckGoSearch,
  KnowledgeEngine,
  ImageGenerator,
  VideoGenerator,
  ImageAnalyzer,
  BrowserTool,
  FilesystemOps,
  ComputerControl,
  createOpenAIImageTools,
  createGeminiImageTool,
};
