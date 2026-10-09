MASTER PROMPT V3 — UNIVERSAL CREATIVE ENGINE
Full Production-Grade Monolithic AI Creative Platform

0. INSTRUCCIÓN PRINCIPAL

Quiero que construyas un Universal Creative Engine completo, funcional y de calidad de producción.

NO quiero:
un MVP;
una demo;
un prototipo;
una prueba de concepto;
botones simulados;
endpoints falsos;
funciones placeholder;
mocks en producción;
código incompleto;
integraciones simuladas;
una colección de herramientas independientes sin integración;
una arquitectura que dependa innecesariamente de microservicios.

Quiero un producto completo y funcional, construido como un monolito modular, capaz de coordinar múltiples motores, modelos y herramientas especializadas.
El usuario debe percibir todo como un único sistema.
Internamente se pueden utilizar procesos/workers separados para tareas pesadas, pero deben estar coordinados por un núcleo central.

1. OBJETIVO DEL PRODUCTO

El sistema debe funcionar como una combinación de:
AI Agent;
Creative Director;
LLM workspace;
Image Studio;
2D Studio;
3D Studio;
Animation Studio;
Video Studio;
Audio Studio;
Music Studio;
Game Development Environment;
Visual Novel Environment;
Asset Manager;
Project Memory;
RAG;
Model Router;
Resource Manager;
Automated QA;
Automated Repair System.

El objetivo final es que una persona pueda describir una idea en lenguaje natural y el sistema pueda llevarla desde:

IDEA
 ↓
PLANNING
 ↓
CHARACTERS
 ↓
2D
 ↓
3D
 ↓
RIGGING
 ↓
ANIMATION
 ↓
VOICE
 ↓
MUSIC
 ↓
SCENES
 ↓
VIDEO
 ↓
GAME / VISUAL NOVEL
 ↓
QA
 ↓
REPAIR
 ↓
BUILD
 ↓
EXPORT

sin tener que manejar manualmente cada herramienta interna.

2. PRINCIPIO FUNDAMENTAL

No pienses:
"Tengo que integrar Blender, Stable Diffusion, Wan, Godot, etc."

Piensa:
"Tengo que construir un sistema operativo creativo que utiliza Blender, Stable Diffusion, Wan, Godot y otros motores como herramientas internas."

La arquitectura debe estar diseñada alrededor de:

USER INTENT
      ↓
PROJECT STATE
      ↓
CREATIVE PLAN
      ↓
TASK GRAPH
      ↓
RESOURCE PLAN
      ↓
MODEL ROUTER
      ↓
TOOL ROUTER
      ↓
EXECUTION
      ↓
QA
      ↓
REPAIR
      ↓
VERSION
      ↓
ASSET GRAPH
      ↓
PROJECT

3. REGLA DE INVESTIGACIÓN

Antes de implementar una tecnología, modelo o proyecto externo, investiga alternativas actuales.

Para cada herramienta candidata evalúa:
licencia del código;
licencia de pesos;
licencia de datasets cuando sea relevante;
uso comercial;
redistribución;
modificación;
restricciones;
dependencia de servicios externos;
VRAM;
RAM;
CPU;
velocidad;
calidad;
estabilidad;
documentación;
mantenimiento;
integración;
formatos;
API;
automatización;
compatibilidad con Windows/Linux;
compatibilidad con GPU;
facilidad de instalación.

No elijas una herramienta sólo porque sea popular.

Prioriza:
abierto;
permisivo;
ejecutable localmente;
sin suscripción obligatoria;
bajo consumo;
alta calidad;
rápido;
automatizable;
mantenido;
integrable.

4. LICENSING FIREWALL

Crea un sistema central de verificación de licencias.

Cada modelo, herramienta y dependencia debe tener:
NAME
VERSION
CODE LICENSE
WEIGHTS LICENSE
DATASET LICENSE
COMMERCIAL USE
REDISTRIBUTION
MODIFICATION
RESTRICTIONS
SOURCE
CHECKED DATE

Nunca asumir:
Open Source = uso libre.

Si existe una incompatibilidad, debe detectarse antes de incorporar el componente.

5. ARQUITECTURA

```
                ┌───────────────────────────┐
                 │      CREATIVE DASHBOARD    │
                 └─────────────┬─────────────┘
                               │
                               ▼
                 ┌───────────────────────────┐
                 │      AI ORCHESTRATOR      └
                 └─────────────┬─────────────┘
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
       ▼                       ▼                        ▼
   PLANNER                  MEMORY                  ROUTER
       │                       │                        │
       │               ┌───────┼───────┐                │
       │               │       │       │                │
       │              TEXT   VISUAL  ASSET              │
       │               RAG     RAG    GRAPH              │
       │                       │                        │
       └───────────────────────┼────────────────────────┘
                               │
                               ▼
                       CREATIVE COMPILER
                               │
                               ▼
                          TASK GRAPH
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
       IMAGE                  3D                  AUDIO
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                          ANIMATION
                               │
                               ▼
                            VIDEO
                               │
                               ▼
                            GAMES
                               │
                               ▼
                              QA
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                   PASS                  FAIL
                    │                     │
                    │                  REPAIR
                    │                     │
                    │                     ▼
                    └─────────────────── QA
                               │
                               ▼
                         FINAL PROJECT
```

