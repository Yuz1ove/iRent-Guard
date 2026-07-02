import { createCase, send } from "../../_utils.js";

export default function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  return send(res, 200, createCase(req.body || {}));
}
