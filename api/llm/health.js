import { checkLlmHealth, getPublicLlmHealthSnapshot } from "../../server/llmProvider.mjs";
import { send } from "../_utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
  const url = new URL(req.url || "/", "http://localhost");
  if (url.searchParams.get("mode") === "config") return send(res, 200, getPublicLlmHealthSnapshot());
  return send(res, 200, await checkLlmHealth());
}
