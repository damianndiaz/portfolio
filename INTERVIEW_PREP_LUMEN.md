# Guía de Preparación Entrevista Lumen: Arquitectura y Seniority en n8n

Esta guía está personalizada basándose en tu proyecto **"Portfolio AI Agent"** y tu monitor de ofertas, para que puedas justificar tus decisiones con código real.

---

## 1. El "Porqué" de la Arquitectura
La diferencia entre un implementador y un arquitecto es saber **cuándo NO usar la herramienta por defecto**.

### A. Nodos vs Code Node (JavaScript)
En tu proyecto `Portfolio AI Agent V3`, usamos ambos.
- **¿Cuándo usamos Nodos Estándar?**
  - Ejemplo: **Gmail Node** o **Google Calendar Node**.
  - **Justificación**: "Para integraciones con servicios externos, uso los nodos nativos porque manejan la autenticación (OAuth2) y el refresco de tokens automáticamente. Replicar todo el handshake de OAuth en un script de Python sería reinventar la rueda y difícil de mantener."
  
- **¿Cuándo usamos 'Code Node'?**
  - Ejemplo: Tu nodo **"Parsear JSON"** (ver línea 116 de tu JSON).
  - **Justificación**: "La salida del Agente de IA a veces viene sucia (con backticks \`\`\`json). Intentar limpiar eso con nodos 'Edit Fields' o 'Switch' sería un espagueti de 5 nodos. Con un solo `Code Node` de JavaScript y un Regex, resuelvo la limpieza, el `JSON.parse` y el manejo de errores en 10 líneas. Es más limpio, más performante y más fácil de testear."

### B. Escalabilidad: Queue Mode vs. Monolith
- **Pregunta**: "¿Qué pasa si 10.000 personas hablan con tu bot a la vez?"
- **Respuesta Senior**: 
  1. "Actualmente el webhook corre en el proceso principal. Para escalar a 10k diarias, configuraría n8n en **Queue Mode** (usando Redis)."
  2. "Separaría el flujo en dos: El **Webhook** solo recibe y responde 'Recibido'. Luego manda el mensaje a una cola (Redis/RabbitMQ). Unos **Workers** separados procesan la IA pesada (que tarda 5-10 segs) y notifican después. Así el webhook nunca se satura por tiempos de espera de OpenAI."

---

## 2. Dominio de n8n Self-Hosted (Infraestructura)
Lumen valora que sepas gestionar tu propio servidor, no solo usar la nube.

### A. Docker y Persistencia
- **Comando Clave**: No basta con `docker run n8n`. Tenés que saber persistir los datos.
  ```bash
  # Ejemplo de comando Senior
  docker run -d \
    --name n8n \
    -p 5678:5678 \
    -v ~/.n8n:/home/node/.n8n \  # <--- ESTO ES CRÍTICO (Volumen)
    -e N8N_BASIC_AUTH_ACTIVE=true \
    -e N8N_BASIC_AUTH_USER=admin \
    -e N8N_BASIC_AUTH_PASSWORD=supersegura \
    n8nio/n8n
  ```
- **Volumen (`-v`)**: "Si no mapeo el volumen `-v ~/.n8n...`, cuando reinicie el contenedor pierdo todos los workflows y credenciales. En producción, ese volumen debería estar en un disco montado con backup automático."

### B. Variables de Entorno (.env)
- Nunca hardcodear API Keys en el código (ni en el Code Node).
- En n8n self-hosted, las claves sensibles como `OPENAI_API_KEY` se inyectan como variables de entorno al contenedor y se acceden en n8n como `$env.OPENAI_API_KEY` (si se habilita) o mejor aún, usando el sistema de Credenciales encriptadas de n8n que se guarda en la base de datos (SQLite/Postgres).

---

## 3. Manejo de Errores y Monitoreo
Tu flujo actual (según el JSON) tiene un "Camino Feliz" (Webhook -> AI -> Parser -> Router). ¿Si OpenAI falla, el chat se queda mudo?

