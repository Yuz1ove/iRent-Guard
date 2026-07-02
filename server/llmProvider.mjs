import "./env.mjs";
import OpenAI from "openai";

const PROVIDER_UNCONFIGURED_MESSAGE =
  "AI provider 尚未設定：請設定 SCHOOL_LLM_API_KEY、SCHOOL_LLM_BASE_URL、SCHOOL_LLM_MODEL。";
const PROVIDER_UNAUTHORIZED_MESSAGE =
  "AI provider 驗證失敗：請確認 API key 是否屬於目前設定的 baseURL。第三方中轉 key 不能送到 OpenAI 官方 api.openai.com。";
const VISION_UNSUPPORTED_MESSAGE = "AI provider model 不支援 vision：請將 SCHOOL_LLM_MODEL 設為支援圖片輸入的模型。";
const JSON_PARSE_MESSAGE = "AI 回傳不是合法 JSON：請確認模型支援 JSON 輸出，或稍後重試。";

export function getLlmProviderConfig() {
  const schoolApiKey = readEnv("SCHOOL_LLM_API_KEY");
  const schoolBaseURL = readEnv("SCHOOL_LLM_BASE_URL");
  const schoolModel = readEnv("SCHOOL_LLM_MODEL");
  const anySchoolConfig = Boolean(schoolApiKey || schoolBaseURL || schoolModel);
  const allSchoolConfig = Boolean(schoolApiKey && schoolBaseURL && schoolModel);

  if (allSchoolConfig) {
    return {
      available: true,
      provider: "school-relay",
      baseURLConfigured: true,
      model: schoolModel,
      status: "ok",
      apiKey: schoolApiKey,
      baseURL: schoolBaseURL
    };
  }

  if (anySchoolConfig) {
    return {
      available: false,
      provider: "unconfigured",
      baseURLConfigured: Boolean(schoolBaseURL),
      model: schoolModel || null,
      status: "unconfigured",
      missing: [
        schoolApiKey ? null : "SCHOOL_LLM_API_KEY",
        schoolBaseURL ? null : "SCHOOL_LLM_BASE_URL",
        schoolModel ? null : "SCHOOL_LLM_MODEL"
      ].filter(Boolean)
    };
  }

  const openaiApiKey = readEnv("OPENAI_API_KEY");
  if (openaiApiKey && !schoolBaseURL) {
    if (!isLikelyOfficialOpenAIKey(openaiApiKey)) {
      return {
        available: false,
        provider: "unconfigured",
        baseURLConfigured: false,
        model: null,
        status: "unconfigured",
        missing: ["SCHOOL_LLM_API_KEY", "SCHOOL_LLM_BASE_URL", "SCHOOL_LLM_MODEL"]
      };
    }

    return {
      available: true,
      provider: "openai",
      baseURLConfigured: false,
      model: readEnv("OPENAI_MODEL") || readEnv("AI_PHOTO_INSPECTION_MODEL") || readEnv("AI_MODEL") || "gpt-4o-mini",
      status: "ok",
      apiKey: openaiApiKey,
      baseURL: undefined
    };
  }

  return {
    available: false,
    provider: "unconfigured",
    baseURLConfigured: false,
    model: null,
    status: "unconfigured",
    missing: ["SCHOOL_LLM_API_KEY", "SCHOOL_LLM_BASE_URL", "SCHOOL_LLM_MODEL"]
  };
}

export function getPublicLlmHealthSnapshot(statusOverride) {
  const config = getLlmProviderConfig();
  const status = statusOverride ?? config.status;

  return {
    available: config.available,
    provider: config.provider,
    baseURLConfigured: config.baseURLConfigured,
    model: config.model,
    status
  };
}

export async function checkLlmHealth() {
  const config = getLlmProviderConfig();
  if (!config.available) return getPublicLlmHealthSnapshot("unconfigured");

  try {
    const client = createOpenAIClient(config);
    await client.models.retrieve(config.model);
    return getPublicLlmHealthSnapshot("ok");
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return getPublicLlmHealthSnapshot("unauthorized");
    }

    if ([400, 404, 405].includes(Number(error?.status ?? error?.statusCode))) {
      return getPublicLlmHealthSnapshot("ok");
    }

    return getPublicLlmHealthSnapshot("error");
  }
}

