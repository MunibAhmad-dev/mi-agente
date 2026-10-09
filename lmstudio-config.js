#!/usr/bin/env node
/**
 * LM Studio Configuration Script
 * Configura LM Studio como proveedor LLM local
 * 
 * LM Studio es 100% gratuito, local, sin censura, sin API keys
 * Compatible con miles de modelos GGUF
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LM_STUDIO_URL = 'http://localhost:1234';

function checkLMStudio() {
  return new Promise((resolve) => {
    const req = http.get(`${LM_STUDIO_URL}/v1/models`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ online: true, models: parsed.data || [] });
        } catch (e) {
          resolve({ online: true, models: [] });
        }
      });
    });
    
    req.on('error', () => resolve({ online: false, models: [] }));
    req.on('timeout', () => { req.destroy(); resolve({ online: false, models: [] }); });
  });
}

function findLMStudioModels() {
  const homeDir = os.homedir();
  const modelsDir = path.join(homeDir, '.lmstudio', 'models');
  const found = [];
  
  function walk(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (item.endsWith('.gguf')) {
          const sizeGB = (stat.size / 1073741824).toFixed(1);
          found.push({ path: full, name: item, size: `${sizeGB}GB` });
        }
      }
    } catch (e) {}
  }
  
  if (fs.existsSync(modelsDir)) {
    walk(modelsDir);
  }
  
  return found;
}

async function main() {
  console.log('================================================');
  console.log('   AI-OS - Configuracion LM Studio');
  console.log('================================================\n');
  
  // Check if LM Studio server is running
  console.log('🔍 Verificando LM Studio Server...');
  const status = await checkLMStudio();
  
  if (status.online) {
    console.log('✅ LM Studio Server activo en puerto 1234');
    
    if (status.models.length > 0) {
      console.log('\n📦 Modelos cargados:');
      status.models.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.id}`);
      });
    } else {
      console.log('⚠️  No hay modelos cargados.');
      console.log('   Abre LM Studio > pestaña Local Server > carga un modelo');
    }
  } else {
    console.log('❌ LM Studio Server no responde.');
    console.log('   Instrucciones:');
    console.log('   1. Abre LM Studio');
    console.log('   2. Ve a la pestana "Local Server" (icono ⚡)');
    console.log('   3. Haz clic en "Start Server"');
    console.log('');
    console.log('   Si no tienes LM Studio:');
    console.log('   https://lmstudio.ai/');
  }
  
  // Find local GGUF models
  console.log('\n🔍 Buscando modelos GGUF en disco...');
  const localModels = findLMStudioModels();
  
  if (localModels.length > 0) {
    console.log(`📦 Encontrados ${localModels.length} modelos GGUF:`);
    localModels.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.name} (${m.size})`);
    });
  } else {
    console.log('⚠️  No se encontraron modelos GGUF.');
    console.log('   Descarga modelos desde LM Studio o desde:');
    console.log('   https://huggingface.co/models?library=gguf');
  }
  
  // Generate config
  const config = {
    lmstudio: {
      baseUrl: LM_STUDIO_URL,
      serverRunning: status.online,
      loadedModels: status.models.map(m => m.id),
      localModels: localModels.map(m => ({ name: m.name, size: m.size })),
      defaultModel: status.models[0]?.id || localModels[0]?.name || 'none'
    }
  };
  
  // Save config
  const configPath = path.join(__dirname, 'data', 'lmstudio-config.json');
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`\n💾 Configuracion guardada en: ${configPath}`);
  } catch (e) {
    console.log('\n⚠️  No se pudo guardar configuracion.');
  }
  
  console.log('\n================================================');
  console.log('   Configuracion LM Studio');
  console.log('================================================');
  console.log(JSON.stringify(config, null, 2));
  
  console.log('\n================================================');
  console.log('   ✅ Configuracion completada');
  console.log('================================================');
  console.log('\nLM Studio funciona en: http://localhost:1234');
  console.log('Compatible con OpenAI API format.');
}

main();
