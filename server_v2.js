import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try { return { ok: true, data: JSON.parse(text) }; }
  catch { return { ok: false, data: null }; }
}

app.post("/api/generate-world", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: "Falta OPENAI_API_KEY en variables de entorno (Render)." });
    }

    const { choices = {}, options = {} } = req.body || {};
    const generateEcosystemImage = !!options.generateEcosystemImage;
    const generateWorldImage = !!options.generateWorldImage;
    const lang = options.language || "es";

    const system = `
Eres un generador de "planetas educativos" para 1º ESO (España).
Devuelve SOLO JSON válido (sin markdown) con estas claves exactas:

{
  "world": { "name","star","orbit","size","gravity","dayLength","yearLength","tempRange","water","atmosphere","geosphere","hazards" },
  "habitability": { "overallScore0to100","keyLimits","lifeStrategies" },
  "ecosystem": { "headline","biomes","foodWebSketch" },
  "lifeHints": { "probableLife","constraints","recommendedStrategies","teacherNotes" }
