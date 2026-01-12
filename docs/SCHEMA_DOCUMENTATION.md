# MongoDB Schema 文件格式說明

本文件說明 ItemBank Database 的 MongoDB Schema YAML 格式定義，供 AI 系統理解和分析使用。

## 文件結構

Schema 文件由兩個主要部分組成：

```yaml
enums:
  { 枚舉定義 }

collections:
  { 集合定義 }
```

## 1. Enums（枚舉定義）

定義系統中使用的所有枚舉類型及其可能值。

### 格式

```yaml
enums:
  { EnumName }:
    { DisplayName }: { Value }
    ...
```

### 範例

```yaml
enums:
  ConversationRole:
    User: user
    Assistant: assistant
    System: system
  DimensionType:
    Knowledge: knowledge
    Lesson: lesson
    Recognition: recognition
```

### 說明

- **EnumName**: 枚舉類型名稱（Pascal Case）
- **DisplayName**: 顯示名稱（可為中文或英文）
- **Value**: 實際儲存在資料庫中的值

---

## 2. Collections（集合定義）

定義 MongoDB 中的所有集合（Collection）及其 Schema。

### 基本格式

```yaml
collections:
  { CollectionName }:
    description: "{集合說明}"
    indices:
      { 索引定義 }
    fields:
      { 欄位定義 }
```

---

## 3. Indices（索引定義）

定義集合上的所有索引。

### 格式

```yaml
indices:
  { IndexName }:
    options:
      { OptionKey }: { OptionValue }
        ...
    fields:
        {FieldName}:
          direction: { ascending|descending }
          ...
```

### 範例

#### 單一欄位索引

```yaml
indices:
  _id_:
    fields:
      _id:
        direction: ascending
  userId_1:
    fields:
      userId:
        direction: ascending
```

#### 複合索引（多欄位）

```yaml
indices:
  metadataList.metadataType_1_metadataList.metadataValueId_1:
    fields:
      metadataList.metadataType:
        direction: ascending
      metadataList.metadataValueId:
        direction: ascending
```

#### 帶選項的索引

```yaml
indices:
  email_unique:
    options:
      unique: true
      sparse: false
    fields:
      email:
        direction: ascending
```

### 說明

- **IndexName**: 索引名稱（MongoDB 內部使用）
- **options**: 索引選項（如 unique, sparse, expireAfterSeconds 等）
- **fields**: 索引包含的欄位
    - **FieldName**: 欄位路徑（可使用點號表示嵌套欄位，如 `metadataList.metadataType`）
    - **direction**: 排序方向
        - `ascending`: 升序（1）
        - `descending`: 降序（-1）

---

## 4. Fields（欄位定義）

定義集合中的所有欄位及其型別。

### 格式

```yaml
fields:
  { fieldName }:
    type: { TypeName }
    description: "{欄位說明}"
    nullable: { true|false }          # 可選，是否可為 null
    id_type: { IdTypeName }            # 可選，ID 類型
    enum_type: { EnumTypeName }        # 可選，枚舉類型
    fields: # 可選，嵌套欄位
      { nested fields... }
```

### 基本類型（Primitive Types）

| Type       | 說明               | MongoDB BSON Type  |
|------------|------------------|--------------------|
| `string`   | 字串               | String             |
| `number`   | 數字（整數或浮點數）       | Int32/Int64/Double |
| `boolean`  | 布林值              | Boolean            |
| `datetime` | 日期時間             | Date               |
| `objectId` | MongoDB ObjectId | ObjectId           |

### 複合類型（Complex Types）

| Type       | 格式              | 說明                      |
|------------|-----------------|-------------------------|
| `array<T>` | `array<string>` | 陣列，T 為元素類型              |
| `object`   | `object`        | 嵌套物件，需搭配 `fields` 定義子欄位 |

### 特殊屬性

#### id_type

表示此欄位是強型別 ID，指向特定的 ID 類型。

```yaml
userId:
  type: string
  id_type: UserId
  description: "使用者 Id"
```

**說明**: 實際儲存為 `string`，但在應用層視為 `UserId` 型別。

