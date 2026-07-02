import { getSupportCasePhotos, send } from "../../../_utils.js";

export default function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const caseId = req.query.caseId;
    return send(res, 200, {
      ok: true,
      data: getSupportCasePhotos(caseId)
    });
  } catch (error) {
    console.error("[support-case-photos] failed", error);
    return send(res, error?.statusCode || 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown support case photos error"
    });
  }
}
