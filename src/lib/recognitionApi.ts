import type { ExpectedVehicleView, FinalPhotoInspectionResult } from '../types/photoInspection';

export type RecognitionBox = {class_name: string; x: number; y: number; width: number; height: number; confidence?: number};
export type RecognitionPhoto = {photo_id: string; title: string; width: number; height: number; sha256: string; image_url: string; thumbnail_url?: string; source_label?: string; inference_status?: string};
export type RecognitionResult = {image_sha256?: string; prediction_boxes: RecognitionBox[]; coordinate_space?: string; width: number; height: number; model_id: string; model_sha256?: string; checkpoint_sha256?: string; config_sha256: string; analyzed_at: string; status: string; source: string; attempt_id: string; failure_reason?: string; error?: string};
export type RecognitionReview = {version?: number; review_id?: string; verdict: string; notes: string; boxes: RecognitionBox[]; saved_at?: string; created_at?: string; actor?: string};
export type RecognitionDetail = {photo: RecognitionPhoto; result: RecognitionResult | null; history: RecognitionResult[]; human: {boxes?: RecognitionBox[]; status?: string; label?: string; [key: string]: unknown} | null; review: RecognitionReview | null; case_id?: string; job?: RecognitionJob; can_review?: boolean};
export type RecognitionJob = {model_id?: string; checkpoint_sha256?: string; config_sha256?: string; image_sha256?: string; job_id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'; result?: RecognitionResult; error?: string; failure_reason?: string; photo_id?: string; cached?: boolean};
export type RecognitionHealth = {status: string; provider?: {id: string; available: boolean; model_id: string; checkpoint_sha256?: string; config_sha256?: string}; queue?: {queued: number; running: number}; evidence?: Record<string, unknown>; role?: string; can_review?: boolean};
export type RecognitionCatalog = {items: RecognitionPhoto[]; total: number; page: number; total_pages: number};

const root = '/api/integration';
export async function recognitionRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(root + path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? undefined : {'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35000)});
  } catch { throw new Error('辨識服務目前無法連線。已保存的紀錄不會被當成無損；請稍後重新讀取。'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const labels: Record<number, string> = {401:'請先完成網站登入。',403:'目前身分無權執行此操作。',409:'紀錄已有新版本，請重新讀取後再保存。',413:'照片超過上傳限制。',422:'照片或辨識結果無法解析，請改用可讀取的 JPEG／PNG。',503:'辨識服務離線，請稍後再試。'};
    throw new Error([labels[response.status] || '操作未完成。', data?.message || data?.error || data?.detail || `HTTP ${response.status}`].filter(Boolean).join(' '));
  }
  if (data == null) throw new Error('服務未回傳可解析的紀錄；不能視為沒有損傷。');
  return adaptRecognitionPayload(data) as T;
}

// The integration service preserves its batch field names. Normalize them once
// here so UI, customer upload and saved case readback all use the same contract.
function adaptPhoto(value: any): RecognitionPhoto {
  return {...value, photo_id:value.photo_id||value.id, title:value.title||value.filename||value.photo_id||value.id,
    sha256:value.sha256||value.image_sha256, source_label:value.source_label||(value.source_kind==='USER_UPLOAD'?'使用者上傳原圖':'已授權開發資料集'),
    inference_status:value.inference_status||value.analysis_status};
}
function adaptResult(value: any): RecognitionResult | null {
  if(!value)return null;
  const boxes=value.prediction_boxes??value.boxes;
  const invalid=value.status==='COMPLETED'&&!Array.isArray(boxes);
  return {...value,status:invalid?'FAILED':value.status,error:invalid?'模型回傳缺少可解析的框陣列，不能判定為未偵測到損傷。':value.error,prediction_boxes:Array.isArray(boxes)?boxes:[],attempt_id:value.attempt_id||value.result_id};
}
function adaptRecognitionPayload(value: any): any {
  if(!value || typeof value!=='object')return value;
  if(Array.isArray(value.items))return {...value,items:value.items.map(adaptPhoto),total_pages:value.total_pages??value.pages??1};
  if(Array.isArray(value.photos))return {...value,photos:value.photos.map(adaptRecognitionPayload)};
  if(value.photo)return {...value,photo:adaptPhoto(value.photo),result:adaptResult(value.result),history:(value.history||[]).map(adaptResult),human:value.human?{...value.human,status:value.photo.gt_status||'已有保存的人工答案'}:null,job:value.job?adaptRecognitionPayload(value.job):undefined};
  if(value.job_id)return {...value,result:adaptResult(value.result)||undefined};
  return value;
}
export const getRecognitionHealth = () => recognitionRequest<RecognitionHealth>('/health');
export const getRecognitionDetail = (id: string, caseId?: string) => recognitionRequest<RecognitionDetail>('/photos/' + encodeURIComponent(id) + (caseId ? '?case_id=' + encodeURIComponent(caseId) : ''));
export const getRecognitionCase = (id: string) => recognitionRequest<{case_id: string; photos: RecognitionDetail[]}>('/cases/' + encodeURIComponent(id));
export const bindRecognitionPhoto = (caseId: string, photoId: string) => recognitionRequest('/cases/' + encodeURIComponent(caseId) + '/photos', {photo_id: photoId});
export const getRecognitionJob = (id: string) => recognitionRequest<RecognitionJob>('/jobs/' + encodeURIComponent(id));
export const startRecognition = (photoId: string, caseId?: string, requestId: string = crypto.randomUUID()) => recognitionRequest<RecognitionJob>('/photos/' + encodeURIComponent(photoId) + '/analyze', {request_id: requestId, ...(caseId ? {case_id: caseId} : {})});
export const saveRecognitionReview = (photoId: string, baseVersion: number, review: RecognitionReview, caseId?: string, reviewedResultId?: string) => recognitionRequest<RecognitionReview>('/photos/' + encodeURIComponent(photoId) + '/reviews', {base_version: baseVersion, reviewed_result_id:reviewedResultId||null, coordinate_space: 'original_pixels', review, ...(caseId ? {case_id: caseId} : {})});
export async function uploadRecognitionPhoto(filename: string, dataUrl: string, caseId?: string) {
  const payload = await recognitionRequest<RecognitionPhoto | {photo: RecognitionPhoto}>('/photos/upload', {filename, base64: dataUrl.replace(/^data:[^,]+,/, ''), ...(caseId ? {case_id: caseId} : {})});
  return 'photo' in payload ? payload.photo : payload;
}
export async function fileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('照片讀取失敗。')); reader.readAsDataURL(file);});
}
export function recognitionUrl(photoId?: string, caseId?: string, returnTo?: string) {
  const query = new URLSearchParams();
  if (photoId) query.set('photo', photoId);
  if (caseId) query.set('case', caseId);
  if (returnTo?.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') && !/[\u0000-\u001f\u007f]/.test(returnTo) && !returnTo.startsWith('/api/')) query.set('return', returnTo);
  return '/recognition' + (query.size ? '?' + query : '');
}
export function recognitionStatus(status?: string) {
  return ({QUEUED:'排隊中', RUNNING:'分析中', COMPLETED:'完成 · 待人工覆核', SUCCESS:'完成 · 待人工覆核', FAILED:'分析失敗', ERROR:'分析失敗', UNREADABLE:'圖片不可讀', NOT_RUN:'尚未分析', NOT_STARTED:'尚未分析', PENDING:'尚未分析', UNLABELED:'尚未驗證', ALL_DAMAGE_CONFIRMED:'已有人工答案', NO_DAMAGE_CONFIRMED:'人工確認未見損傷'} as Record<string, string>)[status || ''] || status || '尚未分析';
}
export const damageName = (name: string) => ({scratch:'刮痕', dent:'凹陷', crack:'裂紋', paint_loss:'掉漆', paint_peel:'掉漆', missing_part:'缺件', glass_shatter:'玻璃破裂',lamp_broken:'車燈破損',tire_flat:'輪胎異常',other_damage:'其他損傷',other:'其他',normal_structure:'正常結構',reflection:'反光',seam:'接縫',unknown:'未分類'} as Record<string,string>)[name] || name;

// A single adapter owns the old Demo contract. The detector cannot classify angle,
// cleanliness, responsibility, or whole-car safety, so those fields stay unknown.
export function toDemoInspection(photoId: string, expectedView: ExpectedVehicleView, photo: RecognitionPhoto, result: RecognitionResult): FinalPhotoInspectionResult {
  const boxes = result.prediction_boxes || [];
  const verificationWarning = '尚未確認照片中有車輛、指定角度或清晰內容。請重拍車輛照片，或明確送人工覆核；不計為已通過。';
  const damageMessage = boxes.length ? `已偵測到 ${boxes.length} 處疑似損傷，請人工確認位置與類型。` : '未偵測到損傷；這不代表車輛一定正常，仍需人工確認可見範圍。';
  const message = verificationWarning + ' ' + damageMessage;
  return {
    inspectionStatus:'needs_review', detectedIssues:boxes.map(b => ({area:'unknown',issueType:b.class_name === 'scratch' ? 'scratch' : b.class_name === 'dent' ? 'dent' : 'possible_damage',severity:'low',confidence:b.confidence || 0,reason:`${damageName(b.class_name)}模型候選，尚未人工覆核`})), missingAngles:[], customerMessage:message, staffSummary:message, riskScore:0,
    overall_status:'manual_review', summary:message, needs_manual_review:true, manual_review_reasons:['模型只辨識可見損傷候選，照片角度、整車狀態與責任仍待人工確認。'],
    photos:[{photo_id:photoId,is_vehicle_visible:false,detected_view:'unknown',view_confidence:0,expected_view:expectedView,expected_view_match:'unknown',photo_quality:{score:0,is_clear_enough:false,problems:['quality_not_evaluated']},cleanliness:{level:'unknown',confidence:0,summary:'此模型未評估清潔程度'},damage:{level:boxes.length?'minor':'unknown',confidence:Math.max(0,...boxes.map(b=>b.confidence||0)),summary:message},issues:boxes.map((b,i)=>({issue_id:result.attempt_id+'-'+i,photo_id:photoId,vehicle_area:'unknown',issue_kind:b.class_name,severity:'unknown',confidence:b.confidence||0,visual_evidence:'真實模型預測，原始結果與座標已保存。',bbox:{x:b.x/photo.width,y:b.y/photo.height,w:b.width/photo.width,h:b.height/photo.height}})),retake_required:true,retake_reasons:[verificationWarning],flags:['vehicle_not_verified','manual_review_recommended','view_not_evaluated','quality_not_evaluated'],customer_message:message,support_message:message}],
    final_decision:{status:'manual_review',customer_message:message,support_message:message},
    ai_meta:{source:'local-detector',provider:'local-detector',responseId:result.attempt_id,model:result.model_id,resultKind:'formal_ai',formalResult:true,isFormalProvider:true,fallbackUsed:false,generatedAt:result.analyzed_at,integration:{photo_id:photo.photo_id,image_url:photo.image_url,sha256:photo.sha256,attempt_id:result.attempt_id,model_sha256:result.model_sha256||result.checkpoint_sha256,config_sha256:result.config_sha256}}
  };
}

type IntegratedInspectionInput = {
  caseId?: string | null;
  resumeOnly?: boolean;
  retryFailed?: boolean;
  photos: {id: string; imageUrl: string; expectedView: ExpectedVehicleView}[];
};
type InspectionMetadata = {
  version: 1;
  photoId?: string;
  requestId?: string;
  jobId?: string;
  resultId?: string;
  status?: RecognitionJob['status'];
};
const inspections = new Map<string, Promise<FinalPhotoInspectionResult>>();
const inspectionStoragePrefix = 'irent-inspection:v1:';
function readInspectionMetadata(key: string): InspectionMetadata {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.version === 1) return saved;
  } catch { /* Old or inaccessible metadata is recovered from the case's saved photos. */ }
  return {version: 1};
}
function writeInspectionMetadata(key: string, value: InspectionMetadata, beforeStart = false) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); }
  catch { if (beforeStart) throw new Error('無法保存辨識工作的重試識別，尚未啟動新的分析；請確認瀏覽器儲存空間後重試。'); }
}
async function originalPhotoData(imageUrl: string, caseId?: string) {
  if (!imageUrl.startsWith('data:')) {
    const url = new URL(imageUrl, window.location.origin);
    if (url.origin !== window.location.origin && url.protocol !== 'blob:') throw new Error('請使用本網站保存或本次上傳的照片。');
    const savedPhoto = url.origin === window.location.origin && url.pathname.match(/^\/api\/integration\/photos\/([^/]+)\/image$/);
    if (savedPhoto) {
      const detail = await getRecognitionDetail(decodeURIComponent(savedPhoto[1]),caseId);
      return {contentSha: detail.photo.sha256, detail, data: undefined};
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('圖片讀取失敗。');
    imageUrl = await fileDataUrl(await response.blob());
  }
  const comma = imageUrl.indexOf(',');
  const encoded = imageUrl.slice(comma + 1);
  const bytes = /;base64/i.test(imageUrl.slice(0,comma))
    ? Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(encoded));
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  const contentSha = Array.from(new Uint8Array(hash),byte => byte.toString(16).padStart(2,'0')).join('');
  return {contentSha, detail: undefined, data: imageUrl};
}

