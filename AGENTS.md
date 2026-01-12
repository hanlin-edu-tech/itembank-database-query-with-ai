# ItemBank Schema 專案

## 專案概覽
本儲存庫包含 **ItemBank 資料庫** 的 Schema 定義與文件，這是一個基於 MongoDB 的教育評量與內容管理系統。此處為 ItemBank 生態系統中資料結構、型別與關聯性的權威參考。

> [!IMPORTANT]
> **安全提醒**：本專案僅供「讀取 (Read-only)」操作。所有產生的腳本與查詢應僅限於檢索資料，嚴禁進行任何寫入 (Insert)、更新 (Update) 或刪除 (Delete) 操作。建議使用具備唯讀權限的資料庫帳號進行連線。

## 目錄概覽
本專案將 Schema 定義與文件分開管理：

- **`docs/`**: 核心目錄，包含 Schema 及其文件，在執行前必須都進行閱讀。
    - **`itembank-schema.yaml`**: 資料庫 Schema 的機器可讀單一真理來源 (SSOT)。定義了 Enums、Collections、Indices 和 Fields。
    - **`SCHEMA_DOCUMENTATION.md`**: 解釋 YAML Schema 檔案中使用的結構、語法 and 慣例。
    - **`SCRIPT_GUIDELINES.md`**: 程式碼模式與安全規則，生成腳本時必須遵循的準則。
    - **`docs/SCRIPT_SYNTAX_GUIDE.md`**: 腳本語法、型別安全性與效能優化的實戰指南，避免常見開發錯誤。
    - **`docs/COMMIT_GUIDELINES.md`**: Git 提交準則，明確規範必須排除的目錄（如 src/scripts, src/outputs）。
- **`src/`**: 包含工具腳本、連線工具與生成的查詢。
    - **`utils/db.ts`**: 供 AI 生成腳本使用的資料庫連線輔助工具。
    - **`scripts/`**: AI 生成的所有查詢腳本一律存放在此目錄。
    - **`check-env.ts`**: 驗證環境設定的工具。
    - **`outputs/`**: 查詢結果輸出目錄，所有查詢結果均以 Markdown 格式存放於此。

### 溝通準則
1.  **釐清需求**：若使用者的搜尋目標或查詢條件不明確，請主動詢問以釐清需求，避免在資訊不足的情況下進行猜測。
2.  **使用業務描述**：在與使用者對話時，**嚴禁**直接提及資料庫的集合（Collection）名稱（如 `Items`、`ProductContents`）。請一律參考 `itembank-schema.yaml` 中的 `description` 欄位，使用對應的業務描述（如「題目」、「產品單元表」）與使用者溝通。
3.  **產品歧義釐清**：當使用者提到「產品」時，系統中存在兩種定義：**「目錄產品」(`CatalogGroups`)** 與 **「單元表產品」(`Products`)**。必須優先詢問使用者是指哪一種，嚴禁自行假設。

## Schema 架構
`itembank-schema.yaml` 檔案遵循特定結構：

1.  **Enums**: 定義特定欄位的允許值 (例如 `ConversationRole`, `ImportItemStatus`)。
2.  **Collections**: 定義 MongoDB 集合 (資料表)。
    - **Indices**: 指定資料庫索引以提升效能與確保唯一性。
    - **Fields**: 定義集合內文件的結構，包含型別 (基本與複合)、可空性 (nullability) 與參考 (`id_type`)。

## 用途
本儲存庫主要用於：
1.  **參考**: 開發人員與資料科學家查閱 `itembank-schema.yaml` 以了解資料庫結構。
2.  **驗證**: YAML 檔案可用於工具驗證資料完整性或生成程式碼 (DTOs, Models)。
3.  **AI Context**: 此檔案 (`AGENTS.md`) 與 Schema 文件提供上下文，讓 AI Agent 能協助處理與 ItemBank 相關的查詢、報告生成或資料遷移腳本。

## 工具

### 引用路徑查詢工具
當需要找出某個 id_type 的所有引用點及其到達特定範圍實體的路徑時，可使用：

```bash
npx ts-node src/utils/query-reference-paths.ts <id_type> [scope_entity]
```

範例：
```bash
# 查詢 DimensionValueId 到 BodiesOfKnowledge 的所有引用路徑
npx ts-node src/utils/query-reference-paths.ts DimensionValueId BodiesOfKnowledge

# 查詢 DimensionValueId 的所有可達路徑
npx ts-node src/utils/query-reference-paths.ts DimensionValueId
```

#### 💡 最佳實踐：跨實體關聯探索 (Pathfinding)

當需要釐清兩個不同層級的實體之間如何建立關聯時，**請勿**手動逐層在 Schema 中反查。

**請直接利用工具進行「起點 ID」到「終點實體」的自動路徑搜尋：**

```bash
# 通用語法：npx ts-node src/utils/query-reference-paths.ts <起始_ID_型別> <目標_實體_名稱>

# 範例：找出知識點 (DimensionValueId) 如何關聯到最上層的學程 (BodiesOfKnowledge)
npx ts-node src/utils/query-reference-paths.ts DimensionValueId BodiesOfKnowledge
```

此方式能一次揭示所有可能的關聯路徑（包含經過多層中介表的路徑），幫助你評估並選擇最符合業務需求的查詢路徑。

### 使用路徑查詢工具的檢查清單

當使用路徑查詢工具輔助撰寫查詢腳本時，**必須嚴格遵循**以下檢查流程：

#### 執行前檢查
- [ ] 已執行 `query-reference-paths.ts` 工具取得所有引用路徑
- [ ] 已記錄工具輸出的引用點總數
- [ ] 已識別哪些是直接關聯（1 層），哪些需要多層 JOIN（2+ 層）

#### 實作時檢查
- [ ] **逐一對照工具輸出**，確保每個引用點都有對應的查詢邏輯
- [ ] **特別注意多層路徑**：
  - 路徑長度 ≥ 3 的引用點
  - 需要依序從範圍實體反向查詢到引用點
  - 每一層都需要正確的欄位關聯
- [ ] **處理 array 欄位**：
  - 型別為 `array<string>` 的欄位需使用 `$unwind` 或 `$in`
  - 工具輸出會標註欄位型別，必須檢查
- [ ] **變數命名清晰**：
  - 為每條路徑的收集結果使用明確的變數名
  - 便於驗證是否遺漏路徑

#### 完成後檢查
- [ ] **計數驗證**：腳本中實際查詢的引用點數量 = 工具輸出的引用點總數
- [ ] **路徑核對**：在腳本註解中列出所有處理的路徑，與工具輸出逐一比對
- [ ] **測試驗證**：執行腳本，確認所有路徑都有資料收集（即使某些路徑結果為空也要確認有執行）

#### 常見遺漏警示

以下類型的引用點**特別容易被遺漏**，需格外注意：

1. **三層以上路徑**
   - 需要連續多次反向查詢

2. **經過中間表的路徑**
   - 中間表包含範圍欄位

3. **巢狀或不常見的 Collection**
   - 名稱中包含點號或較少使用的表

**重要原則**：寧可重複檢查，也不要憑直覺跳過任何路徑。每條路徑都可能包含重要資料。

## 其他

一律使用繁體中文撰寫文件與註解，以確保本地化團隊的易讀性與理解度。
確保閱讀過所有需要閱讀的文件後，才能進行任何查詢或腳本生成工作。
對於查詢結果，請指引使用者查看 `src/outputs/` 目錄中的 Markdown 文件，不需要直接在對話中回覆任何資訊。