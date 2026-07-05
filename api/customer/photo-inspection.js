import {
  describePhotoInspectionError,
  getCustomerPhotoInspectionPublicError,
  inspectCustomerPhotos
} from "../../server/photoInspection.mjs";
import { savePhotoInspectionRecord, send } from "../_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await inspectCustomerPhotos(body);
    savePhotoInspectionRecord(body, result);
    return send(res, 200, { ok: true, data: result });
  } catch (error) {
    console.error("[customer-photo-inspection] failed", describePhotoInspectionError(error));
    return send(res, error?.statusCode || 400, {
      ok: false,
      error: getCustomerPhotoInspectionPublicError()
    });
  }
}
