// Simple OpenAI → NVIDIA NIM Proxy

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const NIM_API_BASE = "https://integrate.api.nvidia.com/v1";
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🔥 Conservamos tu mapping
const MODEL_MAPPING = {
  "gpt-3.5-turbo": "moonshotai/kimi-k2.5",
  "gpt-4": "deepseek-ai/deepseek-v3.2",
  "gpt-4-turbo": "deepseek-ai/deepseek-v3.1-terminus",
  "gpt-4o": "deepseek-ai/deepseek-v3.1",
  "claude-3-opus": "z-ai/glm4.7",
  "claude-3-sonnet": "z-ai/glm5",
  "gemini-pro": "qwen/qwen3-next-80b-a3b-thinking"
};

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🔥 ÚNICO ENDPOINT QUE NOS IMPORTA
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { model, messages, temperature, max_tokens, stream } = req.body;

    if (!model || !messages) {
      return res.status(400).json({
        error: {
          message: "Missing model or messages",
          type: "invalid_request_error",
          code: 400
        }
      });
    }

    const nimModel = MODEL_MAPPING[model] || model;

    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
      stream: false
    };

    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      nimRequest,
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Transformar a formato OpenAI
    const openaiResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: response.data.choices.map((choice, index) => ({
        index,
        message: {
          role: choice.message.role,
          content: choice.message.content
        },
        finish_reason: choice.finish_reason || "stop"
      })),
      usage: response.data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    res.json(openaiResponse);

  } catch (error) {
    console.error("Proxy error:", error.response?.data || error.message);

    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.error?.message || error.message,
        type: "invalid_request_error",
        code: error.response?.status || 500
      }
    });
  }
});

// Root simple response (evita 404 en pruebas)
app.get("/", (req, res) => {
  res.send("NIM Proxy Running");
});

// Permitir POST en raíz para compatibilidad total
app.post("/", async (req, res) => {
  req.url = "/v1/chat/completions";
  app._router.handle(req, res);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
