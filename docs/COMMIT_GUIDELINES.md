# Git Commit 提交準則

為了保持儲存庫的整潔，並確保僅追蹤核心代碼與配置，請在執行 `git commit` 前遵循以下準則：

## 1. 嚴禁提交的目錄
以下目錄中的檔案屬於執行過程產生的暫存物件或結果，**嚴禁提交**：
*   `src/scripts/`：包含 AI 生成的查詢腳本。
*   `src/outputs/`：包含 查詢腳本產出的報告與數據結果。

## 2. 提交操作建議
*   **禁止使用 `git add .`**：當上述目錄中有新增或修改的檔案時，請避免使用全域加入命令。
*   **精確選擇檔案**：請使用 `git add <file_path>` 或 `git add src/utils/...` 等精確指令。
*   **審查暫存區**：在 commit 之前，務必執行 `git status` 確認 `Changes to be committed` 區塊中不包含 `src/scripts/` 或 `src/outputs/` 下的任何檔案。

## 3. 處理誤加檔案
若不慎將上述檔案加入暫存區，請使用以下指令移除：
```bash
git reset HEAD src/scripts/
git reset HEAD src/outputs/
```