6. MONOLITHIC MODULAR DESIGN

El proyecto debe ser un monolito modular.

Módulos internos:
/core
/orchestrator
/planner
/compiler
/router
/resources
/memory
/rag
/assets
/images
/characters
/3d
/rigging
/animation
/video
/audio
/music
/narrative
/games
/visual-novels
/qa
/repair
/models
/providers
/licenses
/projects
/versioning
/storage
/security
/dashboard
/integrations

Cada módulo debe tener interfaces claras.
No crear microservicios simplemente porque sea técnicamente posible.

7. ORCHESTRATOR

El Orchestrator es el cerebro operativo.
Debe:
recibir tareas;
interpretar intención;
consultar memoria;
crear planes;
descomponer tareas;
establecer dependencias;
elegir modelos;
elegir herramientas;
comprobar recursos;
ejecutar;
monitorear;
validar;
reparar;
versionar;
actualizar memoria.

Debe soportar DAGs.

Ejemplo:

```
CHARACTER
    │
    ├── CHARACTER SHEET
    │
    ├── TURNAROUND
    │
    └── 3D MODEL
           │
           ├── RETOPOLOGY
           ├── UV
           ├── MATERIAL
           └── RIG
                  │
                  ├── FACIAL RIG
                  └── ANIMATION
```

8. CREATIVE SPECIFICATION

Cada solicitud debe convertirse en una especificación estructurada.

Ejemplo:
PROJECT
SCENE
CHARACTER
STYLE
ENVIRONMENT
CAMERA
LIGHTING
ANIMATION
AUDIO
NARRATIVE
OUTPUT
QUALITY
CONSTRAINTS

Esta especificación debe poder editarse.

9. CREATIVE COMPILER

Crear un compilador que transforme:

NATURAL LANGUAGE
      ↓
CREATIVE SPEC
      ↓
DEPENDENCIES
      ↓
ASSET REQUIREMENTS
      ↓
MODEL REQUIREMENTS
      ↓
TASK GRAPH
      ↓
EXECUTION

Debe detectar automáticamente:
qué existe;
qué falta;
qué puede reutilizarse;
qué debe regenerarse.

10. MODEL ROUTER

Crear un router basado en capacidades.
No utilizar un modelo fijo para cada tarea.

Cada modelo tendrá:
CAPABILITIES
QUALITY
SPEED
VRAM
RAM
CPU
CONTEXT
LICENSE
MODALITY
QUANTIZATION
STRENGTHS
WEAKNESSES

El router elegirá dinámicamente.

Modos:
FAST
BALANCED
QUALITY
MAX QUALITY

11. RESOURCE MANAGER

Administrar:
GPU;
VRAM;
RAM;
CPU;
almacenamiento;
procesos;
modelos;
workers.

Implementar:
lazy loading;
unloading;
caching;
CPU offload;
GPU offload;
quantization;
batching;
scheduling.

No cargar modelos pesados innecesariamente.

12. REMOTE COMPUTE

Crear una capa de computación híbrida:

```
LOCAL GPU
    ↓
RESOURCE ESTIMATION
    ↓
ENOUGH?
 ┌──┴──┐
YES    NO
 │      │
LOCAL   REMOTE
        │
   ┌────┴─────┐
   ▼          ▼
COLAB      GPU CLOUD
```

La ejecución remota debe ser controlada por el sistema.

Debe existir:
job submission;
monitoring;
result retrieval;
checkpoint;
retry;
cleanup;
failure recovery.

No depender exclusivamente de APIs.

13. IMAGE ENGINE

Soportar:
generación;
edición;
inpainting;
outpainting;
image-to-image;
reference image;
pose control;
depth control;
edge control;
segmentation;
masks;
composition;
upscaling;
restoration.

Integrar motores apropiados como:
Stable Diffusion;
FLUX;
Qwen Image;
ComfyUI;
otros compatibles.

14. STYLE ENGINE

Construir un sistema de estilos persistentes.

Un estilo debe ser una entidad:

```
STYLE
├── Visual Characteristics
├── Color Palette
├── Lighting
├── Line Style
├── Materials
├── Composition
├── Texture
├── Character Treatment
├── Environment Treatment
└── Reference Images
```