export async function runVisionJsonCompletion({ instructions, content, schema, schemaName, maxOutputTokens = 2500 }) {
  const config = getLlmProviderConfig();
  if (!config.available) throw providerSetupError(PROVIDER_UNCONFIGURED_MESSAGE);

  const client = createOpenAIClient(config);
  const messages = [
    { role: "system", content: instructions },
    { role: "user", content: toChatContent(content) }
  ];

  try {
    const response = await createChatJsonCompletion(client, {
      model: config.model,
      messages,
      schema,
      schemaName,
      maxOutputTokens
    });
    const rawText = extractChatMessageText(response);
    const { value, fallbackUsed } = parseJsonObject(rawText);

    return {
      value,
      rawText,
      fallbackUsed,
      responseId: typeof response.id === "string" && response.id ? response.id : null,
      model: response.model ?? config.model,
      provider: config.provider,
      usage: response.usage ?? null
    };
  } catch (error) {
    throw normalizeLlmError(error);
  }
}

async function createChatJsonCompletion(client, { model, messages, schema, schemaName, maxOutputTokens }) {
  const basePayload = {
    model,
    messages,
    temperature: 0,
    max_tokens: maxOutputTokens
  };

  try {
    return await client.chat.completions.create({
      ...basePayload,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema
        }
      }
    });
  } catch (error) {
    if (!shouldRetryWithJsonObject(error)) throw error;
  }

  try {
    return await client.chat.completions.create({
      ...basePayload,
      response_format: { type: "json_object" }
    });
  } catch (error) {
    if (!shouldRetryWithoutResponseFormat(error)) throw error;
  }

  return client.chat.completions.create(basePayload);
}

function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: parsePositiveInteger(process.env.AI_TIMEOUT_MS, 45000),
    maxRetries: 0
  });
}

function toChatContent(content) {
  return content.map((item) => {
    if (item.type === "input_text") {
      return { type: "text", text: item.text };
    }

    if (item.type === "input_image") {
      return {
        type: "image_url",
        image_url: {
          url: item.image_url,
          detail: item.detail ?? "high"
        }
      };
    }

    return { type: "text", text: JSON.stringify(item) };
  });
}

function extractChatMessageText(response) {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text;
        return "";
      })
      .join("");

    if (text.trim()) return text;
  }

  throw providerError("AI response did not contain output text.");
}

export function parseJsonObject(rawText) {
  try {
    return { value: JSON.parse(rawText), fallbackUsed: false };
  } catch {
    const extracted = extractFirstJsonObject(rawText);
    if (extracted) {
      try {
        return { value: JSON.parse(extracted), fallbackUsed: true };
      } catch {
        // Fall through to the readable provider error below.
      }
    }
  }

  throw providerError(JSON_PARSE_MESSAGE);
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeLlmError(error) {
  if (error?.statusCode && error instanceof Error) return error;

  if (isUnauthorizedError(error)) return providerError(PROVIDER_UNAUTHORIZED_MESSAGE);
  if (isVisionUnsupportedError(error)) return providerError(VISION_UNSUPPORTED_MESSAGE);

  const message = sanitizeErrorMessage(error);
  return providerError(message || "AI provider 呼叫失敗，請稍後再試。");
}

function isUnauthorizedError(error) {
  return Number(error?.status ?? error?.statusCode) === 401;
}

function isVisionUnsupportedError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    Number(error?.status ?? error?.statusCode) === 400 &&
    (/vision|image|input_image|image_url|multimodal|modal/.test(message) ||
      (/does not support|unsupported|not support|invalid/.test(message) && /image|vision/.test(message)))
  );
}

function shouldRetryWithJsonObject(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return Number(error?.status ?? error?.statusCode) === 400 && /json_schema|response_format|schema|strict/.test(message);
}

function shouldRetryWithoutResponseFormat(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return Number(error?.status ?? error?.statusCode) === 400 && /json_object|response_format/.test(message);
}

function sanitizeErrorMessage(error) {
  const raw = String(error?.message ?? "");
  return raw
    .replace(/(sk|sess|rk|aiapi|key|token|api)[A-Za-z0-9_-]{6,}/gi, "$1_...")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ...")
    .trim();
}

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isLikelyOfficialOpenAIKey(value) {
  return /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]+/.test(value);
}

function providerSetupError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}

function providerError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  return error;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
