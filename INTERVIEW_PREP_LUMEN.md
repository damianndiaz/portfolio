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