No depender exclusivamente de LoRAs.

Utilizar:
reference retrieval;
embeddings;
image conditioning;
style profiles;
visual RAG;
control mechanisms;
deterministic references.

15. VISUAL RAG

Crear una memoria visual.

Debe almacenar:
personajes;
rostros;
poses;
ropa;
accesorios;
ambientes;
objetos;
estilos;
colores;
materiales;
iluminación;
composiciones.

Antes de generar:

```
REQUEST
 ↓
RETRIEVE REFERENCES
 ↓
GENERATE
 ↓
COMPARE
 ↓
REFINE
```

16. CHARACTER ENGINE

Cada personaje debe ser persistente.

```
CHARACTER
├── Identity
├── Personality
├── Lore
├── Face
├── Body
├── Hands
├── Hair
├── Clothing
├── Accessories
├── Expressions
├── Poses
├── 2D
├── 3D
├── Rig
├── Facial Rig
├── Animations
├── Voice
└── Music Theme
```

17. CHARACTER CONSISTENCY

Crear mecanismos para conservar:
identidad;
rostro;
proporciones;
cabello;
ropa;
accesorios;
colores;
estilo.

No generar cada vista desde cero sin referencias.

18. CHARACTER SHEETS

Generar:
frontal;
lateral;
espalda;
3/4;
close-up;
manos;
pies;
expresiones;
accesorios;
ropa.

Debe existir validación automática entre vistas.

19. TURNAROUND

Construir un pipeline:

```
REFERENCE
 ↓
MULTI-VIEW GENERATION
 ↓
CONSISTENCY ANALYSIS
 ↓
CORRECTION
 ↓
FINAL TURNAROUND
```

Si una vista falla, regenerar sólo esa vista.

20. 2D → 3D

No hacer una conversión directa simplista.

Pipeline:

```
2D
 ↓
MULTI-VIEW
 ↓
DEPTH
 ↓
LANDMARKS
 ↓
BODY STRUCTURE
 ↓
FACE STRUCTURE
 ↓
VOLUMETRIC RECONSTRUCTION
 ↓
MESH
 ↓
RETOPOLOGY
 ↓
UV
 ↓
TEXTURE
 ↓
MATERIAL
 ↓
RIG
 ↓
QA
```

El objetivo es que el modelo 3D conserve la identidad visual del personaje 2D.

21. 3D ENGINE

Debe generar:

Characters
body;
face;
hands;
feet;
hair;
eyes;
teeth.

Clothing
shirts;
pants;
dresses;
armor;
shoes.

Accessories
weapons;
glasses;
bags;
jewelry;
hats.

Props
furniture;
vehicles;
tools;
objects.

Environments
cities;
castles;
buildings;
interiors;
nature;
landscapes.

22. 3D QUALITY

Pipeline:

```
MESH
 ↓
TOPOLOGY QA
 ↓
NORMAL QA
 ↓
UV QA
 ↓
MATERIAL QA
 ↓
DEFORMATION QA
 ↓
OPTIMIZATION
```

Generar LODs.

23. BLENDER

Blender será el backend principal para 3D.

Debe poder ser controlado automáticamente para:
importar;
exportar;
modelar;
modificar;
retopologizar;
crear materiales;
crear rigs;
crear cámaras;
animar;
renderizar.

24. BODY RIG

Crear rigging automático.

Debe incluir:
spine;
arms;
legs;
hands;
fingers;
feet;
IK/FK;
controls.

Debe validar deformaciones.

25. FACIAL RIG

Debe incluir:
eyes;
pupils;
eyelids;
eyebrows;
nose;
cheeks;
mouth;
jaw;
tongue.

Utilizar:
bones;
shape keys;
blendshapes;
procedural controls.

Debe permitir:
HAPPY
SAD
ANGRY
FEAR
SURPRISE
DISGUST
CUSTOM

26. LIP SYNC

Pipeline:

```
TEXT
 ↓
PHONEMES
 ↓
TIMING
 ↓
MOUTH SHAPES
 ↓
FACIAL ANIMATION
```

También debe soportar audio → lip-sync.

27. CLOTHING

Crear sistema de:
fitting;
cloth simulation;
collisions;
layering;
materials;
deformation;
variants.

La ropa no debe destruir el rig del personaje.

28. ACCESSORY SYSTEM

Los accesorios deben ser assets independientes.

Debe existir:

```
SOCKET
 ↓
BONE
 ↓
ACCESSORY
```

29. ANIMATION ENGINE

Integrar:
Blender;
Wan 2.2;
procedural animation;
mocap cuando esté disponible;
keyframes.

Soportar:
walking;
running;
combat;
gestures;
facial expressions;
custom motion.

30. CAMERA SYSTEM