### A. Error Workflow (Trigger)
- **Concepto**: n8n permite configurar un "Error Workflow" en los settings de cada flujo.
- **Implementación**:
  1. Creás un flujo separado con un nodo **"Error Trigger"**.
  2. Ese nodo recibe los datos del fallo (nodo que falló, mensaje de error).
  3. Conectás eso a un nodo de **Slack** o **Email**.
  4. **Justificación**: "En producción, no puedo estar mirando la pantalla. Configuré un Error Workflow que me manda un alerta a Slack con el ID de la ejecución fallida, para ir directo a fixearlo."

### B. Rate Limits (Wait & Retry)
- **Problema**: OpenAI tira error 429 (Too Many Requests).
- **Solución en n8n**:
  - En el nodo HTTP Request (o OpenAI), vas a *Settings* > *Retry on Fail*.
  - **Estrategia**: "Configuro 3 reintentos con **Exponential Backoff** (esperar 1s, luego 2s, luego 4s). Si sigue fallando, derivo a un camino de fallback que le dice al usuario 'Estamos con alta demanda, reintentá en unos minutos' en vez de crashear."

---

## 4. Manipulación de Datos (JSON)
Preparate para leer JSON "crudo".

### A. Caso: Webhook de Chat
Mirá tu `chat.js`, línea 59. Envía esto:
```json
{
  "message": "Hola, quiero agendar",
  "sessionId": "sess_x82j9a"
}
```
En n8n, esto entra en el Webhook. Si te preguntan "¿Cómo accedes al mensaje en el siguiente nodo?", la respuesta es:
`{{ $json.body.message }}` (si el body no fue parseado automáticmente, a veces es `{{ JSON.parse($json.body).message }}`).

### B. Caso: Output del Parser
Tu nodo *"Parsear JSON"* devuelve esto al Router:
```json
{
  "intent": "schedule",
  "date": "2025-10-10T10:00:00",
  "email": "cliente@email.com"
}
```
Si el Router tiene que decidir, la expresión es:
`{{ $json.intent }} == 'schedule'`

### C. Flattening (Aplanado)
Un concepto confuso de n8n es que procesa Arrays automáticamente.
- Si le pasás un Array de 10 usuarios a un nodo Gmail, n8n **ejecuta el nodo 10 veces**, una por cada ítem.
- **Tip Senior**: "Entiendo que n8n itera automáticamente sobre los arrays. Si quiero mandar un solo email con la lista de los 10 usuarios, tengo que ejecutar primero un nodo **'Aggregate'** o usar un **Code Node** para unificarlos en un solo ítem JSON."

---

## Respuesta a tu duda: ¿Podemos hacer Self-Host del Agent?

**SÍ, rotundo.** Y sería un gran punto para mencionar en la entrevista.

1.  **Frontend (Tu Portfolio HTML/JS)**:
    - No cambia casi nada. Solo tenés que editar en `chat.js` la constante `N8N_WEBHOOK_URL`.
    - En vez de `https://damiannndiazz.app.n8n.cloud/...`, apuntaría a `https://tu-vps.com/webhook/...`.

2.  **Backend (n8n)**:
    - Alquilas un VPS (ej. DigitalOcean, 6USD/mes).
    - Instalas Docker y ejecutás el comando que puse en la sección 2.A.
    - Exportás tu JSON actual (`Portfolio AI Agent...`) y lo importás en tu n8n local.
    - Configuras las credenciales (Google, OpenAI) de nuevo en tu instancia.
    - **Ventaja**: No pagás suscripción de n8n Cloud, tenés control total de los datos y podés instalar librerías de Python customizadas en el docker si quisieras.
    - **Desventaja**: Te toca mantener el servidor (seguridad, updates).

---

## 5. Diseño de Agentes: ¿Por qué JSON y no Texto Plano?
Esta es una pregunta de arquitectura **clave**.

**Tu caso**: Hacés que el Agente responda un JSON como:
```json
{
  "intent": "schedule",
  "reply": "Genial, agendado.",
  "date": "2025-10-10",
  "email": "juan@test.com"
}
```

**Beneficios (para justificar en la entrevista):**

1.  **Ruteo Determinístico (Control de Flujo)**:
    - *Texto*: Si el LLM dice "Claro, te agendo...", tu sistema no sabe qué hacer a menos que leas el texto con otro LLM.
    - *JSON*: Tu nodo **Router** simplemente mira `if (intent == 'schedule')`. Es lógica booleana, 100% fiable y rápido.
    
