import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

// CORS abierto para que funcione desde Moodle/tu HTML
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// Healthcheck
app.get("/", (_req, res) => res.status(200).send("OK"));

/**
 * POST /api/generate-world
 * Body ejemplo:
 * {
 *   "choices": { "star":"G", "orbit":"habitable-zone", "water":"oceans" },
 *   "includeImages": false
 * }
 */
app.post("/api/generate-world", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Falta OPENAI_API_KEY en variables de entorno (Render → Environment)."
      });
    }

    const body = req.body || {};
    const choices = body.choices || {};
    const includeImages = Boolean(body.includeImages);
    const imageSize = body.imageSize || "1024x1024";

    if (typeof choices !== "object" || Array.isArray(choices)) {
      return res.status(400).json({ error: "`choices` debe ser un objeto JSON." });
    }

    const client = new OpenAI({ apiKey });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
Eres un generador científico para alumnado de 1º ESO (nivel claro, sin tecnicismos innecesarios).
Tu salida DEBE ser JSON válido (sin texto fuera del JSON).

Objetivo: A partir de "choices", crea:
1) Un MUNDO coherente (parámetros físicos básicos).
2) Un ECOSISTEMA del mundo (bioma + limitaciones).
3) PISTAS para diseñar una especie: reinos probables, limitaciones, y 6 ejemplos de especies plausibles (solo como inspiración).
4) PROMPTS para IA: imagen del mundo y del ecosistema (solo naturaleza), y un prompt base para “una especie” (que el alumnado ajustará).

Reglas:
- Todo debe ser causal (si X entonces Y).
- No uses nombres reales de franquicias; sí puedes inventar.
- Mantén la coherencia con luz, temperatura, agua, atmósfera y energía disponible.
- Ejemplos de especies: describe “tipo de organismo” (p. ej. “hongo bioluminiscente”), no “Pokémon”.
- Devuelve claves siempre presentes aunque estén vacías.

Estructura exacta del JSON:
{
  "world": {
    "worldName": "...",
    "starType": "...",
    "orbitZone": "...",
    "avgTempC": number,
    "tempRangeC": [min, max],
    "gravityG": number,
    "dayLengthHours": number,
    "atmosphere": { "mainGases": ["..."], "pressure": "low|medium|high", "oxygenLevel": "low|medium|high", "notes": "..." },
    "water": { "presence": "none|scarce|moderate|abundant", "type": "fresh|salty|mixed", "state": "ice|liquid|mixed|vapor", "notes": "..." },
    "geology": { "relief": "...", "tectonics": "low|medium|high", "volcanism": "low|medium|high", "notes": "..." },
    "hazards": ["..."],
    "lifeLimits": ["...","...","..."]
  },
  "ecosystem": {
    "biomeName": "...",
    "landscape": "...",
    "energyBase": "photosynthesis|chemosynthesis|mixed",
    "keyLimitingFactors": ["..."],
    "trophicRoles": {
      "primaryProducers": ["..."],
      "consumers": ["..."],
      "decomposers": ["..."]
    },
    "foodWebMini": "Texto corto con 1 cadena trófica ejemplo",
    "classroomNotes": "Una frase para 1º ESO"
  },
  "speciesGuidance": {
    "likelyKingdoms": ["Animalia","Plantae","Fungi","Protista","Monera"],
    "designRules": ["...","...","..."],
    "adaptationMenu": ["...","...","...","...","..."],
    "exampleSpeciesIdeas": [
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." },
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." },
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." },
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." },
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." },
      { "name": "...", "kingdom": "...", "nutrition": "...", "2Adaptations": ["...","..."], "whyFits": "..." }
    ]
  },
  "prompts": {
    "worldImagePrompt": "...",
    "ecosystemImagePrompt": "...",
    "speciesImagePromptBase": "..."
  }
}
`.trim();

    const user = `choices = ${JSON.stringify(choices)}`;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 1100,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    let payload;
    try {
      payload = JSON.parse(content);
    } catch {
      payload = { error: "El modelo no devolvió JSON parseable.", raw: content };
    }

    // (Opcional) Generación de imágenes dentro del backend: caro y depende de cuota.
    if (includeImages) {
      payload.images = payload.images || {};
      const ecoPrompt = payload?.prompts?.ecosystemImagePrompt;
      const worldPrompt = payload?.prompts?.worldImagePrompt;

      // OJO: esto consumirá bastante más que texto.
      if (worldPrompt) {
        const img = await client.images.generate({
          model: "gpt-image-1",
          prompt: worldPrompt,
          size: imageSize
        });
        const b64 = img.data?.[0]?.b64_json || null;
        payload.images.world = b64 ? `data:image/png;base64,${b64}` : null;
      }

      if (ecoPrompt) {
        const img = await client.images.generate({
          model: "gpt-image-1",
          prompt: ecoPrompt,
          size: imageSize
        });
        const b64 = img.data?.[0]?.b64_json || null;
        payload.images.ecosystem = b64 ? `data:image/png;base64,${b64}` : null;
      }
    }

    return res.status(200).json(payload);
  } catch (err) {
    const code = err?.code || err?.error?.code;
    const message = err?.message || "Error desconocido";

    // Si es cuota/billing, lo devolvemos “claro” para que no parezca bug del servidor.
    if (code === "insufficient_quota") {
      return res.status(402).json({
        error:
          "OpenAI dice que NO tienes cuota/billing activo (insufficient_quota). Activa facturación o aumenta presupuesto/límites en OpenAI.",
        code
      });
    }

    // Rate limit / demasiadas peticiones
    if (code === "rate_limit_exceeded") {
      return res.status(429).json({
        error:
          "Rate limit de OpenAI (demasiadas peticiones). Reduce frecuencia o implementa reintentos con backoff.",
        code
      });
    }

    return res.status(500).json({ error: message, code });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

