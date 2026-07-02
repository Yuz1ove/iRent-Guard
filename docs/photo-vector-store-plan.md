# 客戶照片向量資料庫規劃

## 目標

iRent 客戶還車照片會快速累積，向量資料庫適合用來做相似案例搜尋、疑似重複照片偵測、常見損傷型態比對、客服查詢輔助。照片原檔不建議直接存進向量資料庫，應放 object storage，向量庫只保存 embedding、索引 metadata 與可追溯的照片 id。

## 建議資料流

1. 客戶端一次選取 6 張照片。
2. 後端 API 接收照片，產生 object storage key 或 signed URL。
3. Photo inspection LLM 回傳結構化 JSON。
4. 後端為每張照片產生 embedding。
5. 寫入向量資料庫：
   - `photoId`
   - `caseId`
   - `rentalId`
   - `userIdHash`
   - `vehiclePlateHash`
   - `capturedAt`
   - `expectedView`
   - `detectedView`
   - `inspectionStatus`
   - `issueTypes`
   - `riskScore`
   - `objectStorageKey`
   - `embedding`

## Provider 選型

Prototype 階段可用：

- PostgreSQL + pgvector：便於和案件資料一起查詢，部署簡單。
- Qdrant：向量查詢能力完整，適合照片量變大後獨立擴展。

若目前仍在 hackathon demo，建議先用抽象介面，不直接綁死 vendor。

## 後端介面草案

```ts
type PhotoVectorRecord = {
  photoId: string;
  caseId: string | null;
  rentalId: string | null;
  userIdHash: string | null;
  vehiclePlateHash: string | null;
  capturedAt: string;
  expectedView: string;
  detectedView: string;
  inspectionStatus: string;
  issueTypes: string[];
  riskScore: number;
  objectStorageKey: string;
  embedding: number[];
};
```

```ts
interface PhotoVectorStore {
  upsert(records: PhotoVectorRecord[]): Promise<void>;
  searchSimilar(queryEmbedding: number[], filters: object, limit: number): Promise<PhotoVectorRecord[]>;
  deleteByCase(caseId: string): Promise<void>;
}
```

## 隱私與安全

- 不在向量 DB 存完整車牌、姓名、電話或 API key。
- `userId`、車牌用 salted hash。
- 原圖走 object storage 權限控管與短效 signed URL。
- retention policy 應依案件狀態刪除或封存。
- 向量資料仍可能洩漏相似性資訊，需納入正式資料治理。

## 下一步

1. 在後端新增 `PhotoVectorStore` adapter。
2. 先提供 `noop` adapter，demo 不需要外部服務也可運行。
3. 若要接正式資料庫，再實作 `pgvector` 或 `qdrant` adapter。
4. 在 `savePhotoInspectionRecord` 後觸發非同步 embedding/upsert，避免拖慢客戶端檢核回應。
