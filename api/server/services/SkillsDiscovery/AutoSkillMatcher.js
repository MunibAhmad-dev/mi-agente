/**
 * AutoSkillMatcher — Sistema automático conectado al LLM.
 *
 * Cuando el usuario pide desarrollar una tarea (crear algo, buscar, etc.),
 * este módulo:
 *   1. Analiza la tarea del usuario
 *   2. El LLM "piensa" qué skill/plugin/MCP va a necesitar
 *   3. Busca entre los mejores (usando DiscoveryProviders + CuratedRegistry)
 *   4. Instala el skill seleccionado
 *   5. Lo configura automáticamente
 *   6. Devuelve el skill listo para usar
 *
 * Integración:
 *   - runtimeHooks.onRunStart → analiza la tarea antes de ejecutar
 *   - Si encuentra skills relevantes, los instala y los inyecta en el contexto
 */

const DiscoveryProviders = require('./DiscoveryProviders');
const CuratedRegistry = require('./CuratedRegistry');
const SkillInstaller = require('./SkillInstaller');
const SkillConverter = require('./SkillConverter');

/**
 * Construye el prompt para que el LLM decida qué skill necesita.
 * @param {string} userTask — la tarea del usuario
 * @param {Array} availableSkills — skills ya instalados
 * @returns {string}
 */
function buildSkillSelectionPrompt(userTask, availableSkills) {
  const whitelist = CuratedRegistry.getWhitelist();
  const skillCatalog = whitelist
    .map(
      (s) => `- ${s.name} (${s.type}/${s.category}): ${s.description} [tags: ${s.tags.join(', ')}]`,
    )
    .join('\n');

  const installed =
    availableSkills.length > 0
      ? `Already installed:\n${availableSkills.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`
      : 'No skills currently installed.';

  return `You are a skill selection assistant. Analyze the user's task and determine which skill(s), plugin(s), or MCP server(s) would be most helpful.

User task: "${userTask}"

${installed}

Available skills/plugins from curated registry (all MIT/Apache-2.0 licensed, verified):
${skillCatalog}

Instructions:
1. Determine if the task needs a skill/plugin/MCP that is NOT already installed.
2. If yes, select the BEST match from the catalog above (prefer verified/whitelisted).
3. If no existing skill fits, return "none" (the task can be done with built-in tools).

Respond in JSON format:
{
  "needs_skill": true/false,
  "recommended": [
    {
      "name": "skill-name",
      "reason": "why this skill is needed for this task",
      "priority": "high|medium|low"
    }
  ],
  "explanation": "brief explanation of the decision"
}`;
}

/**
 * Parsea la respuesta del LLM para extraer las skills recomendadas.
 * @param {string} llmResponse
 * @returns {object}
 */
function parseSkillRecommendation(llmResponse) {
  try {
    // Buscar JSON en la respuesta
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { needs_skill: false, recommended: [], explanation: 'No JSON found' };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      needs_skill: parsed.needs_skill || false,
      recommended: parsed.recommended || [],
      explanation: parsed.explanation || '',
    };
  } catch {
    return { needs_skill: false, recommended: [], explanation: 'Parse error' };
  }
}

/**
 * Busca un skill en el CuratedRegistry por nombre.
 * @param {string} name
 * @returns {object|null}
 */
function findInRegistry(name) {
  const whitelist = CuratedRegistry.getWhitelist();
  return (
    whitelist.find((s) => s.name.toLowerCase() === name.toLowerCase() || s.id === name) || null
  );
}

/**
 * Busca un skill en todas las fuentes (discovery) por nombre o tags.
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function discoverSkills(query) {
  return DiscoveryProviders.searchAll({ query, limit: 10 });
}

/**
 * Instala y configura un skill.
 * @param {object} skillEntry — entry del CuratedRegistry o resultado de discovery
 * @returns {object}
 */
function installAndConfigure(skillEntry) {
  const result = SkillInstaller.install(skillEntry);
  if (result.status === 'installed' || result.status === 'already-installed') {
    // Convertir al formato universal si tiene SKILL.md
    let converted = null;
    if (result.path) {
      const fs = require('fs');
      const skillMdPath = require('path').join(result.path, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, 'utf8');
          converted = SkillConverter.convert(content, { name: skillEntry.name });
        } catch {
          // keep null
        }
      }
    }
    return {
      ...result,
      skillEntry,
      converted,
      ready: true,
    };
  }
  return {
    ...result,
    skillEntry,
    ready: false,
  };
}

