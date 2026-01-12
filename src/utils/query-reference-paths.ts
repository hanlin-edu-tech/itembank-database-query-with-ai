/**
 * 原始需求：提供一個輕量級的路徑查詢工具，根據參數查詢特定 id_type 的引用路徑
 * 腳本功能：
 * 1. 接收命令列參數：id_type 和可選的 scope_entity
 * 2. 動態分析 Schema，找出該 id_type 的所有引用點
 * 3. 計算從引用點到範圍實體的路徑
 * 4. 以簡潔的格式輸出到 console
 * 腳本原理：
 * 即時 BFS 搜尋，不預先產生大檔案，根據需求動態計算路徑
 *
 * 使用方式：
 * npx ts-node src/utils/query-reference-paths.ts <id_type> [scope_entity]
 *
 * 範例：
 * npx ts-node src/utils/query-reference-paths.ts DimensionValueId
 * npx ts-node src/utils/query-reference-paths.ts DimensionValueId BodiesOfKnowledge
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface Field {
    type: string;
    id_type?: string;
    description?: string;
}

interface Collection {
    description: string;
    fields: { [fieldName: string]: Field };
}

interface Schema {
    collections: { [collectionName: string]: Collection };
}

// 解析命令列參數
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('錯誤：缺少參數');
    console.log('\n使用方式：');
    console.log('  npx ts-node src/utils/query-reference-paths.ts <id_type> [scope_entity]\n');
    console.log('範例：');
    console.log('  npx ts-node src/utils/query-reference-paths.ts DimensionValueId');
    console.log('  npx ts-node src/utils/query-reference-paths.ts DimensionValueId BodiesOfKnowledge');
    console.log('\n常見的 scope_entity:');
    console.log('  - BodiesOfKnowledge (學程)');
    console.log('  - Products (產品)');
    console.log('  - ProductContents (產品單元表)');
    console.log('  - Subjects (科目)');
    process.exit(1);
}

const queryIdType = args[0];
const queryScopeEntity = args[1] || null;

// 讀取 Schema
const schemaPath = path.join(__dirname, '../../docs/itembank-schema.yaml');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
const schema = yaml.load(schemaContent) as Schema;

// 建立 id_type 到 Collection 的映射
const idTypeToCollection = new Map<string, string>();
for (const [collectionName, collection] of Object.entries(schema.collections)) {
    for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (fieldName === '_id' && field.id_type) {
            idTypeToCollection.set(field.id_type, collectionName);
        }
    }
}

// 驗證 id_type 是否存在
const targetCollection = idTypeToCollection.get(queryIdType);
if (!targetCollection) {
    console.error(`錯誤：找不到 id_type "${queryIdType}"`);
    console.log('\n可用的 id_type 列表：');
    const availableIdTypes = Array.from(idTypeToCollection.keys()).sort();
    availableIdTypes.forEach(idType => {
        const collection = idTypeToCollection.get(idType);
        const desc = schema.collections[collection!]?.description || '';
        console.log(`  - ${idType} → ${collection} (${desc})`);
    });
    process.exit(1);
}

// 驗證 scope_entity 是否存在
if (queryScopeEntity && !schema.collections[queryScopeEntity]) {
    console.error(`錯誤：找不到 collection "${queryScopeEntity}"`);
    console.log('\n可用的 collection 列表：');
    Object.keys(schema.collections).sort().forEach(name => {
        const desc = schema.collections[name].description;
        console.log(`  - ${name} (${desc})`);
    });
    process.exit(1);
}

// BFS 尋找路徑
function findPathsToTarget(startCollection: string, targetCollection: string, maxDepth: number = 6): string[][] {
    const paths: string[][] = [];
    const queue: { current: string; path: string[] }[] = [
        { current: startCollection, path: [startCollection] }
    ];

    while (queue.length > 0) {
        const { current, path } = queue.shift()!;

        if (current === targetCollection) {
            paths.push(path);
            continue;
        }

        if (path.length >= maxDepth) continue;
        if (path.filter(c => c === current).length > 1) continue;

        const currentCollection = schema.collections[current];
        if (!currentCollection) continue;

        for (const [fieldName, field] of Object.entries(currentCollection.fields)) {
            if (field.id_type && fieldName !== '_id') {
                const nextCollection = idTypeToCollection.get(field.id_type);
                if (nextCollection && nextCollection !== current) {
                    queue.push({
                        current: nextCollection,
                        path: [...path, nextCollection]
                    });
                }
            }
        }
    }

    return paths;
}

// 找出所有引用點
interface ReferencePoint {
    collection: string;
    field: string;
    fieldType: string;
}

const referencePoints: ReferencePoint[] = [];

for (const [collectionName, collection] of Object.entries(schema.collections)) {
    for (const [fieldName, field] of Object.entries(collection.fields)) {
        if (field.id_type === queryIdType && fieldName !== '_id') {
            referencePoints.push({
                collection: collectionName,
                field: fieldName,
                fieldType: field.type
            });
        }
    }
}

// 輸出結果
console.log('═══════════════════════════════════════════════════════════');
console.log(`查詢 ID 型別: ${queryIdType}`);
console.log(`目標實體: ${targetCollection} (${schema.collections[targetCollection].description})`);
if (queryScopeEntity) {
    console.log(`範圍限定: ${queryScopeEntity} (${schema.collections[queryScopeEntity].description})`);
}
console.log('═══════════════════════════════════════════════════════════\n');

if (referencePoints.length === 0) {
    console.log('找不到任何引用點。');
    process.exit(0);
}

console.log(`找到 ${referencePoints.length} 個引用點：\n`);

for (let i = 0; i < referencePoints.length; i++) {
    const ref = referencePoints[i];
    console.log(`[${i + 1}] ${ref.collection}.${ref.field}`);
    console.log(`    型別: ${ref.fieldType}`);

    if (queryScopeEntity) {
        // 只查詢特定範圍實體的路徑
        const paths = findPathsToTarget(ref.collection, queryScopeEntity);
        if (paths.length > 0) {
            console.log(`    路徑到 ${queryScopeEntity}:`);
            paths.forEach((path, idx) => {
                console.log(`      ${idx + 1}. ${path.join(' → ')}`);
            });
        } else {
            console.log(`    ⚠ 無法到達 ${queryScopeEntity}`);
        }
    } else {
        // 查詢所有常見範圍實體的路徑
        const scopeEntities = ['BodiesOfKnowledge', 'Products', 'ProductContents', 'Subjects'];
        const reachable: { [key: string]: string[][] } = {};

        for (const scopeEntity of scopeEntities) {
            if (schema.collections[scopeEntity]) {
                const paths = findPathsToTarget(ref.collection, scopeEntity);
                if (paths.length > 0) {
                    reachable[scopeEntity] = paths;
                }
            }
        }

        if (Object.keys(reachable).length > 0) {
            console.log(`    可達範圍實體:`);
            for (const [entity, paths] of Object.entries(reachable)) {
                const desc = schema.collections[entity].description;
                console.log(`      → ${entity} (${desc}): ${paths.length} 條路徑`);
                paths.forEach((path, idx) => {
                    console.log(`        ${idx + 1}. ${path.join(' → ')}`);
                });
            }
        } else {
            console.log(`    ⚠ 無法到達任何常見範圍實體`);
        }
    }

    console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log('完成');
console.log('═══════════════════════════════════════════════════════════');
