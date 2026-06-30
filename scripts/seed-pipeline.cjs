const fs = require('fs');
const path = require('path');

const agentsDir = path.resolve(__dirname, '..', 'vault', 'Agents');

const agents = {
  'forager': {
    name: 'Forager',
    description: 'Busca informacion en el vault sobre un tema y extrae hallazgos clave.',
    allowed_folders: ['.'],
    allowed_tags: ['agent-access'],
    model: 'gemini-2.5-flash',
    tools: ['vault', 'rag'],
    max_actions: 4,
    chain_next: 'synthesizer',
    instructions: 'Eres el PRIMER AGENTE de un pipeline de contenido.\nTu funcion es recolectar materia prima.\n\n## Flujo\n1. El usuario te da un tema.\n2. Usas rag_search para buscar en el vault.\n3. Lees los archivos y extraes conceptos clave.\n4. Creas Research/<Tema>/findings.md.\n5. Haces rag_index_folder.\n\n## Output esperado\nResearch/<Tema>/findings.md con resumen, conceptos, referencias, preguntas abiertas.\n\n## Chain context\nSi recibes prev_actions de un agente anterior, usalos como base.'
  },
  'synthesizer': {
    name: 'Synthesizer',
    description: 'Toma hallazgos del Forager y produce documentos estructurados.',
    allowed_folders: ['Research', 'Agents'],
    allowed_tags: ['agent-access', 'research'],
    model: 'gemini-2.5-flash',
    tools: ['vault', 'rag'],
    max_actions: 5,
    chain_next: 'reflector',
    instructions: 'Eres el SEGUNDO AGENTE del pipeline.\n\n## Flujo\n1. Revisa chain context (prev_actions del Forager).\n2. Lee Research/<Tema>/findings.md.\n3. Produce: 01-introduction.md, 02-analysis.md, 03-conclusion.md.\n4. Cada doc con frontmatter, headings, referencias.\n5. Haces rag_index_folder.\n\n## Chain context\nSiempre revisa que hizo el agente anterior.'
  },
  'reflector': {
    name: 'Reflector',
    description: 'Revisa calidad de los documentos y aplica correcciones.',
    allowed_folders: ['Research', 'Agents'],
    allowed_tags: ['agent-access', 'research'],
    model: 'gemini-2.5-flash',
    tools: ['vault'],
    max_actions: 3,
    chain_next: 'curator',
    instructions: 'Eres el TERCER AGENTE del pipeline.\n\n## Flujo\n1. Revisa chain context para ver docs de Synthesizer.\n2. Lee los docs en Research/<Tema>/.\n3. Evalua: integridad, claridad, estructura, referencias.\n4. Si hay problemas, corrige. Si no, usa action none.\n\n## Criterios\nFrontmatter con tags? Headings jerarquicos? Referencias? Errores factuales?\n\n## Chain context\nTu trabajo es asegurar contenido publicable.'
  },
  'curator': {
    name: 'Curator',
    description: 'Cataloga, indexa y documenta el contenido final.',
    allowed_folders: ['Research', 'Agents'],
    allowed_tags: ['agent-access'],
    model: 'gemini-2.5-flash',
    tools: ['vault', 'rag'],
    max_actions: 3,
    instructions: 'Eres el CUARTO Y ULTIMO AGENTE del pipeline.\n\n## Flujo\n1. Revisa chain context.\n2. Lee todos los docs en Research/<Tema>/.\n3. Crea README.md con indice, resumen, tags, estado.\n4. Agrega tags consistentes.\n5. Hace rag_index_folder.\n6. Crea log en Agents/_logs/ con resumen del pipeline.\n\n## Chain context\nUltimo paso. Todo debe quedar coherente e indexado.'
  }
};

for (const [id, cfg] of Object.entries(agents)) {
  const lines = ['---'];
  lines.push('name: ' + cfg.name);
  lines.push('description: ' + cfg.description);
  lines.push('allowed_folders:');
  for (const f of cfg.allowed_folders) lines.push('  - ' + f);
  lines.push('allowed_tags:');
  for (const t of cfg.allowed_tags) lines.push('  - ' + t);
  lines.push('model: ' + cfg.model);
  lines.push('tools:');
  for (const t of cfg.tools) lines.push('  - ' + t);
  lines.push('max_actions: ' + cfg.max_actions);
  if (cfg.chain_next) lines.push('chain_next: ' + cfg.chain_next);
  lines.push('instructions: |');
  for (const line of cfg.instructions.split('\n')) {
    lines.push('  ' + line);
  }
  lines.push('---');
  const filePath = path.join(agentsDir, id + '.md');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  console.log('OK: ' + filePath);
}
