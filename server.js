import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS abierto (para Moodle / HTML local / Google Sites, etc.)
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));

// Parser JSON
app.use(express.json({ limit: "1mb" }));

// Si llega JSON malformado, devolvemos 400 en JSON (no HTML)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      error: "invalid_json",
      message: "El cuerpo de la petición no es JSON válido."
    });
  }
  next();
});

app.get("/health", (req, res) => res.json({ ok: true }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildWorldPrompt(choices, options = {}) {
  const lang = options.language || "es";
  return `
Eres un generador científico-educativo para 1º ESO.

Devuelve un JSON válido con este esquema EXACTO:

{
  "worldName": "...",
  "worldSummary": "...",
  "parameters": {
    "star": "...",
    "orbit": "...",
    "temperature": "...",
    "atmosphere": "...",
    "water": "...",
    "gravity": "...",
    "radiation": "...",
    "geology": "..."
  },
  "ecosystem": {
    "biomes": ["...","...","..."],
    "foodWebHint": "..."
  },
  "lifeHints": {
    "likelyKingdoms": ["Animalia","Plantae","Fungi","Protista","Monera"],
    "constraints": ["...","...","..."],
    "adaptationIdeas": ["...","...","..."]
  },
  "exampleSpecies": [
    { "commonName": "...", "scientificName": "Genus species", "kingdom": "...", "role": "..." },
    { "commonName": "...", "scientificName": "Genus species", "kingdom": "...", "role": "..." }
  ],
  "ecosystemImagePrompt": "...",
  "worldImagePrompt": "..."
}

Reglas:
- Todo coherente con los parámetros.
- En "lifeHints.likelyKingdoms" elige 2–4 reinos más probables según el mundo.
- "constraints": limitaciones claras para diseñar especies (poca luz, poco O2, alta radiación, etc.)
- "adaptationIdeas": ideas directas para 1º ESO (bioluminiscencia, cutícula, simbiosis, nictinastia...)

Idioma: ${lang}

Opciones elegidas por el alumnado:
${JSON.stringify(choices, null, 2)}
`.trim();
}

async function generateWorldData(choices, options) {
  const prompt = buildWorldPrompt(choices, options);

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const text = resp.output_text || "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("El modelo no devolvió un JSON reconocible.");
  }
  const jsonText = text.slice(start, end + 1);
  return JSON.parse(jsonText);
}

app.post("/api/generate-world", async (req, res) => {
  try {
    const { choices, options } = req.body || {};
    if (!choices || typeof choices !== "object") {
      return res.status(400).json({
        error: "missing_choices",
        message: "Falta 'choices' (objeto) en el body JSON."
      });
    }

    const data = await generateWorldData(choices, options);

    // (Opcional) aquí podrías generar imágenes con API si quisieras,
    // pero para aula es mejor devolver prompts y generar imágenes aparte.
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Server error"
    });
  }
});

const port = process.env.PORT || 10000;
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => console.log("Server running on port", port));