Crear un editor visual.
El usuario podrá dibujar:

```
START ●───────────────→● END
```

El sistema convierte eso en:

```
CAMERA PATH
 ↓
3D CAMERA
 ↓
KEYFRAMES
 ↓
BLENDER
 ↓
VIDEO MODEL CONDITIONING
```

Debe permitir correcciones:
"Rota la cámara 15 grados."
"Haz el movimiento más lento."
"Acerca el plano."

El sistema debe modificar sólo la propiedad afectada.

31. STORYBOARD

Cada shot debe almacenar:

```
SHOT
├── duration
├── camera
├── characters
├── action
├── environment
├── lighting
├── dialogue
├── audio
└── references
```

Debe existir editor visual.

32. VIDEO ENGINE

Integrar Wan 2.2 y otros modelos compatibles.

Debe soportar:
text-to-video;
image-to-video;
reference-based generation;
camera control;
pose control;
temporal consistency.

Crear mecanismos de:
identity preservation;
flicker detection;
temporal QA;
shot consistency.

33. AUDIO ENGINE

Debe soportar:
TTS;
voice cloning;
speaker identification;
diarization;
voice separation;
emotion;
pronunciation;
timing;
mixing.

Utilizar modelos locales apropiados como:
Kokoro;
CosyVoice;
F5-TTS;
otros equivalentes.

34. VOICE INGESTION

Entrada:
audio;
vídeo;
archivo;
URL.

Pipeline:

```
INPUT
 ↓
EXTRACT AUDIO
 ↓
VAD
 ↓
DIARIZATION
 ↓
SEPARATION
 ↓
QUALITY FILTER
 ↓
VOICE A
VOICE B
VOICE C
```

Mostrar al usuario las voces detectadas.
No entrenar ni clonar automáticamente sin autorización.

35. MUSIC ENGINE

Integrar un motor musical local de alta calidad, por ejemplo ACE-Step u otra alternativa superior y permisiva encontrada durante la investigación.

Debe soportar:
canciones;
instrumental;
loops;
themes;
variations;
stems;
ambient;
soundtrack.

Debe permitir:

```
CHARACTER
 ↓
THEME
 ↓
SCENE
 ↓
VARIATION
```

36. SFX

Generar:
footsteps;
doors;
impacts;
wind;
rain;
weapons;
environments;
UI.

37. NARRATIVE ENGINE

El LLM debe controlar:
narrativa;
lore;
personajes;
diálogo;
quests;
worldbuilding;
branching;
game state.

Debe consultar memoria antes de generar.

38. WORLD MODEL

Crear:

```
WORLD
├── Geography
├── History
├── Factions
├── Characters
├── Rules
├── Locations
├── Events
└── Lore
```

El sistema debe detectar contradicciones.

39. GAME ENGINE

Integrar:

Godot
Principal para:
2D;
3D;
gameplay;
UI;
physics;
scenes.

Ren'Py
Especializado en:
visual novels;
branching narrative;
dialogue;
sprites.

O3DE
Para proyectos 3D que necesiten capacidades adicionales.

40. GAME GENERATION

Una solicitud como:
"Crea un RPG."

debe producir:

```
PROJECT
├── GAME DESIGN
├── CHARACTERS
├── WORLD
├── LEVELS
├── ASSETS
├── UI
├── QUESTS
├── DIALOGUE
├── AUDIO
├── ANIMATION
├── GAMEPLAY
└── BUILD
```

41. VISUAL NOVEL GENERATOR

Debe producir:
characters;
sprites;
backgrounds;
expressions;
dialogue;
choices;
branching;
music;
voices;
UI.

Exportar proyecto Ren'Py funcional.

42. GAME CODING AGENT

Crear agentes especializados:
GAME DESIGNER
PROGRAMMER
LEVEL DESIGNER
NARRATIVE DESIGNER
3D ARTIST
2D ARTIST
ANIMATOR
AUDIO DESIGNER
UI DESIGNER
QA AGENT

Todos comparten el mismo Project Memory.

43. CODE AGENT

Debe:
escribir;
modificar;
analizar;
ejecutar;
testear;
depurar;
reparar.

Debe crear checkpoints antes de cambios importantes.

44. GAME QA

Debe poder:

```
BUILD
 ↓
LAUNCH
 ↓
AUTOMATED PLAYER
 ↓
NAVIGATE
 ↓
INTERACT
 ↓
SCREENSHOT
 ↓
VISION ANALYSIS
 ↓
LOG ANALYSIS
```

Detectar:
crashes;
broken UI;
inaccessible areas;
collision errors;
missing assets;
broken animations;
logic errors.

45. VISUAL QA

Analizar:
anatomy;
hands;
eyes;
face;
identity;
style;
composition.

