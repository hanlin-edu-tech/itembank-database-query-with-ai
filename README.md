# ItemBank Database Query with AI Agent

本專案是一個輔助工具，旨在透過 AI Agent (Gemini/Claude) 協助開發者與數據分析師安全、高效地查詢 **ItemBank 資料庫**。

核心功能是讓 AI 根據使用者的自然語言需求，參考權威的 Schema 定義 (`docs/itembank-schema.yaml`)，自動生成唯讀的 MongoDB 查詢腳本。

> [!IMPORTANT]
> **安全警示**：本專案僅供 **「讀取 (Read-only)」** 操作。所有生成的腳本嚴禁包含 Insert, Update, Delete 等寫入操作。請務必使用具備唯讀權限的資料庫帳號。

## 🚀 快速開始

### 1. 環境準備
- **Node.js**: 建議使用 LTS 版本 (v18+)。
- **Git**: 用於版本控制。

### 2. 安裝依賴
```bash
npm install
```

### 3. 設定環境變數
1. 複製範例設定檔：
   ```bash
   cp .env.example .env
   ```
2. 編輯 `.env` 檔案，填入您的 MongoDB 連線字串 (`MONGODB_URI`)。
   > ⚠️ **注意**：`.env` 檔案包含敏感資訊，請勿提交至版本控制系統。

### 4. 連線驗證
執行檢查腳本確認連線是否成功：
```bash
npm run check-env
```
若顯示 **"✅ 連線成功！"**，代表環境已就緒。

---

## 🤖 如何使用

本專案設計為與 AI Agent 協作使用。

### 1. 詢問 AI
向 AI (如 Gemini CLI) 描述您的查詢需求。
*   **範例**：「幫我找出『數學』科目中，所有狀態為『已上架』的題目數量。」
*   **範例**：「列出最近一個月更新過的產品單元表。」

### 2. 生成腳本
AI 會根據 `docs/itembank-schema.yaml` 自動生成 TypeScript 查詢腳本，並放置於 `src/scripts/` 目錄下。

### 3. 執行查詢
使用 `ts-node` 執行生成的腳本：
```bash
npx ts-node src/scripts/<script-name>.ts
```
*   **範例**：`npx ts-node src/scripts/find-math-items.ts`

### 4. 查看結果
查詢結果通常會以 Markdown 格式輸出至 `src/outputs/` 目錄，方便閱讀與分享。

---

## 🛠 輔助工具

### 引用路徑查詢 (Pathfinding)
當需要釐清兩個實體之間的關聯路徑時，請使用此工具，而非手動查閱 Schema。

```bash
npx ts-node src/utils/query-reference-paths.ts <起始_ID_型別> <目標_實體_名稱>
```

**範例**：找出 `DimensionValueId` (知識點) 如何關聯到 `BodiesOfKnowledge` (學程)：
```bash
npx ts-node src/utils/query-reference-paths.ts DimensionValueId BodiesOfKnowledge
```

---

## 📁 專案結構

*   **`docs/`**: **權威文件區**。包含 Schema 定義 (`itembank-schema.yaml`) 與各項準則。
*   **`src/`**: 程式碼目錄。
    *   **`scripts/`**: AI 生成的查詢腳本存放處 (Git ignored)。
    *   **`outputs/`**: 查詢結果輸出目錄 (Git ignored)。
    *   **`utils/`**:
        *   `db.ts`: 資料庫連線模組。
        *   `query-reference-paths.ts`: 關聯路徑搜尋工具。
    *   `check-env.ts`: 環境檢查腳本。

## 📜 相關文件
*   [Commit 準則](docs/COMMIT_GUIDELINES.md)
*   [腳本生成準則](docs/SCRIPT_GUIDELINES.md)
*   [Schema 文件說明](docs/SCHEMA_DOCUMENTATION.md)
