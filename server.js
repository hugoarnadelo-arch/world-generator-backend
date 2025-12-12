import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateWorldSheet(selections) {
  const prompt = `
Eres un científico planetario para 1º ESO.
Con estas elecciones: ${JSON.stringify(selections)}
Devuelve JSON con:
- world_name (string)
- summary (3-5 líneas)
- key_conditions (array de 8-12 bullets sobre geosfera/atmósfera/hidrosfera)
- life_constraints (array de 8-12 bullets: qué limita/favorece la vida)
- likely_ecosystems (array de 5-8 ejemplos)
- species_design_hints (array de 8-12 ideas de adaptaciones plausibles)
`;

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const text = resp.output_text ?? "";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    return {
      world_name: "Mundo",
      summary: text,
      key_conditions: [],
      life_constraints: [],
      likely_ecosystems: [],
      species_design_hints: []
    };
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

function buildImagePrompt(sheet) {
  return `Hyperrealistic concept art of an exoplanet surface. Cinematic wide angle. No text. No humans. Show geology and water clearly. Atmosphere color and light match the star. World name: ${sheet.world_name}. Key cues: ${(sheet.key_conditions || []).slice(0, 8).join("; ")}.`;
}

app.post("/api/generate", async (req, res) => {
  try {
    const selections = req.body?.selections;
    if (!selections) return res.status(400).json({ error: "Missing selections" });

    const sheet = await generateWorldSheet(selections);
    const imagePrompt = buildImagePrompt(sheet);

    const img = await client.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt
    });

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: "No image returned" });

    res.json({ sheet, imagePrompt, b64 });
  } catch (e) {
    res.status(500).json({ error: "Generation failed" });
  }
});

app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000, () => console.log("Server running"));