46. 3D QA

Analizar:
topology;
normals;
UV;
materials;
rigging;
deformation;
intersections.

47. VIDEO QA

Analizar:
flicker;
temporal consistency;
identity;
anatomy;
camera;
lighting.

48. AUDIO QA

Analizar:
clipping;
noise;
volume;
pronunciation;
timing.

49. AUTOMATIC REPAIR

Todo módulo debe poder entrar en:

```
GENERATE
 ↓
QA
 ↓
FAIL
 ↓
DIAGNOSE
 ↓
REPAIR
 ↓
QA
 ↓
PASS
```

Con máximo configurable de intentos.

50. ASSET GRAPH

Todos los assets deben tener relaciones.

```
CHARACTER
 │
 ├── 2D
 ├── 3D
 ├── CLOTHING
 ├── RIG
 ├── FACE
 ├── ANIMATION
 ├── VOICE
 └── MUSIC
```

Si cambia un asset, identificar dependencias.

51. PARTIAL REGENERATION

Nunca regenerar todo innecesariamente.

Ejemplo:

```
CHARACTER
├── Face ✓
├── Body ✓
├── Hair ✓
├── Clothing ✗
└── Voice ✓
```

Regenerar solamente clothing.

52. VERSION CONTROL

Cada asset debe almacenar:
version;
hash;
model;
seed;
prompt;
workflow;
references;
parameters;
timestamp.

Soportar rollback.

53. PROJECT MEMORY

Crear:
PROJECT MEMORY
CHARACTER MEMORY
WORLD MEMORY
VISUAL MEMORY
ASSET MEMORY
VOICE MEMORY
MUSIC MEMORY
CONVERSATION MEMORY
TECHNICAL MEMORY

54. SEARCH

Implementar:
text search;
semantic search;
visual search;
asset search;
character search;
metadata search.

55. PROVIDER MANAGER

Debe soportar:
múltiples proveedores;
múltiples API keys;
rotation;
health checks;
quotas;
rate limits;
fallback;
provider priority.

Ejemplo:

```
KEY A
 ↓
LOW QUOTA
 ↓
KEY B
 ↓
PROVIDER FAILURE
 ↓
PROVIDER C
```

Nunca bajar automáticamente a un modelo cuya calidad esté por debajo del umbral configurado.

56. MODEL QUALITY GUARD

Definir:
MIN_QUALITY
MIN_CONTEXT
MIN_REASONING
MIN_CAPABILITY

El sistema nunca debe seleccionar un fallback que incumpla estos mínimos salvo autorización explícita.

57. ADMIN / USER

Debe existir:
ADMIN
USER

El administrador controla:
modelos;
proveedores;
herramientas;
límites;
permisos;
recursos;
configuración.

El sistema debe soportar políticas configurables.

58. DASHBOARD

Crear un dashboard completo con:
HOME
PROJECTS
ASSETS
CHARACTERS
2D
3D
ANIMATION
VIDEO
AUDIO
MUSIC
GAMES
VISUAL NOVELS
MODELS
MEMORY
WORKFLOWS
JOBS
QA
GPU
SETTINGS
ADMIN

59. VISUAL EDITOR

Debe incluir:
canvas;
layers;
selection;
masks;
annotations;
arrows;
drawing;
camera paths;
timeline;
inspector;
asset browser.

60. JOB MANAGER

Estados:
QUEUED
PLANNED
WAITING
RUNNING
QA
REPAIR
COMPLETED
FAILED
CANCELLED

Debe soportar:
pause;
resume;
cancel;
retry;
priority.

61. CHECKPOINTS

Si una tarea falla:

```
TASK 1 ✓
TASK 2 ✓
TASK 3 ✓
TASK 4 ✗
```

continuar desde Task 4.
Nunca repetir innecesariamente.

62. STORAGE

Separar:

DATABASE

de:

ASSET STORAGE

Los archivos grandes deben permanecer en almacenamiento de archivos.

63. DATABASE

Modelar correctamente:
Users
Projects
Characters
Assets
Scenes
Models
Jobs
Tasks
Versions
Memories
References
Voices
Audio
Videos
Games
QA
Errors
Providers
Licenses

64. SECURITY

Implementar:
authentication;
authorization;
role-based permissions;
session management;
rate limiting;
audit logs;
secret management;
upload validation;
sandboxing;
process isolation.

65. CODE EXECUTION SECURITY

Como el sistema puede generar código, debe existir un sandbox.
Nunca ejecutar código generado por IA directamente sobre el sistema principal sin controles.

Debe existir:

```
AI CODE
 ↓
SANDBOX
 ↓
TEST
 ↓
VALIDATE
 ↓
APPROVE
 ↓
INTEGRATE
```

66. OFFLINE-FIRST

