import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.post("/api/generate-world", async (req, res) => {
  try {
    // 1) Validaciones
    const choices = req.body?.choices;
    if (!choices) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Body must be JSON with { choices: {...} }"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Server Misconfigured",
        message: "Missing OPENAI_API_KEY in Render Environment Variables"
      });
    }

    const client = new OpenAI({ apiKey });

    // 2) Prompt
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

    // 3) Llamada a OpenAI (Chat Completions)
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const text = completion?.choices?.[0]?.message?.content;
    if (!text) {
      return res.status(502).json({
        error: "Bad Gateway",
        message: "OpenAI returned empty content"
      });
    }

    // 4) Parse y respuesta
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({
        error: "Bad Gateway",
        message: "OpenAI returned non-JSON despite json_object",
        raw: text
      });
    }

    return res.status(200).json(payload);

  } catch (err) {
    // Respuesta con detalle (clave para no perder más tiempo)
    const status = err?.status || err?.response?.status || 500;
    const message =
      err?.message ||
      err?.response?.data?.error?.message ||
      "Internal error";

    console.error("generate-world error:", err);
    return res.status(status).json({
      error: "OpenAI call failed",
      status,
      message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
