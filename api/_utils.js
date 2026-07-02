export {
  createCase,
  getCase,
  getLatestCase,
  patchCase,
  resetCases,
  aiHealth,
  returnPrecheck,
  getSupportCasePhotos,
  savePhotoInspectionRecord
} from "../server/demoStore.mjs";

export function send(res, status, payload) {
  res.status(status).json(payload);
}
