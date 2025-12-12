import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.send("OK"));

app.post("/api/generate-world", async (req, res) => {
  try {
    const { choices } = req.body;

    if (!choices) {
      return res.status(400).json({ error: "Missing 'choices' in request body" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment variables" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `Eres un generador de "planetas educativos" para 1º ESO.
Devuelve SOLO JSON válido (sin markdown).
Debe incluir:
- world: { name, star, orbit, size, gravity, dayLength, yearLength, tempRange, water, atmosphere, geosphere, hazards }
- habitability: { overallScore0to100, keyLimits, lifeStrategies }
- prompts: { worldImagePrompt, speciesImagePrompt }
- speciesSeed: { niche, metabolism, respiration, reproduction, adaptations }`;

    const user = `Decisiones del alumnado (choices) en JSON:
${JSON.stringify(choices, null, 2)}
Genera un mundo coherente con geosfera, atmósfera e hidrosfera.
Que sea realista a nivel escolar: relaciones causa-efecto claras.`;

    const worldJson = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const payload = JSON.parse(worldJson.choices[0].message.content);
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));

