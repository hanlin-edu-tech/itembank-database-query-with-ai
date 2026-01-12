# 腳本撰寫規範

在協助使用者進行此專案時，請遵循以下操作準則，以確保程式碼品質與安全性。

## AI 操作檢查清單 (Action Checklist)

在使用此專案進行開發或查詢時，AI Agent 必須嚴格遵循以下檢查清單：

- [ ] **唯讀安全原則**：嚴禁進行任何寫入 (Insert)、更新 (Update) 或刪除 (Delete) 操作。
- [ ] **商務語言溝通**：對話中**嚴禁**直呼資料庫集合名稱（如 `Items`），必須使用 `itembank-schema.yaml` 中的描述（如「題目」）。
- [ ] **腳本存放規範**：所有產生的腳本必須存放在 `src/scripts/` 目錄下。
- [ ] **使用連線工具**：必須使用 `src/utils/db.ts` 中的 `withDB` 工具，嚴禁硬編碼 (Hardcode) 連線字串或憑證。
- [ ] **結果輸出格式**：查詢結果必須寫入 `src/outputs/` 目錄，並使用 Markdown (.md) 格式。
- [ ] **腳本標頭規範**：腳本開頭必須包含「原始需求」、「腳本功能」與「腳本原理」的中文註解。
- [ ] **Schema 對齊**：開發前必須查閱 `docs/itembank-schema.yaml` 以確保欄位名稱與型別正確。
- [ ] **語言一致性**：所有文件、註解與回覆一律使用**繁體中文**。
- [ ] **需求釐清**：若查詢條件不明確，必須先向使用者釐清需求，嚴禁盲目猜測。

## 1. 腳本生成模式

請務必使用 `src/utils/db.ts` 輔助模組。**不要**在生成的腳本中撰寫原始的 `MongoClient.connect` 邏輯。**所有產生的腳本一律放在 `src/scripts/` 目錄下。**

**檔案標頭規範：**
在每個生成的腳本開頭，必須包含一段註解，說明以下資訊（用詞需精簡，讓非工程人員也能看懂）：
1.  **原始需求**：使用者的原始請求內容。
2.  **腳本功能**：簡述此腳本的主要功能。
3.  **腳本原理**：說明資料查詢與處理的邏輯（例如：「查詢 X 資料表，比對 Y 欄位...」），避免過多的技術細節。

**正確模式 (TypeScript)：**

```typescript
/**
 * 原始需求：找出 2024 年建立的所有「數學」科目題目
 * 腳本功能：列出符合條件的題目 ID 與建立時間
 * 腳本原理：先從 Subjects 表找到數學科的 ID，再到 Items 表篩選建立時間在 2024 年之後的題目。
 */
import { withDB } from '../utils/db'; // 腳本在 src/scripts/，使用相對路徑引用 utils
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

withDB(async (db: Db) => {
    // 1. 定義 Collection
    const collection = db.collection('Items');

    // 2. 查詢資料
    const results = await collection.find({/* 查詢條件 */}).toArray();

    // 3. 格式化為 Markdown 格式
    let markdown = `# 查詢結果\n\n`;
    markdown += `**查詢時間**: ${new Date().toLocaleString('zh-TW')}\n`;
    markdown += `**總筆數**: ${results.length}\n\n`;
    markdown += `## 詳細資料\n\n`;

    results.forEach((item, index) => {
        markdown += `### ${index + 1}. ${item.name || item._id}\n`;
        markdown += `- ID: \`${item._id}\`\n`;
        // 根據需求輸出其他欄位...
        markdown += `\n`;
    });

    // 4. 將結果寫入 Markdown 檔案
    const outputPath = path.join(__dirname, '../outputs/query_result.md');
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    // 5. 僅在 console 顯示摘要資訊
    console.log(`✓ 查詢完成：找到 ${results.length} 筆資料`);
    console.log(`✓ 結果已寫入：${outputPath}`);
});
```

**重要：輸出結果管理**
- **所有查詢結果必須寫入 `src/outputs/` 目錄，格式為 Markdown (.md)**
- 避免在 console 輸出大量資料
- 使用有意義的檔名，例如：`items_2024_math.md`、`metadata_analysis.md`
- Markdown 格式應包含：
  - 標題、查詢時間、總筆數
  - 結構化的資料呈現（使用列表、表格等）
- Console 僅顯示摘要（筆數、檔案路徑）
- AI 執行後**僅讀取輸出檔案的前 20 行**來確認結果，避免佔用過多 context

## 2. 執行方式

請指示使用者使用 `npx ts-node src/scripts/您的腳本.ts` 來執行。
## 2. 閱讀 Schema

*   參閱 **`docs/itembank-schema.yaml`** 以取得權威的欄位名稱、型別與嚴格的枚舉值 (Enum)。
*   參閱 **`docs/SCHEMA_DOCUMENTATION.md`** 以了解欄位之間的關聯與脈絡。
*   **重要：** 請注意 YAML 中的 `id_type` (字串 vs ObjectIds) 以及 `enum_type`。

## 3. 安全協定

*   **唯讀限制**：本專案嚴格禁止任何修改資料的操作。**僅限執行查詢 (`find`, `count`, `aggregate`)**。絕不生成包含 `insertOne`, `updateMany`, `deleteOne` 等具備副作用的腳本。
*   **絕不** 要求使用者將他們的 `.env` 內容或連線字串貼到對話中。
*   **絕不** 在您生成的腳本中硬編碼 (hardcode) 憑證。請依賴 `src/utils/db.js` 從 `.env` 載入。
*   如果使用者要求檢查連線，請告訴他們執行 `npm run check-env`。

## 4. 操作流程

1.  **分析**：閱讀使用者的請求。
2.  **查詢**：檢查 `docs/itembank-schema.yaml` 找到正確的 Collection 與 Fields。
3.  **生成**：在 `src/scripts/` 中建立腳本檔案 (例如 `src/scripts/query_items.ts`)。
4.  **執行/指示**：使用 `npx ts-node src/scripts/query_items.ts` 執行腳本以向使用者顯示結果。

## 5. 海量資料處理策略 (Large Scale Data Processing)

當處理超過百萬筆（如 `DocumentItems`）的資料時，單一聚合查詢 (Aggregate) 極易觸發 5 分鐘超時。應遵循以下策略：

*   **資料量預查 (Volume Check)**：撰寫腳本前，先確認相關集合的 `countDocuments()`。若主表資料量極大，必須放棄單次全量查詢。
*   **避免跨表大連接 (Avoid Heavy Joins)**：禁止在海量資料表上使用 `$lookup` 與 `$unwind`。應將中小型對照表（如目錄、產品映射）讀入記憶體中建立 `Map`。
*   **分而治之 (Divide and Conquer)**：
    *   若目標分組（如「產品」）數量較少，改採「外層遍歷分組，內層精確查詢」模式。
    *   確保內層查詢使用 **Index 欄位**（如 `documentId`），並配合 `$in` 運算子。
*   **進度回報 (Progress Tracking)**：在長耗時迴圈中加入 `console.log` 顯示處理進度，避免因長時間無輸出導致連線中斷或被誤判為失效。