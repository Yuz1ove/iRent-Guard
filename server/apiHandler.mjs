import {
  createCase,
  getCase,
  getLatestCase,
  patchCase,
  resetCases,
  aiHealth,
  returnPrecheck,
  getSupportCasePhotos,
  savePhotoInspectionRecord
} from "./demoStore.mjs";
import { assessPhotoEvidence } from "./photoEvidence.mjs";
import {
  describePhotoInspectionError,
  getCustomerPhotoInspectionPublicError,
  inspectCustomerPhotos,
  inspectPhotoAiSmokeTest
} from "./photoInspection.mjs";
import { checkLlmHealth } from "./llmProvider.mjs";
import { readMultipartForm } from "./multipartForm.mjs";

export async function handleApiRequest(req, res) {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  try {
    if (method === "POST" && pathname === "/api/demo/submissions") {
      return sendJson(res, 200, createCase(await readJson(req)));
    }
    if (method === "GET" && pathname === "/api/demo/submissions/latest") {
      return sendJson(res, 200, { case: getLatestCase() });
    }
    if (method === "POST" && pathname === "/api/demo/reset") {
      return sendJson(res, 200, resetCases());
    }
    if (method === "GET" && pathname === "/api/ai/health") {
      return sendJson(res, 200, aiHealth());
    }
    if (method === "GET" && pathname === "/api/llm/health") {
      return sendJson(res, 200, await checkLlmHealth());
    }
    if (method === "POST" && pathname === "/api/ai/return-precheck") {
      return sendJson(res, 200, returnPrecheck(await readJson(req)));
    }
    if (method === "POST" && pathname === "/api/ai/photo-evidence") {
      try {
        const result = await assessPhotoEvidence(await readJson(req));
        return sendJson(res, 200, { ok: true, data: result });
      } catch (error) {
        return sendJson(res, error?.statusCode || 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown photo evidence AI error"
        });
      }
    }
    if (method === "POST" && pathname === "/api/customer/photo-inspection") {
      try {
        const body = await readJson(req);
        const result = await inspectCustomerPhotos(body);
        savePhotoInspectionRecord(body, result);
        return sendJson(res, 200, { ok: true, data: result });
      } catch (error) {
        console.error("[customer-photo-inspection] failed", describePhotoInspectionError(error));
        return sendJson(res, error?.statusCode || 400, {
          ok: false,
          error: getCustomerPhotoInspectionPublicError()
        });
      }
    }
    if (method === "POST" && pathname === "/api/debug/photo-ai-smoke-test") {
      try {
        const form = await readMultipartForm(req);
        const expectedView = String(form.fields.expectedView ?? "any");
        const file = form.files.file;
        const result = await inspectPhotoAiSmokeTest({ file, expectedView });
        return sendJson(res, 200, { ok: true, data: result });
      } catch (error) {
        return sendJson(res, error?.statusCode || 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown photo AI smoke test error"
        });
      }
    }

    const supportPhotosMatch = pathname.match(/^\/api\/support\/cases\/([^/]+)\/photos$/);
    if (supportPhotosMatch && method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        data: getSupportCasePhotos(decodeURIComponent(supportPhotosMatch[1]))
      });
    }

    const match = pathname.match(/^\/api\/demo\/submissions\/([^/]+)$/);
    if (match && method === "GET") {
      const item = getCase(decodeURIComponent(match[1]));
      return item ? sendJson(res, 200, item) : sendJson(res, 404, { error: "case_not_found" });
    }
    if (match && method === "PATCH") {
      const item = patchCase(decodeURIComponent(match[1]), await readJson(req));
      return item ? sendJson(res, 200, item) : sendJson(res, 404, { error: "case_not_found" });
    }

    return false;
  } catch (error) {
    return sendJson(res, 500, { error: "api_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
  return true;
}