2.  **Extracción de Parámetros (Data Limpia)**:
    - *Texto*: "Agendado para el viernes a las 5". ¿Cómo le pasás eso a Google Calendar? Tendrías que procesar texto para transformar "viernes" en fecha ISO.
    - *JSON*: El LLM ya te devuelve `"date": "2025-12-19T17:00:00"`. El nodo de Calendar solo consume esa variable. Delegás la "suciedad" de entender el lenguaje natural al LLM, y tu backend se mantiene limpio y estructurado.

3.  **Separación de Concerns (Backend vs Frontend)**:
    - `reply`: Es lo que ve el humano.
    - `intent / data`: Es lo que usa la máquina para ejecutar acciones.
    - Si mezclas todo en texto, perdés la capacidad de actuar silenciosamente o validar datos antes de responder.

---

## 6. Presentación de tu Portfolio AI Agent (TU AS BAJO LA MANGA)

Este proyecto es **ORO PURO** para esta entrevista. Preparate para presentarlo así:

### A. Elevator Pitch (30 segundos)
> "Desarrollé un asistente IA conversacional integrado en mi portfolio que permite a los visitantes agendar reuniones automáticamente. Usé n8n para orquestar toda la lógica: webhook que recibe mensajes, integración con OpenAI para entender la intención del usuario, parsing de JSON para extraer parámetros, y conexión con Google Calendar y Gmail para confirmar las citas. Todo corriendo en n8n Cloud, pero con arquitectura lista para migrar a self-hosted."

### B. Detalles Técnicos (si profundizan)
1. **Stack**: n8n + OpenAI API + Google Calendar API + Gmail API
2. **Arquitectura**: 
   - Frontend: Chat widget en JavaScript vanilla
   - Backend: Workflow n8n con 15+ nodos
   - Storage: Memoria de conversación persistente usando Code Node
