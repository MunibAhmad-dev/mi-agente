"""
Generador del documento .docx: "Visión por Computadora — Arquitectura e Integración".
Crea un documento Word profesional que explica cómo funciona la visión por
computadora en el sistema, cómo se conectan los componentes, y qué proyectos
open-source se recomiendan.
"""
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

doc = Document()

# ── Estilos ──
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(11)

# ── Título ──
title = doc.add_heading('Visión por Computadora — Arquitectura e Integración', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

doc.add_paragraph(
    'Documento técnico que explica cómo funciona la visión por computadora en el sistema, '
    'cómo se conectan los componentes, los bugs encontrados y corregidos, y los proyectos '
    'open-source recomendados para alcanzar capacidades de GPT-4, Grok y Claude.'
).italic = True

doc.add_paragraph()

# ── 1. Resumen Ejecutivo ──
doc.add_heading('1. Resumen Ejecutivo', level=1)
doc.add_paragraph(
    'La función de visión por computadora permite al chat analizar imágenes que el usuario '
    'adjunta: identificar objetos, leer texto (OCR), describir escenas, interpretar gráficos '
    'y documentos, y más. Este documento detalla la arquitectura del pipeline de visión, '
    'los bugs que impedían su funcionamiento correcto, las correcciones aplicadas, y una '
    'guía de proyectos open-source para potenciar el sistema.'
)

# ── 2. Arquitectura del Pipeline de Visión ──
doc.add_heading('2. Arquitectura del Pipeline de Visión', level=1)
doc.add_paragraph(
    'El flujo de visión sigue estos pasos desde que el usuario adjunta una imagen hasta '
    'que el modelo la analiza:'
)

steps = [
    ('Paso 1 — Subida', 'El usuario adjunta una imagen en el chat (drag & drop o botón de adjuntar). '
     'El frontend la sube a /api/files, que la almacena en el sistema de archivos o blob storage '
     'y devuelve una referencia de archivo.'),
    ('Paso 2 — Codificación', 'Antes de enviar al modelo, encodeAndFormat() (api/server/services/Files/images/encode.js) '
     'convierte la imagen a base64 o URL según el endpoint: '
     'Anthropic usa source.base64, Google usa inlineData, OpenAI usa image_url con data URI, '
     'Ollama usa images: [base64].'),
    ('Paso 3 — Formato de mensaje', 'formatVisionMessage() (formatMessages.js) o formatMediaMessage() '
     '(@librechat/agents SDK) construye el mensaje multimodal: content = [{type: text, text: "..."}, '
     '{type: image_url, image_url: {url: "data:image/png;base64,..."}}].'),
    ('Paso 4 — Validación', 'checkVisionRequest() valida si el modelo seleccionado soporta visión '
     '(contra la lista visionModels). Si no soporta, registra un warning.'),
    ('Paso 5 — Envío al modelo', 'El mensaje se envía al endpoint configurado. Para Ollama, el proxy '
     'convierte el formato OpenAI al formato nativo de Ollama (images: [base64]).'),
    ('Paso 6 — Respuesta', 'El modelo analiza la imagen y devuelve una descripción/texto en su respuesta.'),
]

for title_text, desc in steps:
    p = doc.add_paragraph()
    run = p.add_run(title_text + ': ')
    run.bold = True
    p.add_run(desc)

# ── 3. Diagrama de Conexión ──
doc.add_heading('3. Diagrama de Conexión de Componentes', level=1)

diagram = """\
┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Frontend    │────▶│  /api/files  │────▶│  Blob Storage /   │
│  (React)     │     │  (upload)   │     │  File System     │
└──────────────┘     └─────────────┘     └──────────────────┘
       │
       │ mensaje con image_urls
       ▼
┌──────────────────────────────────────────────────────┐
│  AgentClient (client.js)                             │
│  ├─ checkVisionRequest()  ← valida modelo de visión  │
│  ├─ addImageURLs()        ← encodeAndFormat()        │
│  └─ formatMessages()      ← formatVisionMessage()    │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  Endpoint (librechat.yaml)                           │
│  ├─ Vision (local) → Ollama Proxy → toNativeBody()  │
│  │                   └─ convierte image_url → images  │
│  ├─ OpenAI / Claude / Gemini (remotos)               │
│  └─ LiteLLM Gateway (multi-proveedor)                │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│  Modelo de Visión (LLM multimodal)                   │
│  ├─ Ollama: minicpm-v, llava, moondream, qwen2-vl   │
│  ├─ Remoto: GPT-4o, Claude-3.5, Gemini, Grok         │
│  └─ Analiza imagen → devuelve texto descriptivo      │
└──────────────────────────────────────────────────────┘
"""

p = doc.add_paragraph(diagram)
p.style = doc.styles['No Spacing']
for run in p.runs:
    run.font.name = 'Consolas'
    run.font.size = Pt(9)

# ── 4. Bugs Encontrados y Correcciones ──
doc.add_heading('4. Bugs Encontrados y Correcciones', level=1)

bugs = [
    {
        'bug': 'Bug 1: checkVisionRequest() era un no-op',
        'problem': 'En el AgentClient (client.js), checkVisionRequest() era una función vacía. '
                   'No validaba si el modelo soporta visión, ni seteaba isVisionModel. '
                   'Resultado: imágenes se enviaban a modelos text-only (DeepSeek-v3/r1) que '
                   'no pueden procesarlas.',
        'fix': 'Implementado checkVisionRequest(attachments) que valida el modelo contra '
               'validateVisionModel() con una lista ampliada de modelos de visión. Registra '
               'un warning si el modelo no soporta visión. Se llama después de processAttachments().',
        'file': 'api/server/controllers/agents/client.js',
    },
    {
        'bug': 'Bug 2: Proxy Ollama no convertía formato de imágenes',
        'problem': 'toNativeBody() en ollamaProxy.js pasaba los mensajes verbatim del formato '
                   'OpenAI (content[].image_url) al API nativo de Ollama. Pero Ollama espera '
                   'images: [base64] en cada mensaje, no el formato content array de OpenAI. '
                   'Resultado: los modelos de visión de Ollama (llava, minicpm-v) nunca recibían '
                   'las imágenes.',
        'fix': 'Añadida conversión en toNativeBody(): detecta content[].image_url, extrae el '
               'base64 del data URI, y lo mueve a images: [base64] en el mensaje nativo de Ollama. '
               'También une las partes de texto en un string.',
        'file': 'api/server/routes/ollamaProxy.js',
    },
    {
        'bug': 'Bug 3: Lista visionModels desactualizada',
        'problem': 'La lista visionModels en config.ts no incluía modelos modernos: minicpm-v, '
                   'qwen2-vl, qwen3-vl, internvl, cogvlm, pixtral, bakllava, llava-llama3, '
                   'llava-next, llava-onevision, phi-3-vision, gemma3, etc.',
        'fix': 'Expandida la lista con 20+ modelos adicionales. También se pasan additionalModels '
               'en checkVisionRequest() para los modelos no incluidos en el paquete built.',
        'file': 'packages/data-provider/src/config.ts',
    },
    {
        'bug': 'Bug 4: No había endpoint de visión configurado',
        'problem': 'DeepSeek-v3/r1 (los modelos principales) son text-only. No había modelos de '
                   'visión disponibles en librechat.yaml para que el usuario pudiera analizar imágenes.',
        'fix': 'Añadido endpoint "Vision (local)" en librechat.yaml con modelos open-source: '
               'minicpm-v, llava, llava-llama3, moondream. Todos servidos vía Ollama con fetch: true.',
        'file': 'librechat.yaml',
    },
]

for b in bugs:
    doc.add_heading(b['bug'], level=2)
    p = doc.add_paragraph()
    p.add_run('Problema: ').bold = True
    p.add_run(b['problem'])
    p = doc.add_paragraph()
    p.add_run('Corrección: ').bold = True
    p.add_run(b['fix'])
    p = doc.add_paragraph()
    p.add_run('Archivo: ').bold = True
    p.add_run(b['file'])
    doc.add_paragraph()

# ── 5. Modelos de Visión Open-Source Recomendados ──
doc.add_heading('5. Modelos de Visión Open-Source Recomendados', level=1)
doc.add_paragraph(
    'Los siguientes modelos son open-source, con licencias permisivas (MIT, Apache-2.0), '
    'y están ordenados por relación calidad/consumo de RAM. Todos están disponibles en Ollama.'
)

models_table = doc.add_table(rows=1, cols=6)
models_table.style = 'Light Grid Accent 1'
models_table.alignment = WD_TABLE_ALIGNMENT.CENTER
hdr = models_table.rows[0].cells
headers = ['Modelo', 'Licencia', 'VRAM mín.', 'Capacidades', 'Sin censura', 'Ollama']
for i, h in enumerate(headers):
    hdr[i].text = h
    for p in hdr[i].paragraphs:
        for run in p.runs:
            run.bold = True

model_data = [
    ('MiniCPM-V 4.6', 'Apache-2.0', '~3GB', 'Imagen, video, OCR, multi-imagen', 'Sí (sin filtros)', 'minicpm-v'),
    ('MiniCPM-o 4.5', 'Apache-2.0', '~6GB', 'Imagen+voz+video, nivel GPT-4o', 'Sí', 'minicpm-v'),
    ('Qwen2.5-VL / Qwen3-VL', 'Apache-2.0', '~2-8GB', 'OCR 32 idiomas, agente visual, 256K ctx', 'Parcial (fine-tunable)', 'qwen2.5-vl'),
    ('LLaVA / LLaVA-NeXT', 'Apache-2.0', '~4.7GB', 'Imagen, OCR, razonamiento visual', 'Fine-tunes disponibles', 'llava'),
    ('LLaVA-OneVision', 'Apache-2.0', '~3GB', 'Multi-imagen, video, 3D', 'Fine-tunes disponibles', 'llava-onevision'),
    ('Moondream', 'Apache-2.0', '~1.5GB', 'Ultraligero, básico', 'Sí', 'moondream'),
    ('Gemma 3', 'Permisiva', '~1-16GB', '128K ctx, 140+ idiomas, multimodal', 'Fine-tunes disponibles', 'gemma3'),
    ('Llama 3.2 Vision', 'Llama License', '~6GB', 'Imagen, OCR, razonamiento', 'Fine-tunes disponibles', 'llama3.2-vision'),
    ('InternVL2', 'MIT', '~2-60GB', 'OCR, documentos, gráficos', 'Sí', 'vía llama.cpp'),
    ('Phi-3-Vision', 'MIT', '~4GB', 'Compacto, documentos', 'Parcial', 'vía llama.cpp'),
    ('Pixtral', 'Apache-2.0', '~8GB', 'Imagen, OCR, multi-imagen', 'Sí', 'vía vLLM'),
    ('Florence-2 (tool)', 'MIT', '~0.5-1.5GB', 'Detección, OCR, segmentación (no chat)', 'Sin censura (no chat)', 'microservice'),
]

for row_data in model_data:
    row = models_table.add_row().cells
    for i, val in enumerate(row_data):
        row[i].text = val

doc.add_paragraph()

# ── 6. Proyectos Open-Source para Mejorar el Sistema ──
doc.add_heading('6. Proyectos Open-Source para Mejorar el Sistema', level=1)
doc.add_paragraph(
    'Además de los modelos LLM multimodales, estas herramientas pueden añadir capacidades '
    'específicas de visión por computadora que superan lo que un LLM puede hacer solo:'
)

tools = [
    {
        'name': 'Florence-2 (Microsoft)',
        'license': 'MIT',
        'github': 'https://huggingface.co/microsoft/Florence-2-large',
        'ram': '~0.5-1.5GB VRAM',
        'desc': 'Modelo fundacional de visión (no chat). Capacidades: caption, OCR, detección '
                'de objetos, segmentación, region proposal, grounding. Ultra-ligero. Ideal como '
                'microservicio/herramienta junto al LLM principal.',
    },
    {
        'name': 'PaddleOCR',
        'license': 'Apache-2.0',
        'github': 'https://github.com/PaddlePaddle/PaddleOCR',
        'ram': '~500MB-1GB (CPU)',
        'desc': 'Motor OCR de producción: 80+ idiomas, reconocimiento de tablas, análisis de '
                'layout de documentos, reconocimiento de fórmulas. Mejor que el OCR integrado '
                'en cualquier LLM. Microservicio Python.',
    },
    {
        'name': 'Grounding DINO',
        'license': 'Apache-2.0',
        'github': 'https://github.com/IDEA-Research/GroundingDINO',
        'ram': '~2-4GB VRAM',
        'desc': 'Detección de objetos de vocabulario abierto: detecta CUALQUIER objeto por '
                'descripción de texto (zero-shot). Combina con SAM 2 para detectar+segmentar.',
    },
    {
        'name': 'SAM 2 (Segment Anything)',
        'license': 'Apache-2.0',
        'github': 'https://github.com/facebookresearch/sam2',
        'ram': '~4-8GB VRAM',
        'desc': 'Segmentación promptable (punto, caja, máscara). Segmenta cualquier objeto '
                'en cualquier imagen/video. Pipeline "Grounded SAM": detectar+segmentar.',
    },
    {
        'name': 'Tesseract OCR',
        'license': 'Apache-2.0',
        'github': 'https://github.com/tesseract-ocr/tesseract',
        'ram': '<100MB',
        'desc': 'OCR estándar de la industria. 100+ idiomas. Integración simple vía '
                'node-tesseract-ocr npm. Para OCR básico sin GPU.',
    },
    {
        'name': 'Sharp (Node.js)',
        'license': 'Apache-2.0',
        'github': 'https://github.com/lovell/sharp',
        'ram': '~50MB',
        'desc': 'Procesamiento de imágenes en Node.js (resize, formato, compresión). Backend '
                'libvips C++ — el más rápido. Para preprocesar imágenes antes de enviar al LLM.',
    },
]

for tool in tools:
    doc.add_heading(tool['name'], level=2)
    p = doc.add_paragraph()
    p.add_run('Licencia: ').bold = True
    p.add_run(f"{tool['license']}  |  ")
    p.add_run('RAM: ').bold = True
    p.add_run(tool['ram'])
    p = doc.add_paragraph()
    p.add_run('GitHub: ').bold = True
    p.add_run(tool['github'])
    p = doc.add_paragraph()
    p.add_run('Descripción: ').bold = True
    p.add_run(tool['desc'])
    doc.add_paragraph()

# ── 7. Comparativa con GPT-4, Grok y Claude ──
doc.add_heading('7. Comparativa de Capacidades: GPT-4 vs Grok vs Claude vs Open-Source', level=1)

comp_table = doc.add_table(rows=1, cols=5)
comp_table.style = 'Light Grid Accent 1'
hdr = comp_table.rows[0].cells
headers = ['Capacidad', 'GPT-4o', 'Grok-3', 'Claude-3.5', 'Open-Source (mejor combo)']
for i, h in enumerate(headers):
    hdr[i].text = h
    for p in hdr[i].paragraphs:
        for run in p.runs:
            run.bold = True

capabilities = [
    ('Descripción de imagen', '✓ Excelente', '✓ Excelente', '✓ Excelente', '✓ MiniCPM-V/Qwen2.5-VL'),
    ('OCR (texto en imagen)', '✓ Bueno', '✓ Bueno', '✓ Muy bueno', '✓ PaddleOCR/Florence-2 (superior)'),
    ('Detección de objetos', 'Parcial', 'Parcial', 'Parcial', '✓ Grounding DINO (superior, zero-shot)'),
    ('Segmentación', 'No', 'No', 'No', '✓ SAM 2 (exclusivo)'),
    ('Multi-imagen', '✓', '✓', '✓', '✓ LLaVA-OneVision/MiniCPM-V'),
    ('Video', '✓ GPT-4o', 'Limitado', 'No', '✓ MiniCPM-o/LLaVA-Video'),
    ('Gráficos/diagramas', '✓', '✓', '✓', '✓ Qwen2.5-VL/InternVL'),
    ('Documentos PDF', '✓', '✓', '✓', '✓ PaddleOCR + LLM'),
    ('Sin censura', 'No', 'No', 'No', '✓ Fine-tunes disponibles'),
    ('Privacidad (local)', 'No', 'No', 'No', '✓ 100% local vía Ollama'),
    ('Costo', 'Pago por API', 'Pago por API', 'Pago por API', 'Gratis (local)'),
]

for row_data in capabilities:
    row = comp_table.add_row().cells
    for i, val in enumerate(row_data):
        row[i].text = val

doc.add_paragraph()

# ── 8. Configuración Recomendada ──
doc.add_heading('8. Configuración Recomendada', level=1)

doc.add_heading('8.1 Setup mínimo (bajo consumo de RAM, ~3GB VRAM)', level=2)
doc.add_paragraph('Ideal para servidores con GPU modesta o sin GPU dedicada:')
setup_min = [
    'Modelo principal: MiniCPM-V 4.6 (1.3B, ~3GB VRAM) vía Ollama',
    'OCR: Tesseract OCR (<100MB RAM) para texto en imágenes',
    'Preprocesamiento: Sharp (Node.js, ~50MB)',
    'Configuración: endpoint "Vision (local)" en librechat.yaml (ya configurado)',
    'Instalar: ollama pull minicpm-v',
]
for item in setup_min:
    doc.add_paragraph(item, style='List Bullet')

doc.add_heading('8.2 Setup completo (calidad GPT-4, ~8-16GB VRAM)', level=2)
doc.add_paragraph('Para igualar o superar las capacidades de GPT-4o/Grok/Claude:')
setup_full = [
    'Modelo principal: Qwen2.5-VL 8B o MiniCPM-o 4.5 (~6-8GB VRAM) vía Ollama',
    'OCR avanzado: PaddleOCR microservice (Apache-2.0, ~1GB RAM)',
    'Detección: Grounding DINO microservice (Apache-2.0, ~2-4GB VRAM)',
    'Segmentación: SAM 2 microservice (Apache-2.0, ~4-8GB VRAM)',
    'Preprocesamiento: Sharp para resize/compresión antes del modelo',
    'Pipeline: Grounded SAM (detectar → segmentar) + LLM para descripción',
    'Instalar: ollama pull qwen2.5-vl (o minicpm-v como fallback)',
]
for item in setup_full:
    doc.add_paragraph(item, style='List Bullet')

# ── 9. Cómo Activar la Visión ──
doc.add_heading('9. Cómo Activar la Visión en el Sistema', level=1)
steps_activate = [
    '1. Instalar un modelo de visión en Ollama: ollama pull minicpm-v (recomendado)',
    '2. El endpoint "Vision (local)" aparece automáticamente en el chat (fetch: true)',
    '3. Seleccionar el modelo de visión en el selector del chat',
    '4. Adjuntar una imagen (drag & drop o botón de clip)',
    '5. Escribir una pregunta sobre la imagen (ej: "¿Qué hay en esta imagen?")',
    '6. El sistema codifica la imagen, la envía al modelo, y este la analiza',
]
for step in steps_activate:
    doc.add_paragraph(step, style='List Number')

# ── 10. Archivos Modificados ──
doc.add_heading('10. Archivos Modificados', level=1)
files_table = doc.add_table(rows=1, cols=3)
files_table.style = 'Light Grid Accent 1'
hdr = files_table.rows[0].cells
for i, h in enumerate(['Archivo', 'Cambio', 'Propósito']):
    hdr[i].text = h
    for p in hdr[i].paragraphs:
        for run in p.runs:
            run.bold = True

modified_files = [
    ('api/server/routes/ollamaProxy.js', 'toNativeBody() conversión de imágenes', 'Convierte image_url → images[base64] para Ollama'),
    ('api/server/controllers/agents/client.js', 'checkVisionRequest() implementado', 'Valida si el modelo soporta visión'),
    ('packages/data-provider/src/config.ts', 'visionModels expandido', '+20 modelos de visión open-source'),
    ('librechat.yaml', 'Endpoint "Vision (local)" añadido', 'Modelos minicpm-v, llava, moondream vía Ollama'),
]
for f in modified_files:
    row = files_table.add_row().cells
    for i, val in enumerate(f):
        row[i].text = val

# ── Guardar ──
output_path = '/workspace/vicion por computadora.docx'
doc.save(output_path)
print(f'Documento creado: {output_path}')