#### enum_type

表示此欄位值必須是指定枚舉的成員。

```yaml
role:
  type: string
  enum_type: ConversationRole
  description: "對話角色"
```

**說明**: 實際儲存為 `string`，但值必須是 `ConversationRole` 枚舉中定義的值之一。

#### nullable

表示欄位是否可為 `null`。

```yaml
parentId:
  type: string
  id_type: DocumentId
  description: "父五欄檔案 Id"
  nullable: true
```

**說明**: 若未標示 `nullable: true`，表示該欄位為必填（non-nullable）。

#### fields（嵌套欄位）

當 `type: object` 或 `type: array<object>` 時，使用 `fields` 定義內部結構。

```yaml
stageOne:
  type: object
  description: "第一階段"
  nullable: true
  fields:
    owner:
      type: string
      id_type: UserId
      description: "擁有者"
    department:
      type: string
      description: "部門"
    atcDate:
      type: datetime
      description: "完成時間"
      nullable: true
```

---

## 5. 完整範例

```yaml
collections:
  DocumentItems:
    description: "五欄檔案題目"
    indices:
      _id_:
        fields:
          _id:
            direction: ascending
      itemId_1:
        fields:
          itemId:
            direction: ascending
      metadataList.metadataType_1_metadataList.metadataValueId_1:
        fields:
          metadataList.metadataType:
            direction: ascending
          metadataList.metadataValueId:
            direction: ascending
    fields:
      _id:
        type: string
        id_type: DocumentItemId
        description: "Id"
      documentId:
        type: string
        id_type: DocumentId
        description: "五欄檔案 Id"
      itemId:
        type: string
        id_type: ItemId
        description: "題目 Id"
      order:
        type: number
        description: "排序"
      isNewItem:
        type: boolean
        description: "是否為新題目"
      metadataList:
        type: array<object>
        description: "元資料清單，放置出處及題型"
        fields:
          metadataValueId:
            type: string
            description: "元資料值 Id"
          metadataType:
            type: string
            enum_type: MetadataType
            description: "元資料類型"
          metadataValueName:
            type: string
            description: "元資料值名稱"
```

---

## 6. 命名慣例

### Collection Names

- 使用 PascalCase
- 通常為複數形式（如 `Documents`, `Items`）

### Field Names

- 使用 camelCase
- 描述性名稱（如 `documentId`, `createdBy`, `updatedOn`）

### Index Names

- MongoDB 自動生成格式：`{field}_{direction}`
    - 例：`userId_1`（升序）、`email_-1`（降序）
- 複合索引：`{field1}_{dir1}_{field2}_{dir2}`
    - 例：`type_1_status_1`
- 特殊索引：
    - `_id_`：預設主鍵索引

### ID Types

- 使用 PascalCase，通常以 `Id` 結尾
- 例：`UserId`, `DocumentId`, `ItemId`

### Enum Types

- 使用 PascalCase
- 例：`ConversationRole`, `DimensionType`

---

## 7. 特殊標記

### Obsolete 欄位

已棄用但尚未移除的欄位會標記為 `(obsolete)`：

```yaml
archived (obsolete):
  type: boolean
  description: "過去使用軟刪除機制，現在沒有軟刪除"
  nullable: true
```

**說明**: 這些欄位可能在未來版本中移除，不應在新程式碼中使用。

---

## 8. 如何閱讀 Schema

### 範例：理解一個集合

給定以下 Schema：

```yaml
collections:
  Users:
    description: "使用者"
    indices:
      _id_:
        fields:
          _id:
            direction: ascending
      email_1:
        options:
          unique: true
        fields:
          email:
            direction: ascending
    fields:
      _id:
        type: objectId
        description: "Id"
      email:
        type: string
        description: "電子郵件"
      role:
        type: string
        enum_type: UserRole
        description: "使用者角色"
      profile:
        type: object
        description: "使用者資料"
        nullable: true
        fields:
          name:
            type: string
            description: "姓名"
          age:
            type: number
            description: "年齡"
            nullable: true
```

### 解讀

