import { assessPhotoEvidence } from "../../server/photoEvidence.mjs";
import { send } from "../_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await assessPhotoEvidence(body);
    return send(res, 200, { ok: true, data: result });
  } catch (error) {
    console.error("[photo-evidence-ai] failed", error);
    return send(res, error?.statusCode || 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown photo evidence AI error"
    });
  }
}
