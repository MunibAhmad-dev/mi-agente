/**
 * DiffService
 *
 * Servicio para calcular y formatear diferencias entre archivos
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Tipos de cambio
 */
const ChangeType = {
  ADDED: 'added',
  REMOVED: 'removed',
  UNCHANGED: 'unchanged',
};

/**
 * Calcular diferencias entre dos textos
 */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const changes = [];
  let oldIdx = 0;
  let newIdx = 0;

  // Algoritmo de diferencias basado en LCS
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      // Líneas añadidas
      changes.push({
        type: ChangeType.ADDED,
        value: newLines[newIdx],
        newLineNumber: newIdx + 1,
        oldLineNumber: null,
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Líneas eliminadas
      changes.push({
        type: ChangeType.REMOVED,
        value: oldLines[oldIdx],
        oldLineNumber: oldIdx + 1,
        newLineNumber: null,
      });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // Líneas iguales
      changes.push({
        type: ChangeType.UNCHANGED,
        value: oldLines[oldIdx],
        oldLineNumber: oldIdx + 1,
        newLineNumber: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
    } else {
      // Buscar en las siguientes líneas
      let foundInNew = -1;
      let foundInOld = -1;

      for (let i = newIdx + 1; i < Math.min(newLines.length, newIdx + 5); i++) {
        if (oldLines[oldIdx] === newLines[i]) {
          foundInNew = i;
          break;
        }
      }

      for (let i = oldIdx + 1; i < Math.min(oldLines.length, oldIdx + 5); i++) {
        if (oldLines[i] === newLines[newIdx]) {
          foundInOld = i;
          break;
        }
      }

      if (foundInNew > 0 && (foundInOld < 0 || foundInNew - newIdx <= foundInOld - oldIdx)) {
        while (newIdx < foundInNew) {
          changes.push({
            type: ChangeType.ADDED,
            value: newLines[newIdx],
            newLineNumber: newIdx + 1,
            oldLineNumber: null,
          });
          newIdx++;
        }
      } else if (foundInOld > 0) {
        while (oldIdx < foundInOld) {
          changes.push({
            type: ChangeType.REMOVED,
            value: oldLines[oldIdx],
            oldLineNumber: oldIdx + 1,
            newLineNumber: null,
          });
          oldIdx++;
        }
      } else {
        changes.push({
          type: ChangeType.REMOVED,
          value: oldLines[oldIdx],
          oldLineNumber: oldIdx + 1,
          newLineNumber: null,
        });
        changes.push({
          type: ChangeType.ADDED,
          value: newLines[newIdx],
          newLineNumber: newIdx + 1,
          oldLineNumber: null,
        });
        oldIdx++;
        newIdx++;
      }
    }
  }

  return changes;
}

/**
 * Calcular estadísticas de un diff
 */
function computeStats(changes) {
  return {
    additions: changes.filter((c) => c.type === ChangeType.ADDED).length,
    deletions: changes.filter((c) => c.type === ChangeType.REMOVED).length,
    unchanged: changes.filter((c) => c.type === ChangeType.UNCHANGED).length,
    total: changes.length,
  };
}

/**
 * Comparar dos archivos
 */
async function diffFiles(oldFilePath, newFilePath) {
  try {
    const oldContent = await fs.readFile(oldFilePath, 'utf-8');
    const newContent = await fs.readFile(newFilePath, 'utf-8');
    return diffContents(oldContent, newContent);
  } catch (error) {
    throw new Error(`Failed to diff files: ${error.message}`);
  }
}

/**
 * Comparar contenidos de texto
 */
function diffContents(oldContent, newContent) {
  const changes = computeDiff(oldContent, newContent);
  const stats = computeStats(changes);

  return {
    oldContent,
    newContent,
    changes,
    stats,
  };
}

/**
 * Comparar archivos entre sandbox y workspace real
 */
async function diffSandboxWithWorkspace(sandboxPath, workspacePath, filePath) {
  const sandboxFilePath = path.join(sandboxPath, filePath);
  const workspaceFilePath = path.join(workspacePath, filePath);

  try {
    const [sandboxContent, workspaceContent] = await Promise.all([
      fs.readFile(sandboxFilePath, 'utf-8'),
      fs.readFile(workspaceFilePath, 'utf-8'),
    ]);

    return {
      filePath,
      ...diffContents(workspaceContent, sandboxContent), // diff de workspace -> sandbox
    };
  } catch (error) {
    // Uno de los archivos no existe
    if (error.code === 'ENOENT') {
      let sandboxExists = true;
      let workspaceExists = true;
      try {
        await fs.access(sandboxFilePath);
      } catch {
        sandboxExists = false;
      }
      try {
        await fs.access(workspaceFilePath);
      } catch {
        workspaceExists = false;
      }

      if (!sandboxExists && workspaceExists) {
        // Archivo eliminado del sandbox (existe en workspace)
        const workspaceContent = await fs.readFile(workspaceFilePath, 'utf-8');
        return {
          filePath,
          oldContent: workspaceContent,
          newContent: '',
          changes: workspaceContent.split('\n').map((line, idx) => ({
            type: ChangeType.REMOVED,
            value: line,
            oldLineNumber: idx + 1,
            newLineNumber: null,
          })),
          stats: {
            additions: 0,
            deletions: workspaceContent.split('\n').length,
            unchanged: 0,
            total: workspaceContent.split('\n').length,
          },
        };
      } else if (sandboxExists && !workspaceExists) {
        // Archivo nuevo en sandbox (no existe en workspace)
        const sandboxContent = await fs.readFile(sandboxFilePath, 'utf-8');
        return {
          filePath,
          oldContent: '',
          newContent: sandboxContent,
          changes: sandboxContent.split('\n').map((line, idx) => ({
            type: ChangeType.ADDED,
            value: line,
            newLineNumber: idx + 1,
            oldLineNumber: null,
          })),
          stats: {
            additions: sandboxContent.split('\n').length,
            deletions: 0,
            unchanged: 0,
            total: sandboxContent.split('\n').length,
          },
        };
      }
    }
    throw error;
  }
}

/**
 * Generar diff en formato unified (similar a git diff)
 */
function generateUnifiedDiff(
  oldContent,
  newContent,
  oldFileName = 'original',
  newFileName = 'modified',
  contextLines = 3,
) {
  const changes = computeDiff(oldContent, newContent);
  const lines = [];

  lines.push(`--- ${oldFileName}`);
  lines.push(`+++ ${newFileName}`);

  let oldLine = 1;
  let newLine = 1;
  let hunkStart = 0;
  let hunkLines = [];
  let inHunk = false;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];

    if (change.type !== ChangeType.UNCHANGED) {
      // Iniciar hunk si no está activo
      if (!inHunk) {
        // Añadir líneas de contexto anteriores
        const contextStart = Math.max(0, i - contextLines);
        for (let j = contextStart; j < i; j++) {
          const ctxLine = changes[j];
          if (ctxLine.type === ChangeType.UNCHANGED) {
            hunkLines.push(` ${ctxLine.value}`);
          }
        }
        inHunk = true;
        hunkStart = i;
      }
    }

    if (inHunk) {
      if (change.type === ChangeType.REMOVED) {
        hunkLines.push(`-${change.value}`);
        oldLine++;
      } else if (change.type === ChangeType.ADDED) {
        hunkLines.push(`+${change.value}`);
        newLine++;
      } else if (change.type === ChangeType.UNCHANGED) {
        // Añadir líneas de contexto
        hunkLines.push(` ${change.value}`);
        oldLine++;
        newLine++;
      }

      // Verificar si el hunk terminó
      const nextChange = changes[i + 1];
      if (
        !nextChange ||
        (nextChange.type === ChangeType.UNCHANGED && !isInHunkRange(i + 1, changes, contextLines))
      ) {
        // Terminar hunk
        const oldCount = hunkLines.filter((l) => l.startsWith('-') || l.startsWith(' ')).length;
        const newCount = hunkLines.filter((l) => l.startsWith('+') || l.startsWith(' ')).length;

        lines.push(`@@ -${oldLine - oldCount},${oldCount} +${newLine - newCount},${newCount} @@`);
        lines.push(...hunkLines);
        hunkLines = [];
        inHunk = false;
      }
    }
  }

  return lines.join('\n');
}

function isInHunkRange(index, changes, contextLines) {
  let unchangedCount = 0;
  for (let i = index; i < Math.min(changes.length, index + contextLines); i++) {
    if (changes[i].type === ChangeType.UNCHANGED) {
      unchangedCount++;
    }
  }
  return unchangedCount >= contextLines;
}

module.exports = {
  ChangeType,
  computeDiff,
  computeStats,
  diffFiles,
  diffContents,
  diffSandboxWithWorkspace,
  generateUnifiedDiff,
};