Siempre que exista una alternativa razonable:

LOCAL > CLOUD

Las APIs externas son fallback/opcionales.
Los assets locales no deben enviarse automáticamente a servicios externos.

67. PRIVACY

El usuario debe saber:
qué datos salen del equipo;
qué modelo los recibe;
qué proveedor los procesa.

68. CACHING

Implementar:
exact cache;
semantic cache;
model cache;
asset cache;
workflow cache;
latent cache.

69. PERFORMANCE

Optimizar:
startup;
inference;
memory;
GPU;
VRAM;
model switching;
disk;
network;
concurrency.

70. OBSERVABILITY

Registrar:
TASK
MODEL
RESOURCE
TIME
VRAM
RAM
RESULT
QA
ERROR
REPAIR

71. FAILURE HANDLING

Nunca ocultar errores.

Cada error debe tener:
ERROR
CAUSE
TASK
MODEL
RESOURCE
LOG
STACK
SUGGESTED FIX
STATUS

72. NO FALSE COMPLETION

Nunca decir:
"implementado"
si únicamente:
existe la UI;
existe el endpoint;
existe el archivo;
existe un mock;
existe un placeholder.

Una funcionalidad está implementada sólo si:

```
CODE
+
INTEGRATION
+
EXECUTION
+
REAL OUTPUT
+
TEST
```

73. FORENSIC AUDIT

Antes de implementar debes producir:
ARCHITECTURE_MAP
FEATURE_MATRIX
DEPENDENCY_MAP
DEAD_CODE_REPORT
MOCK_REPORT
SECURITY_REPORT
LICENSE_REPORT
PERFORMANCE_REPORT
MISSING_FEATURES
BROKEN_FEATURES
PARTIAL_FEATURES
DUPLICATED_FEATURES

74. FEATURE MATRIX

Crear:

Feature | Frontend | Backend | Integration | Real Execution | Tests | Status

Estados:
COMPLETE
PARTIAL
BROKEN
MOCKED
MISSING

75. NO DESTRUCTIVE DEVELOPMENT

Antes de eliminar algo:
identificar;
justificar;
comprobar dependencias;
comprobar si es utilizado;
crear backup/checkpoint;
eliminar sólo si es realmente necesario.

76. TESTING

Crear:
unit tests;
integration tests;
E2E;
regression;
load;
security;
resource;
model compatibility;
UI;
game tests.

77. ACCEPTANCE TESTS

Cada módulo debe tener criterios verificables.

Ejemplo:

```
CREATE CHARACTER
 ↓
GENERATE SHEET
 ↓
GENERATE TURNAROUND
 ↓
GENERATE 3D
 ↓
RIG
 ↓
FACIAL RIG
 ↓
ANIMATE
 ↓
VOICE
 ↓
EXPORT
```

Debe ejecutarse realmente.

78. END-TO-END TEST

Crear al menos un proyecto completo de prueba:

```
IDEA
 ↓
CHARACTER
 ↓
STYLE
 ↓
TURNAROUND
 ↓
3D
 ↓
RIG
 ↓
FACE
 ↓
ANIMATION
 ↓
VOICE
 ↓
MUSIC
 ↓
SCENE
 ↓
CAMERA
 ↓
VIDEO
 ↓
GODOT
 ↓
BUILD
 ↓
QA
 ↓
REPAIR
 ↓
FINAL BUILD
```

79. DASHBOARD ACCEPTANCE

Cada botón visible debe:

```
CLICK
 ↓
REAL ACTION
 ↓
BACKEND
 ↓
PROCESS
 ↓
RESULT
 ↓
UI UPDATE
```

No deben existir botones decorativos.

80. DOCUMENTATION

Generar y mantener:
README.md
ARCHITECTURE.md
INSTALLATION.md
CONFIGURATION.md
MODELS.md
MODEL_REGISTRY.md
LICENSES.md
API.md
MEMORY.md
RAG.md
2D.md
3D.md
RIGGING.md
ANIMATION.md
VIDEO.md
AUDIO.md
MUSIC.md
GAMES.md
VISUAL_NOVELS.md
QA.md
SECURITY.md
TROUBLESHOOTING.md
DEPLOYMENT.md

81. INSTALLER

Crear instalación reproducible.

Detectar:
OS;
GPU;
VRAM;
RAM;
CPU;
drivers;
CUDA;
Python;
Node;
Docker cuando sea necesario.

82. MODEL MANAGER

Desde el dashboard:
INSTALL
UPDATE
REMOVE
ENABLE
DISABLE
QUANTIZE
VERIFY

83. MODEL REGISTRY

Cada modelo:

```
MODEL
├── Version
├── License
├── VRAM
├── RAM
├── Architecture
├── Modality
├── Quantization
├── Capabilities
├── Speed
├── Quality
└── Compatibility
```