/**
 * Proceso completo: analiza tarea → recomienda → busca → instala → configura.
 * @param {object} ctx — { userTask, llmResponse, installedSkills }
 * @returns {Promise<object>}
 */
async function autoMatch(ctx) {
  const { userTask, llmResponse, installedSkills = [] } = ctx;

  // 1. Si hay respuesta del LLM, parsear recomendaciones
  let recommendation;
  if (llmResponse) {
    recommendation = parseSkillRecommendation(llmResponse);
  } else {
    // Sin LLM: hacer una búsqueda heurística por keywords en la tarea
    recommendation = heuristicMatch(userTask, installedSkills);
  }

  if (!recommendation.needs_skill || recommendation.recommended.length === 0) {
    return {
      action: 'no-skill-needed',
      recommendation,
      installed: [],
    };
  }

  // 2. Para cada skill recomendada, buscar e instalar
  const results = [];
  for (const rec of recommendation.recommended) {
    // Primero buscar en el CuratedRegistry (verificados)
    let entry = findInRegistry(rec.name);
    if (!entry) {
      // Si no está en whitelist, buscar via discovery
      const discovered = await discoverSkills(rec.name).catch(() => []);
      if (discovered.length > 0) {
        entry = discovered[0];
      }
    }
    if (!entry) {
      results.push({
        name: rec.name,
        status: 'not-found',
        reason: rec.reason,
      });
      continue;
    }

    // 3. Instalar y configurar
    const installResult = installAndConfigure(entry);
    results.push({
      name: rec.name,
      reason: rec.reason,
      priority: rec.priority,
      ...installResult,
    });
  }

  return {
    action: 'skills-installed',
    recommendation,
    installed: results,
  };
}

/**
 * Matching heurístico (sin LLM) — busca por keywords en la tarea.
 * @param {string} userTask
 * @param {Array} installedSkills
 * @returns {object}
 */
function heuristicMatch(userTask, installedSkills = []) {
  const task = userTask.toLowerCase();
  const whitelist = CuratedRegistry.getWhitelist();
  const recommended = [];

  const keywordMap = [
    { keywords: ['test', 'tdd', 'unit test'], skillId: 'superpowers' },
    { keywords: ['review', 'code review', 'audit'], skillId: 'superpowers' },
    { keywords: ['debug', 'fix bug', 'error'], skillId: 'superpowers' },
    { keywords: ['memory', 'remember', 'context'], skillId: 'claude-mem' },
    {
      keywords: ['ml', 'machine learning', 'model', 'dataset', 'huggingface'],
      skillId: 'huggingface-skills',
    },
    {
      keywords: ['full stack', 'frontend', 'backend', 'react', 'next'],
      skillId: 'jeffallan-claude-skills',
    },
    { keywords: ['rag', 'retrieval', 'knowledge base'], skillId: 'awesome-llm-apps' },
    { keywords: ['mcp', 'tool', 'integration'], skillId: 'mcp-reference-servers' },
    { keywords: ['agent', 'orchestrat', 'workflow'], skillId: 'wshobson-agents' },
    {
      keywords: ['multi-domain', 'marketing', 'compliance', 'business'],
      skillId: 'alirezarezvani-claude-skills',
    },
  ];

  const installedNames = new Set(installedSkills.map((s) => s.name));

  for (const { keywords, skillId } of keywordMap) {
    if (keywords.some((k) => task.includes(k))) {
      const entry = whitelist.find((s) => s.id === skillId);
      if (entry && !installedNames.has(entry.name)) {
        recommended.push({
          name: entry.name,
          reason: `Task mentions: ${keywords.filter((k) => task.includes(k)).join(', ')}`,
          priority: 'medium',
        });
      }
    }
  }

  return {
    needs_skill: recommended.length > 0,
    recommended: recommended.slice(0, 3),
    explanation: 'Heuristic match based on task keywords',
  };
}

module.exports = {
  buildSkillSelectionPrompt,
  parseSkillRecommendation,
  autoMatch,
  heuristicMatch,
  findInRegistry,
  discoverSkills,
  installAndConfigure,
};
