# Principios de desarrollo de Agentes - Sanctum

## 1. Principio Rector de Arquitectura
> **"Recolección barata y determinista. Procesamiento caro y puntual."**
- Los agentes NO deben explorar directorios, buscar archivos ni llamar a APIs externas para "recolectar" contexto por su cuenta.
- Toda la recolección de contexto debe realizarse de forma determinista antes de invocar al modelo (por el runtime o bot).
- Si al agente le falta información para tomar una decisión, debe detenerse y declararlo en su respuesta en lugar de intentar buscarla de forma autónoma.

## 2. Reglas de TypeScript Estricto
- **TS Estricto**: Configuración de `tsconfig` con `strict: true`, `noImplicitAny: true`.
- **Cero 'any'**: No usar el tipo `any` en firmas de funciones ni variables. Si un tipo es desconocido, usar `unknown`. No usar `@ts-ignore` o `@ts-expect-error` a menos que sea documentado y justificado.
- **Un archivo, una responsabilidad**: Mantener los módulos pequeños y enfocados (e.g., `loadAgentConfig`, `collectContext`).
- **Interfaces explícitas**: Toda estructura de datos importante (config, contexto, respuesta del modelo, acciones) debe tener una interfaz TypeScript explícita y exportada.

## 3. Proceso del Agente (Chain-of-Thought)
Todo prompt del sistema inyectado en el modelo debe obligar a una salida estructurada que contenga el razonamiento en un proceso de 4 pasos:
1. **Leer y Entender**: Analizar los datos provistos en el contexto de entrada.
2. **Identificar**: Encontrar qué tareas requieren acción y descartar las que ya están resueltas.
3. **Decidir**: Determinar exactamente qué acciones se deben ejecutar y justificar por qué, respetando el límite `max_actions`.
4. **Ejecutar**: Generar el payload estructurado JSON con las acciones.

## 4. Una sola llamada al modelo por ejecución
- El runtime del agente (`agent-runtime`) debe realizar **exactamente una única llamada** al modelo de lenguaje por ejecución.
- No se permiten bucles de feedback de agente interactivo (donde el agente llama al modelo, ejecuta una acción, y vuelve a llamar al modelo con el resultado) en este sprint. La ejecución es lineal: Cargar config → Recolectar Contexto → Prompt → Modelo → Ejecutar Acciones.

## 5. Control de Acceso y Contexto
- El agente solo puede leer contenido de las carpetas y tags configurados en su frontmatter (`allowed_folders`, `allowed_tags`).
- Cualquier intento de acceder o requerir información fuera de estas rutas debe resultar en una acción `none` con el motivo reportado en la respuesta.