84. ADAPTER SYSTEM

Crear adapters:
LLMAdapter
ImageAdapter
VideoAdapter
AudioAdapter
MusicAdapter
BlenderAdapter
GodotAdapter
RenPyAdapter
O3DEAdapter
StorageAdapter
ComputeAdapter

Agregar un nuevo modelo no debe requerir modificar el núcleo.

85. INTERNAL REPRESENTATION

Cuando diferentes herramientas utilicen formatos distintos, crear una representación interna.

```
INTERNAL ASSET
      ↓
ADAPTER
      ↓
TARGET FORMAT
```

Ejemplo:

```
Character
 ↓
Internal Character Representation
 ├── Blender
 ├── Godot
 ├── Ren'Py
 └── O3DE
```

86. EXPORT

Soportar, cuando corresponda:
PNG
JPG
WEBP
EXR
GLB
FBX
OBJ
USD
BLEND
WAV
FLAC
MP3
MP4
WEBM
GODOT PROJECT
REN'PY PROJECT
O3DE PROJECT

87. QUALITY SCORE

Cada asset debe recibir scores.

Ejemplo:

```
IDENTITY      94
ANATOMY       91
STYLE         97
COMPOSITION   95
GEOMETRY      89
TEXTURE       93
RIG           96
ANIMATION     90
AUDIO         95
```

Definir umbrales configurables.

88. AI SELF-EVALUATION

La IA no debe ser la única evaluadora.

Siempre que sea posible combinar:
MODEL EVALUATION
+
ALGORITHMIC VALIDATION
+
RULES
+
TESTS
+
VISION QA
+
USER FEEDBACK

89. HUMAN-IN-THE-LOOP

Permitir:
AUTO
ASSISTED
MANUAL

El usuario puede intervenir en cualquier fase.

90. EDITABLE CREATIVE GRAPH

El usuario debe poder modificar:
CHARACTER
STYLE
POSE
CAMERA
LIGHTING
AUDIO
MUSIC
ENVIRONMENT

sin destruir las demás partes.

91. PROJECT REPRODUCIBILITY

Debe poder reconstruirse un resultado utilizando:
PROMPT
MODEL
VERSION
SEED
PARAMETERS
REFERENCES
WORKFLOW
ASSETS

92. FUTURE-PROOFING

No acoplar el sistema a:
un LLM;
un generador de imágenes;
un TTS;
un modelo de vídeo;
un motor de juegos.

Todos deben ser intercambiables.

93. FASES DE IMPLEMENTACIÓN

PHASE 0
Forensic audit.

PHASE 1
Core + Orchestrator.

PHASE 2
Database + Storage + Project System.

PHASE 3
Memory + RAG + Asset Graph.

PHASE 4
Model Registry + Router + Resource Manager.

PHASE 5
Image + Style Engine.

PHASE 6
Character + Character Consistency.

PHASE 7
2D → 3D.

PHASE 8
Blender + 3D Asset Engine.

PHASE 9
Body Rig + Facial Rig + Clothing.

PHASE 10
Animation + Camera + Storyboard.

PHASE 11
Wan 2.2 + Video.

PHASE 12
TTS + Voice Cloning + Diarization + Separation.

PHASE 13
Music + SFX.

PHASE 14
Narrative + World Model.

PHASE 15
Godot.

PHASE 16
Ren'Py.

PHASE 17
O3DE.

PHASE 18
Game Agents.

PHASE 19
QA.

PHASE 20
Automatic Repair.

PHASE 21
Dashboard.

PHASE 22
Remote Compute.

PHASE 23
Security.

PHASE 24
Performance.

PHASE 25
Final E2E.

94. REGLA DE CADA FASE

Cada fase debe seguir:

```
RESEARCH
 ↓
DESIGN
 ↓
IMPLEMENT
 ↓
UNIT TEST
 ↓
INTEGRATION TEST
 ↓
REAL EXECUTION
 ↓
QA
 ↓
DOCUMENTATION
 ↓
REGRESSION TEST
```

No avanzar si una dependencia crítica está rota.

95. FINAL AUDIT

Al finalizar:
FORENSIC AUDIT
+
SECURITY AUDIT
+
LICENSE AUDIT
+
PERFORMANCE AUDIT
+
INTEGRATION AUDIT
+
E2E AUDIT

Crear un informe:
COMPLETE
PARTIAL
BROKEN
MISSING
DEBT
RISKS
RECOMMENDATIONS

No ocultar problemas.

96. DEFINICIÓN REAL DE "TERMINADO"

El sistema sólo estará terminado cuando pueda demostrar:

