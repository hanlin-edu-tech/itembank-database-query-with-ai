/**
 * 原始需求：驗證產品單元章節、向度資訊、課本章節的 depth/hasChildren/parentId 是否可由 path 正確推算，並輸出統計與前 20 筆錯誤。
 * 腳本功能：依 path 推算欄位，統計不一致筆數並列出範例明細。
 * 腳本原理：假設 path 不包含自身（A -> B -> C，C 的 path 為 A B），用 path 長度推算 depth，用 path 最後一個節點推算 parentId；hasChildren 由是否成為其他節點的 parent 推算。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'validate_path_consistency.md';
const SAMPLE_LIMIT = 20;

function normalizePath(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item));
}

withDB(async (db: Db) => {
    const lines: string[] = [];
    lines.push('# 以 path 驗證欄位一致性');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('');

    // 產品單元章節：驗證 hasChildren
    const productParentIds = new Set<string>();
    const productCursorForParents = db
        .collection('ProductSections')
        .find({}, { projection: { _id: 1, path: 1 } })
        .batchSize(2000);

    for await (const doc of productCursorForParents) {
        const pathList = normalizePath(doc.path);
        if (pathList.length > 0) {
            productParentIds.add(pathList[pathList.length - 1]);
        }
    }

    let productChecked = 0;
    let productMismatch = 0;
    let productMissingField = 0;
    let productExpectedTrueActualFalse = 0;
    let productExpectedFalseActualTrue = 0;
    const productSamples: Array<{ id: string; expected: boolean; actual: string }> = [];

    const productCursor = db
        .collection('ProductSections')
        .find({}, { projection: { _id: 1, hasChildren: 1 } })
        .batchSize(2000);

    for await (const doc of productCursor) {
        productChecked += 1;
        const id = doc._id ? String(doc._id) : '未知';
        const expected = productParentIds.has(id);
        const actualValue = doc.hasChildren;

        if (typeof actualValue !== 'boolean') {
            productMismatch += 1;
            productMissingField += 1;
            if (productSamples.length < SAMPLE_LIMIT) {
                productSamples.push({ id, expected, actual: '欄位缺失' });
            }
            continue;
        }

        if (actualValue !== expected) {
            productMismatch += 1;
            if (expected) {
                productExpectedTrueActualFalse += 1;
            } else {
                productExpectedFalseActualTrue += 1;
            }
            if (productSamples.length < SAMPLE_LIMIT) {
                productSamples.push({ id, expected, actual: String(actualValue) });
            }
        }
    }

    lines.push('## 產品單元章節（hasChildren）');
    lines.push('');
    lines.push('**檢查筆數**: ' + productChecked);
    lines.push('**不一致筆數**: ' + productMismatch);
    lines.push('**欄位缺失筆數**: ' + productMissingField);
    lines.push('**預期為 true 但實際為 false 筆數**: ' + productExpectedTrueActualFalse);
    lines.push('**預期為 false 但實際為 true 筆數**: ' + productExpectedFalseActualTrue);
    lines.push('');
    lines.push('|產品單元章節 Id|預期 hasChildren|實際 hasChildren|');
    lines.push('|---|---|---|');
    productSamples.forEach((sample) => {
        lines.push('|' + sample.id + '|' + String(sample.expected) + '|' + sample.actual + '|');
    });

    // 向度資訊：驗證 depth 與 parentId
    let dimensionChecked = 0;
    let depthMismatch = 0;
    let parentMismatch = 0;
    const dimensionSamples: Array<{
        id: string;
        expectedDepth: number;
        actualDepth: string;
        expectedParentId: string;
        actualParentId: string;
    }> = [];

    const dimensionCursor = db
        .collection('DimensionValues')
        .find({}, { projection: { _id: 1, path: 1, depth: 1, parentId: 1 } })
        .batchSize(2000);

    for await (const doc of dimensionCursor) {
        dimensionChecked += 1;
        const id = doc._id ? String(doc._id) : '未知';
        const pathList = normalizePath(doc.path);
        const expectedDepth = pathList.length;
        const expectedParentId = pathList.length > 0 ? pathList[pathList.length - 1] : '';
        const actualDepth = typeof doc.depth === 'number' ? doc.depth : null;
        const actualParentId = doc.parentId ? String(doc.parentId) : '';

        const depthIsMismatch = actualDepth === null || actualDepth !== expectedDepth;
        const parentIsMismatch = actualParentId !== expectedParentId;

        if (depthIsMismatch) {
            depthMismatch += 1;
        }
        if (parentIsMismatch) {
            parentMismatch += 1;
        }

        if ((depthIsMismatch || parentIsMismatch) && dimensionSamples.length < SAMPLE_LIMIT) {
            dimensionSamples.push({
                id,
                expectedDepth,
                actualDepth: actualDepth === null ? '缺失' : String(actualDepth),
                expectedParentId: expectedParentId || '（空）',
                actualParentId: actualParentId || '（空）',
            });
        }
    }

    lines.push('');
    lines.push('## 向度資訊（depth / parentId）');
    lines.push('');
    lines.push('**檢查筆數**: ' + dimensionChecked);
    lines.push('**depth 不一致筆數**: ' + depthMismatch);
    lines.push('**parentId 不一致筆數**: ' + parentMismatch);
    lines.push('');
    lines.push('|向度資訊 Id|預期 depth|實際 depth|預期 parentId|實際 parentId|');
    lines.push('|---|---:|---:|---|---|');
    dimensionSamples.forEach((sample) => {
        lines.push(
            '|' +
                sample.id +
                '|' +
                sample.expectedDepth +
                '|' +
                sample.actualDepth +
                '|' +
                sample.expectedParentId +
                '|' +
                sample.actualParentId +
                '|'
        );
    });

    lines.push('');
    lines.push('## 課本章節');
    lines.push('');
    lines.push('課本章節沒有 depth / hasChildren / parentId 欄位，因此僅能依 path 推算結構，無可比對欄位。');

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：已輸出驗證結果');
    console.log('✓ 結果已寫入：' + outputPath);
});
