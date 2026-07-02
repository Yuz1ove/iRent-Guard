import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const provider = getConfiguredProviderName();

console.log("[llm env]", {
  provider,
  schoolKeyConfigured: Boolean(process.env.SCHOOL_LLM_API_KEY?.trim()),
  schoolBaseURLConfigured: Boolean(process.env.SCHOOL_LLM_BASE_URL?.trim()),
  schoolModelConfigured: Boolean(process.env.SCHOOL_LLM_MODEL?.trim()),
  openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  model: process.env.SCHOOL_LLM_MODEL || process.env.AI_PHOTO_INSPECTION_MODEL || process.env.AI_MODEL || null
});

function getConfiguredProviderName() {
  if (process.env.SCHOOL_LLM_API_KEY?.trim() && process.env.SCHOOL_LLM_BASE_URL?.trim() && process.env.SCHOOL_LLM_MODEL?.trim()) {
    return "school-relay";
  }

  if (process.env.SCHOOL_LLM_API_KEY?.trim() || process.env.SCHOOL_LLM_BASE_URL?.trim() || process.env.SCHOOL_LLM_MODEL?.trim()) {
    return "unconfigured";
  }

  if (isLikelyOfficialOpenAIKey(process.env.OPENAI_API_KEY?.trim() ?? "")) {
    return "openai";
  }

  return "unconfigured";
}

function isLikelyOfficialOpenAIKey(value) {
  return /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]+/.test(value);
}