```
FEATURE
 ↓
IMPLEMENTATION
 ↓
INTEGRATION
 ↓
EXECUTION
 ↓
OUTPUT
 ↓
QA
 ↓
DOCUMENTATION
```

La existencia de código no demuestra funcionalidad.
La existencia de una interfaz no demuestra funcionalidad.
La existencia de un endpoint no demuestra funcionalidad.
Sólo una ejecución real validada demuestra funcionalidad.

97. REGLAS ABSOLUTAS

NO:
MVP;
demo;
placeholders;
mocks en producción;
fake APIs;
fake outputs;
botones sin función;
endpoints desconectados;
dependencias innecesarias;
microservicios innecesarios;
vendor lock-in;
asumir que Open Source significa libre uso comercial;
afirmar que algo funciona sin probarlo.

SÍ:
arquitectura modular;
integración real;
ejecución local;
herramientas abiertas/permisivas;
bajo consumo;
alta calidad;
caching;
RAG;
memoria;
adapters;
fallback;
checkpoints;
QA;
auto-repair;
versionado;
reproducibilidad;
documentación.

98. PRIORIDAD DE CALIDAD

Cuando haya conflicto:

CORRECTNESS
    >
RELIABILITY
    >
SECURITY
    >
QUALITY
    >
RESOURCE EFFICIENCY
    >
SPEED

Pero el sistema debe buscar simultáneamente el mejor equilibrio posible.

99. PRINCIPIO FINAL

No construyas simplemente una aplicación que "llame modelos".

Construye un sistema que:

```
UNDERSTANDS
      ↓
REMEMBERS
      ↓
PLANS
      ↓
SELECTS
      ↓
CREATES
      ↓
EVALUATES
      ↓
REPAIRS
      ↓
LEARNS FROM PROJECT STATE
      ↓
VERSION CONTROLS
      ↓
DELIVERS
```

El resultado final debe sentirse como un único entorno creativo inteligente, aunque internamente utilice múltiples proyectos y modelos especializados.

100. FLUJO MAESTRO FINAL

```
                        ┌────────────────────┐
                         │       USER         │
                         └─────────┬──────────┘
                                   │
                                   ▼
                     ┌────────────────────────┐
                     │    CREATIVE DASHBOARD  │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │    INTENT ANALYZER     │
                     └────────────┬───────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 MEMORY         RAG          PROJECT
                    │             │           STATE
                    └─────────────┼─────────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │   CREATIVE PLANNER     │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │   CREATIVE COMPILER     │
                     └────────────┬───────────┘
                                  │
                                  ▼
                           ┌────────────┐
                           │ TASK GRAPH │
                           └─────┬──────┘
                                 │
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
             IMAGE              3D              AUDIO
                │                │                │
          SD / FLUX          BLENDER        TTS / VOICE
          QWEN IMAGE         2D→3D           MUSIC / SFX
                │                │                │
                │          RIGGING               │
                │          CLOTHING              │
                │          FACE                   │
                └────────────────┼────────────────┘
                                 │
                                 ▼
                           ANIMATION
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
                  BLENDER                 WAN 2.2
                     │                       │
                     └───────────┬───────────┘
                                 ▼
                              VIDEO
                                 │
                                 ▼
                         NARRATIVE ENGINE
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     GAME ENGINES      │
                     │                       │
                     │ Godot │ Ren'Py │ O3DE│
                     └───────────┬───────────┘
                                 ▼
                               BUILD
                                 │
                                 ▼
                          AUTOMATED QA
                                 │
                         ┌───────┴───────┐
                         ▼               ▼
                       PASS             FAIL
                         │               │
                         │          DIAGNOSIS
                         │               │
                         │            REPAIR
                         │               │
                         │               ▼
                         │              QA
                         │               │
                         └───────┬───────┘
                                 ▼
                           ASSET GRAPH
                                 │
                                 ▼
                          VERSION CONTROL
                                 │
                                 ▼
                           FINAL PROJECT
                                 │
                   ┌─────────────┼─────────────┐
                   ▼             ▼             ▼
                 GAME       VISUAL NOVEL    CINEMATIC
```

INSTRUCCIÓN FINAL

Comienza por la FASE 0 — FORENSIC AUDIT.
No empieces a programar inmediatamente.
Primero inspecciona, investiga, comprende y documenta.
Después presenta:
arquitectura actual;
arquitectura objetivo;
funcionalidades existentes;
funcionalidades parciales;
funcionalidades rotas;
funcionalidades simuladas;
funcionalidades faltantes;
dependencias;
herramientas externas recomendadas;
alternativas;
licencias;
requisitos de hardware;
riesgos;
plan de implementación;
orden exacto de ejecución.
Después comienza la implementación por fases.
No declares una fase terminada hasta demostrar mediante pruebas reales que funciona.
