import { inspectPhotoAiSmokeTest } from "../../server/photoInspection.mjs";
import { readMultipartForm } from "../../server/multipartForm.mjs";
import { send } from "../_utils.js";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const form = await readMultipartForm(req);
    const expectedView = String(form.fields.expectedView ?? "any");
    const file = form.files.file;
    const data = await inspectPhotoAiSmokeTest({ file, expectedView });
    return send(res, 200, { ok: true, data });
  } catch (error) {
    console.error("[photo-ai-smoke-test] failed", error);
    return send(res, error?.statusCode || 400, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown photo AI smoke test error"
    });
  }
}
