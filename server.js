import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => res.send("OK"));

app.post("/api/generate-world", async (req, res) => {
  try {
    const { choices = {}, generateImages = { ecosystem: false, species: false } } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Render Environment Variables" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
Eres un generador de "planetas educativos" para 1º ESO.
Devuelve SOLO JSON válido (sin markdown).
Coherencia causa-efecto clara a nivel escolar.

Estructura obligatoria:
{
  "world": { "name","star","orbit","size","gravity","dayLength","yearLength","tempRange","water","atmosphere","geosphere","hazards" },
  "ecosystem": { "biomes":[...], "foodWebHints":[...], "dominantProducers":[...], "keyConstraints":[...], "recommendedKingdoms":[...] },
  "speciesDesignTips": { "mustHave":[...], "niceToHave":[...], "hardLimits":[...], "exampleNiches":[...] },
  "prompts": { "worldImagePrompt","ecosystemImagePrompt","speciesImagePrompt" }
}
`.trim();

    const user = `
Decisiones del alumnado (choices) en JSON:
${JSON.stringify(choices, null, 2)}

Genera un mundo coherente (geosfera, atmósfera, hidrosfera),
luego deriva ecosistemas plausibles y pistas para diseñar una especie adaptada.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const payload = JSON.parse(completion.choices[0].message.content);

    // IMPORTANTE: imágenes desactivadas por defecto para evitar costes
    res.json(payload);
  } catch (e) {
    const msg = e?.message || "Unknown error";
    res.status(500).json({ error: "server_error", message: msg });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

