import { getLatestCase, send } from "../../_utils.js";

export default function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
  return send(res, 200, { case: getLatestCase() });
}
