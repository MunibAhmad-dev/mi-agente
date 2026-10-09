#!/usr/bin/env node
/**
 * Ollama Configuration Script
 * Descarga y configura modelos livianos para AI-OS
 * 
 * Modelos recomendados:
 * - qwen3:1.7b (1GB, rapido, coding decente)
 * - qwen3:8b (5GB, mejor calidad)  
 * - llama3.2:3b (2GB, equilibrado)
 * - phi4-mini (2GB, rapido)
 */

const { execSync } = require('child_process');

const MODELS = {
  'lightweight': 'qwen3:1.7b',
  'balanced': 'qwen3:8b',
  'fast': 'phi4-mini',
  'coding': 'qwen3-coder:1.5b'
};

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 300000 }).trim();
  } catch (e) {
    return null;
  }
}

function checkOllama() {
  console.log('🔍 Verificando Ollama...');
  const result = run('ollama --version');
  if (result) {
    console.log(`✅ Ollama encontrado: ${result}`);
    return true;
  }
  console.log('❌ Ollama no encontrado.');
  console.log('   Instala desde: https://ollama.com/download');
  console.log('   O ejecuta: OllamaSetup.exe');
  return false;
}

function checkServer() {
  console.log('\n🔍 Verificando servidor Ollama...');
  const result = run('curl -s http://localhost:11434/api/tags');
  if (result) {
    console.log('✅ Servidor Ollama activo en puerto 11434');
    try {
      const data = JSON.parse(result);
      if (data.models && data.models.length > 0) {
        console.log('📦 Modelos instalados:');
        data.models.forEach(m => {
          const sizeGB = (m.size / 1073741824).toFixed(1);
          console.log(`   - ${m.name} (${sizeGB}GB)`);
        });
        return data.models;
      } else {
        console.log('⚠️  No hay modelos instalados.');
        return [];
      }
    } catch (e) {
      return [];
    }
  }
  console.log('❌ Servidor Ollama no responde.');
  console.log('   Ejecuta: ollama serve');
  return null;
}

function pullModel(modelName) {
  console.log(`\n📥 Descargando ${modelName}...`);
  console.log('   Esto puede tardar varios minutos dependiendo de tu internet.');
  try {
    execSync(`ollama pull ${modelName}`, { stdio: 'inherit', timeout: 600000 });
    console.log(`✅ ${modelName} descargado correctamente.`);
    return true;
  } catch (e) {
    console.log(`❌ Error descargando ${modelName}.`);
    return false;
  }
}

function testModel(modelName) {
  console.log(`\n🧪 Probando ${modelName}...`);
  const testPrompt = 'Responde en una sola linea: que es 2+2?';
  
  try {
    const result = execSync(
      `curl -s http://localhost:11434/api/generate -d "${JSON.stringify({model: modelName, prompt: testPrompt, stream: false})}"`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    const data = JSON.parse(result);
    if (data.response) {
      console.log(`✅ Modelo responde: ${data.response.substring(0, 100)}`);
      return true;
    }
  } catch (e) {
    console.log(`❌ Modelo no respondio correctamente.`);
  }
  return false;
}

function generateConfig(models) {
  console.log('\n📝 Generando configuracion...');
  
  const config = {
    ollama: {
      baseUrl: 'http://localhost:11434',
      models: models.map(m => m.name),
      defaultModel: models[0]?.name || 'qwen3:1.7b'
    }
  };
  
  console.log('Configuracion Ollama:');
  console.log(JSON.stringify(config, null, 2));
  return config;
}

async function main() {
  console.log('================================================');
  console.log('   AI-OS - Configuracion Ollama');
  console.log('================================================\n');
  
  if (!checkOllama()) {
    process.exit(1);
  }
  
  const models = checkServer();
  
  if (models === null) {
    console.log('\n💡 Inicia Ollama con: ollama serve');
    process.exit(1);
  }
  
  if (models.length === 0) {
    console.log('\nInstalando modelo liviano por defecto...');
    pullModel('qwen3:1.7b');
    
    const updatedModels = checkServer();
    if (updatedModels && updatedModels.length > 0) {
      testModel(updatedModels[0].name);
      generateConfig(updatedModels);
    }
  } else {
    models.forEach(m => testModel(m.name));
    generateConfig(models);
  }
  
  console.log('\n================================================');
  console.log('   ✅ Configuracion completada');
  console.log('================================================');
  console.log('\nOllama funciona en: http://localhost:11434');
  console.log('Para ver modelos: ollama list');
  console.log('Para descargar otro: ollama pull <modelo>');
}

main();