export async function inspectWithIntegratedModel(input: IntegratedInspectionInput): Promise<FinalPhotoInspectionResult> {
  const results: FinalPhotoInspectionResult[] = [];
  const provider = (await getRecognitionHealth()).provider;
  if (!provider?.model_id || !provider.checkpoint_sha256 || !provider.config_sha256) throw new Error('尚未確認辨識模型與設定，請稍後重新讀取；未啟動新分析。');
  const caseId = input.caseId || undefined;
  for (const inputPhoto of input.photos) {
    const original = await originalPhotoData(inputPhoto.imageUrl,caseId);
    const fingerprint = JSON.stringify([caseId || '',inputPhoto.id,original.contentSha,provider.model_id,provider.checkpoint_sha256,provider.config_sha256]);
    let pending = inspections.get(fingerprint);
    if (!pending) {
      pending = (async () => {
        const storageKey = inspectionStoragePrefix + fingerprint;
        let metadata = readInspectionMetadata(storageKey);
        let detail = original.detail;
        if (!detail && metadata.photoId) detail = await getRecognitionDetail(metadata.photoId,caseId);
        if (!detail && caseId) detail = (await getRecognitionCase(caseId)).photos.find(item => item.photo.sha256 === original.contentSha);
        if (!detail) {
          if (input.resumeOnly) throw new Error('尚未找到這張照片已保存的分析工作，請按重新檢核；此次重新整理未啟動新分析。');
          if (!original.data) throw new Error('尚未讀取原始照片，請重新選擇照片。');
          const photo = await uploadRecognitionPhoto(inputPhoto.id + '.jpg',original.data,caseId);
          detail = await getRecognitionDetail(photo.photo_id,caseId);
        }
        const photo = detail.photo;
        if (photo.sha256 !== original.contentSha) throw new Error('原圖內容與保存紀錄不符，請重新選擇照片；未啟動新分析。');
        const matches = (value: {model_id?: string; model_sha256?: string; checkpoint_sha256?: string; config_sha256?: string; image_sha256?: string}) =>
          value.model_id === provider.model_id && (value.model_sha256 || value.checkpoint_sha256) === provider.checkpoint_sha256 && value.config_sha256 === provider.config_sha256 && value.image_sha256 === original.contentSha;
        let job = metadata.jobId ? await getRecognitionJob(metadata.jobId) : detail.job && matches(detail.job) ? detail.job : undefined;
        if (job && (job.photo_id !== photo.photo_id || !matches(job))) throw new Error('保存工作的照片或模型設定不符，請重新讀取案件；未啟動新分析。');
        let result = job?.result || (!job ? [detail.result,...detail.history].find((item): item is RecognitionResult => !!item && matches(item)) : undefined);
        metadata = {...metadata,photoId:photo.photo_id};
        if (!job && !result && (detail.job || [detail.result,...detail.history].some(item => item?.status === 'COMPLETED'))) {
          throw new Error('此照片已有其他模型設定的分析紀錄；請至辨識工作台查看，或明確選擇重新執行。此次未啟動新分析。');
        }
        if (job?.status === 'FAILED' || result?.status === 'FAILED') {
          metadata = {...metadata,jobId:job?.job_id || (result?.source === 'LOCAL_INFERENCE' ? result.attempt_id : undefined),resultId:result?.attempt_id,status:'FAILED'};
          writeInspectionMetadata(storageKey,metadata);
          if (!input.retryFailed || input.resumeOnly) throw new Error(job?.error || result?.error || result?.failure_reason || '已保存的分析失敗，請按重新檢核以建立新的分析工作。');
          metadata = {version:1,photoId:photo.photo_id};
          job = undefined;
          result = undefined;
        }
        if (!job && result?.status === 'COMPLETED') {
          writeInspectionMetadata(storageKey,{...metadata,jobId:result.source === 'LOCAL_INFERENCE' ? result.attempt_id : undefined,resultId:result.attempt_id,status:'COMPLETED'});
          if (!input.resumeOnly && caseId) await bindRecognitionPhoto(caseId,photo.photo_id);
          return toDemoInspection(inputPhoto.id,inputPhoto.expectedView,photo,result);
        }
        if (!job) {
          if (input.resumeOnly) throw new Error('未找到可恢復的分析工作，請按重新檢核；此次重新整理未啟動新分析。');
          metadata = {...metadata,requestId:metadata.requestId || crypto.randomUUID()};
          writeInspectionMetadata(storageKey,metadata,true);
          job = await startRecognition(photo.photo_id,caseId,metadata.requestId);
        }
        metadata = {...metadata,jobId:job.job_id,status:job.status};
        writeInspectionMetadata(storageKey,metadata);
        const deadline = Date.now() + 5 * 60 * 1000;
        while (job.status === 'QUEUED' || job.status === 'RUNNING') {
          if (Date.now() > deadline) throw new Error('分析仍在後端執行，請重新整理或重試以讀取同一工作的保存進度。');
          await new Promise(resolve => setTimeout(resolve,1200));
          job = await getRecognitionJob(job.job_id);
          metadata = {...metadata,status:job.status};
          writeInspectionMetadata(storageKey,metadata);
        }
        if (job.status !== 'COMPLETED') throw new Error(job.error || job.failure_reason || '模型分析失敗，請按重新檢核以建立新的分析工作。');
        result = job.result || (await getRecognitionDetail(photo.photo_id,caseId)).history.find(item => item.attempt_id === job!.job_id);
        if (!result || result.status !== 'COMPLETED' || !matches(result) || !Array.isArray(result.prediction_boxes)) throw new Error('模型結果未能解析或與原圖設定不符，照片已保存待人工覆核。');
        return toDemoInspection(inputPhoto.id,inputPhoto.expectedView,photo,result);
      })();
      inspections.set(fingerprint,pending);
      pending.catch(() => inspections.delete(fingerprint));
    }
    results.push(await pending);
  }
  if (!results.length) throw new Error('請先選擇照片。');
  return {...results[0],photos:results.flatMap(r=>r.photos),detectedIssues:results.flatMap(r=>r.detectedIssues)};
}
