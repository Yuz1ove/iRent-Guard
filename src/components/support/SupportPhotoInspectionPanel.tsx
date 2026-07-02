import React from "react";
import { AlertTriangle, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import { fetchSupportCasePhotos } from "../../lib/demoApi";
import type { SupportInspectionPhoto } from "../../types/photoInspection";
import { AiBboxOverlay } from "../shared/AiBboxOverlay";

type SupportPhotoInspectionPanelProps = {
  caseId: string;
};

export function SupportPhotoInspectionPanel({ caseId }: SupportPhotoInspectionPanelProps) {
  const [loading, setLoading] = React.useState(true);
  const [photos, setPhotos] = React.useState<SupportInspectionPhoto[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let ignore = false;

    async function loadPhotos() {
      setLoading(true);
      setError(null);

      try {
        const nextPhotos = await fetchSupportCasePhotos(caseId);
        if (!ignore) setPhotos(nextPhotos);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "讀取照片失敗");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadPhotos();

    return () => {
      ignore = true;
    };
  }, [caseId]);

  if (loading) {
    return (
      <article className="support-card">
        <h3>客戶上傳照片</h3>
        <p>載入照片與 AI 檢核結果中...</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="support-card">
        <h3>客戶上傳照片</h3>
        <p className="inspection-error">{error}</p>
      </article>
    );
  }

  if (photos.length === 0) {
    return (
      <article className="support-card">
        <h3>客戶上傳照片</h3>
        <p>此案件尚無可顯示的客戶照片；新手機端送出的照片會出現在這裡。</p>
      </article>
    );
  }

  return (
    <article className="support-card photo-inspection-panel">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">AI photo inspection</p>
          <h3>客戶上傳照片</h3>
        </div>
        <span className="badge neutral">{photos.length} 張</span>
      </div>

      <div className="support-photo-list">
        {photos.map((photo) => (
          <section className="support-photo-item" key={photo.id}>
            <AiBboxOverlay imageUrl={photo.imageUrl} issues={photo.ai?.issues ?? []} />

            <div className="support-photo-meta">
              <div className="support-photo-topline">
                <strong>{expectedViewLabel(photo.expectedView)}</strong>
                {photo.ai ? <InspectionBadge photo={photo} /> : <span className="badge warning">尚無 AI 結果</span>}
              </div>

              <dl className="inspection-facts">
                <div>
                  <dt>照片 ID</dt>
                  <dd>{photo.id}</dd>
                </div>
                <div>
                  <dt>拍攝階段</dt>
                  <dd>{stageLabel(photo.stage)}</dd>
                </div>
                <div>
                  <dt>AI 視角</dt>
                  <dd>
                    {photo.ai ? `${viewLabel(photo.ai.detectedView)} ${Math.round(photo.ai.viewConfidence * 100)}%` : "-"}
                  </dd>
                </div>
                <div>
                  <dt>髒污 / 損傷</dt>
                  <dd>{photo.ai ? `${levelLabel(photo.ai.cleanlinessLevel)} / ${levelLabel(photo.ai.damageLevel)}` : "-"}</dd>
                </div>
              </dl>

              {photo.ai ? (
                <>
                  <p className="inspection-summary">{photo.ai.summary}</p>

                  {photo.ai.issues.length > 0 ? (
                    <ul className="inspection-issues">
                      {photo.ai.issues.map((issue) => (
                        <li key={issue.issue_id}>
                          <AlertTriangle size={15} />
                          <span>
                            {issueLabel(issue.issue_kind)} / {areaLabel(issue.vehicle_area)} / {levelLabel(issue.severity)} /{" "}
                            {Math.round(issue.confidence * 100)}%
                            <small>{issue.visual_evidence}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inspection-clear">
                      <CheckCircle2 size={15} /> 未偵測到明顯髒污或損傷。
                    </p>
                  )}

                  <details className="raw-json-block">
                    <summary>
                      <Eye size={15} /> 查看 AI 原始 JSON
                    </summary>
                    <pre>{JSON.stringify(photo.ai.rawResult, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="inspection-summary">此照片尚未完成 AI 檢核。</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function InspectionBadge({ photo }: { photo: SupportInspectionPhoto }) {
  const ai = photo.ai;
  if (!ai) return null;

  if (ai.retakeRequired || ai.status === "needs_retake") {
    return (
      <span className="badge warning">
        <RefreshCw size={13} /> RETAKE
      </span>
    );
  }

  if (ai.status === "manual_review") {
    return <span className="badge warning">REVIEW</span>;
  }

  if (ai.damageLevel !== "none" && ai.damageLevel !== "unknown") {
    return <span className="badge danger">DAMAGE</span>;
  }

  if (ai.cleanlinessLevel !== "none" && ai.cleanlinessLevel !== "unknown") {
    return <span className="badge warning">DIRTY</span>;
  }

  return <span className="badge success">PASS</span>;
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    pickup: "取車",
    return: "還車",
    customer_check: "客戶檢核",
    support_claim: "客服案件",
    other: "其他"
  };

  return map[stage] ?? stage;
}

function expectedViewLabel(view: string) {
  const map: Record<string, string> = {
    front: "要求車頭",
    rear: "要求車尾",
    front_or_rear: "要求車頭或車尾",
    any: "任意車輛角度"
  };

  return map[view] ?? view;
}

function viewLabel(view: string) {
  const map: Record<string, string> = {
    front: "車頭",
    rear: "車尾",
    left_side: "左側車身",
    right_side: "右側車身",
    interior: "內裝",
    wheel: "輪胎 / 輪圈",
    unknown: "無法判斷"
  };

  return map[view] ?? view;
}

function levelLabel(level: string) {
  const map: Record<string, string> = {
    none: "無",
    minor: "輕微",
    moderate: "中度",
    severe: "嚴重",
    unknown: "無法判斷"
  };

  return map[level] ?? level;
}

function issueLabel(issue: string) {
  const map: Record<string, string> = {
    scratch: "刮傷",
    dent: "凹陷",
    crack: "裂痕",
    paint_peel: "掉漆",
    paint_transfer: "漆面轉移",
    broken_light: "燈殼破損",
    deformation: "變形",
    missing_part: "零件缺失",
    dirty: "髒污",
    mud: "泥污",
    dust: "灰塵",
    stain: "污漬",
    bird_dropping: "鳥糞",
    possible_damage: "疑似損傷",
    other: "其他"
  };

  return map[issue] ?? issue;
}

function areaLabel(area: string) {
  const map: Record<string, string> = {
    front_bumper: "前保桿",
    front_grille: "前水箱護罩",
    hood: "引擎蓋",
    front_left_headlight: "左前頭燈",
    front_right_headlight: "右前頭燈",
    front_license_plate: "前車牌",
    rear_bumper: "後保桿",
    trunk_or_tailgate: "後行李箱 / 尾門",
    rear_left_tail_light: "左後尾燈",
    rear_right_tail_light: "右後尾燈",
    rear_license_plate: "後車牌",
    left_front_door: "左前門",
    left_rear_door: "左後門",
    right_front_door: "右前門",
    right_rear_door: "右後門",
    wheel: "輪胎 / 輪圈",
    interior: "內裝",
    unknown: "未知區域"
  };

  return map[area] ?? area;
}
