import { getCase, patchCase, send } from "../../_utils.js";

export default function handler(req, res) {
  const id = req.query.id;
  if (req.method === "GET") {
    const item = getCase(id);
    return item ? send(res, 200, item) : send(res, 404, { error: "case_not_found" });
  }
  if (req.method === "PATCH") {
    const item = patchCase(id, req.body || {});
    return item ? send(res, 200, item) : send(res, 404, { error: "case_not_found" });
  }
  return send(res, 405, { error: "method_not_allowed" });
}
