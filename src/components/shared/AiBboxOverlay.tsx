import type { AiPhotoIssue } from "../../types/photoInspection";

type AiBboxOverlayProps = {
  imageUrl: string | null;
  issues: AiPhotoIssue[];
  alt?: string;
};

export function AiBboxOverlay({ imageUrl, issues, alt = "customer uploaded vehicle photo" }: AiBboxOverlayProps) {
  const visibleIssues = issues.filter((issue) => issue.bbox);

  if (!imageUrl) {
    return (
      <div className="ai-photo-placeholder">
        <span>尚無照片預覽</span>
      </div>
    );
  }

  return (
    <div className="ai-bbox-frame">
      <img alt={alt} src={imageUrl} />
      {visibleIssues.map((issue) => {
        const bbox = issue.bbox;
        if (!bbox) return null;

        return (
          <div
            className={`ai-bbox ai-bbox-${issue.severity}`}
            key={issue.issue_id}
            style={{
              left: `${bbox.x * 100}%`,
              top: `${bbox.y * 100}%`,
              width: `${bbox.w * 100}%`,
              height: `${bbox.h * 100}%`
            }}
            title={`${issue.issue_kind} / ${issue.severity} / ${Math.round(issue.confidence * 100)}%`}
          >
            <span>{issueLabel(issue.issue_kind)} {Math.round(issue.confidence * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
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