1. **集合名稱**: `Users`（使用者集合）
2. **索引**:
    - `_id_`: 主鍵索引（預設）
    - `email_1`: email 欄位的唯一索引（升序）
3. **欄位**:
    - `_id`: ObjectId 型別，主鍵
    - `email`: 字串，必填，有唯一索引
    - `role`: 字串，值必須是 `UserRole` 枚舉成員
    - `profile`: 可為 null 的物件，包含：
        - `name`: 字串，必填
        - `age`: 數字，可為 null

### MongoDB 查詢範例

```javascript
// 依 email 查詢（使用索引）
db.Users.find({email: "user@example.com"})

// 查詢特定角色
db.Users.find({role: "admin"})

// 查詢有填寫年齡的使用者
db.Users.find({"profile.age": {$ne: null}})
```

---

## 9. Schema 生成資訊

此 Schema 由 `ItemBank.Database.Tools` 自動生成：

```bash
dotnet run --project ItemBank.Database.Tools -- schema-doc -f yaml -o schema.yaml
```

**工具路徑**: `ItemBank.Database.Tools/SchemaDocGenerator/`

**相關檔案**:

- `SchemaAnalyzer.cs`: Schema 分析器
- `YamlSchemaGenerator.cs`: YAML 生成器
- `Models/`: Schema 模型定義

---

## 10. 注意事項

### 給 AI 的建議

1. **型別理解**:
    - `id_type` 表示強型別 ID，在查詢時應視為該 ID 類型
    - `enum_type` 表示值受限於枚舉定義
    - 注意 `nullable: true` 的欄位，查詢時需考慮 null 值

2. **索引利用**:
    - 複合索引的欄位順序很重要
    - 查詢時優先使用有索引的欄位
    - 點號表示嵌套欄位索引（如 `metadataList.metadataType`）

3. **欄位命名**:
    - YAML 中使用 camelCase
    - MongoDB 中實際儲存也是 camelCase
    - C# 類別使用 PascalCase（自動對映）

4. **嵌套結構**:
    - `type: object` 有 `fields` 子欄位
    - `type: array<object>` 有 `fields` 定義陣列元素結構
    - 使用點號存取嵌套欄位（如 `profile.name`）

5. **Obsolete 欄位**:
    - 標記為 `(obsolete)` 的欄位應避免使用
    - 這些欄位僅為相容性保留

---

## 11. 版本資訊

- **Schema 版本**: 自動生成，反映當前程式碼定義
- **最後更新**: 2026-01-08
- **工具版本**: ItemBank.Database.Tools (.NET 10.0)

---

## 附錄：常見問題

### Q1: 如何判斷欄位是否為外鍵？

**A**: 查看 `id_type` 屬性。如果欄位有 `id_type`，表示它引用其他集合。

```yaml
documentId:
  type: string
  id_type: DocumentId
  description: "五欄檔案 Id"
```

此欄位引用 `Documents` 集合（依慣例 `DocumentId` 對應 `Documents`）。

### Q2: 如何理解複合索引？

**A**: 複合索引的 `fields` 包含多個欄位，順序很重要。

```yaml
metadataList.metadataType_1_metadataList.metadataValueId_1:
  fields:
    metadataList.metadataType:
      direction: ascending
    metadataList.metadataValueId:
      direction: ascending
```

此索引支援：

- `{ "metadataList.metadataType": "source" }` ✓
- `{ "metadataList.metadataType": "source", "metadataList.metadataValueId": "123" }` ✓
- `{ "metadataList.metadataValueId": "123" }` ✗（不支援，因為跳過第一個欄位）

### Q3: array<object> 如何查詢？

**A**: 使用 MongoDB 的陣列查詢語法。

Schema:

```yaml
metadataList:
  type: array<object>
  fields:
    metadataType:
      type: string
```

查詢:

```javascript
// 查詢陣列中包含特定 metadataType
db.collection.find({"metadataList.metadataType": "source"})

// 使用 $elemMatch 精確匹配
db.collection.find({
    metadataList: {
        $elemMatch: {
            metadataType: "source",
            metadataValueId: "123"
        }
    }
})
```

---

**文件結束**