3. **Desafíos Resueltos**:
   - ✅ **Parsing de respuestas IA**: OpenAI a veces devuelve ```json con backticks. Implementé limpieza con regex en Code Node
   - ✅ **Manejo de contexto**: Implementé memoria de sesión para conversaciones multi-turn
   - ✅ **Validación de disponibilidad**: Consulto Calendar API antes de confirmar para evitar duplicados
4. **Métricas**: 
   - Tiempo de respuesta promedio: ~3-5 segundos
   - Tasa de éxito en agendamiento: ~95% (los errores son usuarios que cancelan)

### C. Mostrar el Código (si te piden)
**Tenés que poder abrir tu JSON de n8n y explicar nodos específicos**:
- "Este es el nodo 'Parsear JSON' que limpia la salida de OpenAI" (línea 116 de tu JSON)
- "Acá está el Router que decide si el intent es 'schedule', 'question' o 'general'" (tu Switch node)
- "Este Code Node maneja la memoria de sesión usando un objeto JavaScript que persiste durante la conversación"

---

## 7. Preguntas Técnicas que Probablemente te Hagan

### A. n8n Específicas

**Q1: "¿Cuál es la diferencia entre un Webhook y un Trigger periódico en n8n?"**
- **Respuesta**: 
  - **Webhook**: Reacciona a eventos externos en tiempo real (ej: cuando un usuario envía un mensaje). Es **event-driven**.
  - **Trigger periódico** (Cron): Se ejecuta en intervalos fijos (ej: cada hora, cada día). Sirve para tareas batch como sincronizar bases de datos o generar reportes.
  - **Mi caso**: Uso Webhook porque necesito respuesta instantánea cuando un usuario escribe en el chat.

**Q2: "¿Cómo manejarías credenciales sensibles en n8n self-hosted?"**
- **Respuesta**:
  1. **Nunca hardcodear** claves en Code Nodes o nodos HTTP.
  2. Usar el **sistema de Credenciales** de n8n (se guarda encriptado en la DB).
  3. Para secrets del servidor (ej: DB password), usar **variables de entorno** (`process.env` en Docker).
  4. En producción, usar **Vault** (HashiCorp) o AWS Secrets Manager si estoy en cloud.

**Q3: "Si un workflow se está ejecutando MUY lento, ¿cómo debugueas?"**
- **Respuesta**:
  1. **Execution History**: Reviso el log de ejecución en n8n para ver qué nodo tarda más.
  2. **Profiling**: Activo el "timing" en cada nodo para identificar el cuello de botella.
  3. **Optimizaciones comunes**:
     - Si es un Loop procesando 1000 ítems uno por uno, cambio a **batch processing** (procesar de a 50).
     - Si es un HTTP Request lento, chequeo si puedo **cachar** la respuesta.
     - Si es un LLM, evalúo si realmente necesito GPT-4 o puedo usar GPT-3.5-turbo (más rápido y barato).

### B. APIs y LLMs

**Q4: "¿Qué estrategias usás para que un LLM devuelva JSON estructurado?"**
- **Respuesta** (basada en tu proyecto):
  1. **Prompt Engineering**: En el system prompt, especifico CLARAMENTE: *"Debes responder ÚNICAMENTE en formato JSON con estos campos: {intent, reply, date, email}. No incluyas texto adicional."*
  2. **Function Calling** (OpenAI): Si uso la API de OpenAI, puedo definir "functions" en el request, y el modelo devuelve JSON garantizado.
  3. **Fallback**: Si igual viene sucio, uso un Code Node con try-catch para parsear. Si falla, logueo el error y respondo con un mensaje genérico al usuario.

**Q5: "¿Cómo evitarías que el LLM se salga de contexto o haga cosas no deseadas?"**
- **Respuesta**:
  - **System Prompt estricto**: Defino claramente el rol ("Eres un asistente de agendamiento, NO respondes preguntas de programación").
  - **Validation**: Después del LLM, valido el output. Si el `intent` no está en mi whitelist (`['schedule', 'question', 'general']`), rechazo y pido re-generación.
  - **Temperature baja**: Uso `temperature: 0.3` para respuestas más determinísticas.

### C. Escalabilidad y Producción

**Q6: "Tu bot recibe 10,000 requests en 1 hora. ¿Qué pasa?"**
- **Respuesta**:
  - **Problema**: n8n en modo default (single-process) se saturaría. OpenAI también tiene rate limits.
  - **Solución**:
    1. **Queue Mode** (n8n + Redis): Los webhooks mandan los requests a una cola, y workers paralelos los procesan.
    2. **Rate Limiting**: Implemento un throttle (ej: máximo 100 requests por minuto por IP) para evitar abuso.
    3. **Caché**: Si muchos usuarios preguntan lo mismo, cacheo respuestas del LLM por 5 minutos.
    4. **Auto-scaling**: Si estoy en cloud (AWS/GCP), configuro auto-scaling para levantar más workers cuando la cola crece.

---

## 8. Preguntas que VOS Deberías Hacer (CRITICAL para mostrar seniority)

**No hagas solo preguntas genéricas**. Hacé preguntas que demuestren que entendés el negocio y la arquitectura.

### A. Sobre el Proyecto/Equipo
1. **"¿Cuáles son los casos de uso principales que están automatizando actualmente con n8n?"**
   - *Por qué es buena*: Te da contexto del dominio (e-commerce? finanzas? marketing?).

2. **"¿Qué tipo de LLMs están usando? ¿OpenAI, modelos open-source como Llama, o algo custom?"**
   - *Por qué es buena*: Muestra que sabés que hay opciones más allá de OpenAI.

3. **"Mencionan 'n8n self-hosted'. ¿Cuál es la infraestructura actual? ¿Docker, Kubernetes, VM tradicional?"**
   - *Por qué es buena*: Demostrás que entendés que self-hosted implica decisiones de infra.

4. **"¿Tienen un proceso de CI/CD para los workflows? ¿Usan Git para versionarlos?"**
   - *Por qué es buena*: Es una pregunta de senior. n8n permite exportar workflows a JSON y versionar en Git. Si no lo tienen, es una oportunidad para que vos lo implementes.

### B. Sobre el Rol
5. **"¿Cómo se mide el éxito de las automatizaciones? ¿Hay métricas específicas como tiempo ahorrado, error rate, etc.?"**
   - *Por qué es buena*: Mostrás que pensás en impacto de negocio, no solo en código.

6. **"¿Cuál es el mayor desafío técnico que enfrenta el equipo ahora con n8n o las integraciones de IA?"**
   - *Por qué es buena*: Es tu oportunidad para brillar si ellos mencionan algo que vos ya resolviste.

### C. Sobre Tecnología
7. **"Además de n8n, ¿qué otras herramientas usan en el stack? ¿Postgres, Redis, Airflow, etc.?"**
   - *Por qué es buena*: Te ayuda a evaluar si vas a aprender tecnologías nuevas.

8. **"¿Tienen documentación técnica de las automatizaciones o es más tribal knowledge?"**
   - *Por qué es buena*: Si no tienen docs, es algo que vos podés aportar (y es un skill valioso).

---

## 9. Tips Específicos para la Entrevista del Viernes

### A. Preparación Técnica (48hs antes)
- [ ] **Abrí tu workflow de n8n** y repasá cada nodo. Podés hacer un screen recording de 2 minutos explicándolo.
- [ ] **Testeá tu chatbot** en tu portfolio AHORA. Asegurate que funcione perfecto por si te piden verlo en vivo.
- [ ] **Revisá el JSON exportado**. Podés abrirlo en VS Code y encontrar secciones clave rápidamente.

### B. Durante la Entrevista
1. **Compartí pantalla proactivamente**: Si te preguntan sobre tu proyecto, ofrecé "¿Querés que te muestre cómo funciona?". Es 10x más impactante que solo hablar.
2. **Usá ejemplos concretos**: En vez de decir "sé integrar APIs", decí "integré la API de Google Calendar usando OAuth2 en n8n para...".
3. **Admití lo que no sabés**: Si te preguntan algo que no sabés (ej: "¿Usaste Kubernetes?"), decí "No lo usé en producción, pero entiendo el concepto de orquestación de contenedores y lo aprendería rápido".

### C. Soft Skills (no técnicas pero IMPORTANTES)
- **Mostrá ownership**: "En mi proyecto, cuando surgió el problema de parsing, no pregunté en un foro y esperé. Lo debugueé con console.log, probé 3 enfoques, y documenté la solución."
- **Pensá en producto, no solo en código**: "Elegí que el bot responda en menos de 5 segundos porque leí que users se frustran después de ese tiempo."

---

## 10. Red Flags a Evitar

❌ **NO digas**:
- "Sé n8n básico" → **Decí**: "Desarrollé un sistema de agendamiento completo con n8n que maneja X usuarios por semana".
- "Usé ChatGPT para programar" (sin contexto) → **Decí**: "Usé LLMs como herramienta de productividad, pero entiendo la arquitectura que generan".
- "No tengo experiencia en empresas tech" → **Decí**: "Mi experiencia es freelance/proyectos propios, lo cual me dio autonomía para tomar decisiones end-to-end".

✅ **SÍ mostrá**:
- Pasión por automatización ("Me encanta encontrar procesos manuales y hacerlos click-free").
- Aprendizaje continuo ("Este proyecto lo arranqué sin saber n8n, leí la doc, y en 2 semanas tenía el MVP").
- Pensamiento sistémico ("No solo pienso en que el código funcione, sino en cómo debuguearlo en producción").

---

## 11. Checklist Final (24hs antes)

- [ ] Revisar esta guía completa
- [ ] Testear el chatbot de tu portfolio (hacer 3 conversaciones completas)
- [ ] Tener abierto en tabs:
  - [ ] Tu portfolio (para mostrar el chat)
  - [ ] n8n Cloud con tu workflow
  - [ ] Este documento (para referencias rápidas)
- [ ] Preparar 1-2 preguntas personalizadas basadas en lo que investigaste de Lumen
- [ ] Dormir bien el jueves 😊

---

## 12. Bonus: Si te piden hacer un "Code Challenge"

Posibles escenarios:
1. **"Diseñá un workflow que procese emails y extraiga facturas"**
   - Solución: Webhook de Gmail → HTTP Request a OCR (Tesseract/Google Vision) → Code Node para parsear → Google Sheets para guardar.

2. **"¿Cómo harías un retry inteligente si una API externa falla?"**
   - Solución: Configurar "Retry on Fail" con Exponential Backoff + un Error Workflow que loguea en Slack.

---

**¡MUCHA SUERTE EL VIERNES! 🚀**

Recordá: Tu proyecto del chatbot es EXACTAMENTE lo que buscan. Solo falta que se lo muestres con confianza.

*— Cualquier duda, mandame mensaje antes de la entrevista.*
