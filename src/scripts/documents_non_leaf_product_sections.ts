/**
 * 原始需求：額外查詢五欄檔案關聯的產品單元章節是否有「非底層節點」的情況。
 *
 * 腳本功能：
 * - 找出所有「五欄檔案」中引用到「非底層（有子節點）」的產品單元章節。
 * - 輸出統計摘要與前 100 筆樣本（包含五欄檔案 Id、資料夾 Id、章節 Id 清單）。
 *
 * 腳本原理：
 * 1) 先從產品單元章節取出 `hasChildren: true` 的章節 Id 清單（視為非底層）。
 * 2) 以串流方式掃描五欄檔案的「產品單元章節 Id 清單」，只要命中上述非底層 Id 即記錄。
 *
 * 判定「非底層節點」：產品單元章節 `hasChildren: true`
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'documents_non_leaf_product_sections.md';
const SAMPLE_LIMIT = 100;
const IDS_PREVIEW_LIMIT = 20;

type SampleRow = {
    documentId: string;
    folderId: string;
    documentName: string;
    nonLeafSectionCount: number;
    nonLeafSectionIds: string[];
};

function uniqueStrings(values: string[]): string[] {
    const set = new Set<string>();
    values.forEach((value) => {
        const normalized = (value || '').trim();
        if (normalized) {
            set.add(normalized);
        }
    });
    return Array.from(set);
}

function incrementCount(map: Map<number, number>, key: number): void {
    map.set(key, (map.get(key) || 0) + 1);
}

function formatIdList(ids: string[]): string {
    if (!Array.isArray(ids) || ids.length === 0) {
        return '';
    }
    const preview = ids.slice(0, IDS_PREVIEW_LIMIT).map((id) => '`' + id + '`').join(', ');
    if (ids.length <= IDS_PREVIEW_LIMIT) {
        return preview;
    }
    return preview + ' ...（共 ' + ids.length + ' 個）';
}

withDB(async (db: Db) => {
    // 1) 取出非底層（有子節點）的章節 Id
    const nonLeafSectionDocs = await db
        .collection<any>('ProductSections')
        .find({ hasChildren: true }, { projection: { _id: 1 } })
        .toArray();

    const nonLeafSectionIds = uniqueStrings(nonLeafSectionDocs.map((doc: any) => (doc?._id ? String(doc._id) : '')));
    const nonLeafSectionIdSet = new Set<string>(nonLeafSectionIds);

    // 2) 掃描五欄檔案，找出引用到非底層章節者
    const cursor = db
        .collection<any>('Documents')
        .find(
            { productSectionIds: { $exists: true, $ne: [] } },
            { projection: { _id: 1, documentRepoId: 1, name: 1, productSectionIds: 1 } }
        )
        .batchSize(2000);

    let scannedDocumentCount = 0;
    let matchedDocumentCount = 0;
    let matchedReferenceCount = 0;

    const referencedNonLeafSectionIds = new Set<string>();
    const nonLeafCountDistribution = new Map<number, number>();

    const samples: SampleRow[] = [];

    for await (const doc of cursor) {
        scannedDocumentCount += 1;
        if (scannedDocumentCount % 20000 === 0) {
            console.log('已掃描 ' + scannedDocumentCount + ' 筆五欄檔案');
        }

        const documentId = doc?._id ? String(doc._id) : '';
        const folderId = doc?.documentRepoId ? String(doc.documentRepoId) : '';
        const documentName = doc?.name ? String(doc.name) : '';
        const productSectionIds = Array.isArray(doc?.productSectionIds)
            ? uniqueStrings(doc.productSectionIds.map((id: any) => String(id)))
            : [];

        if (!documentId || productSectionIds.length === 0) {
            continue;
        }

        const nonLeafSectionIdsInDoc = productSectionIds.filter((sectionId) => nonLeafSectionIdSet.has(sectionId));
        const uniqueNonLeafSectionIdsInDoc = uniqueStrings(nonLeafSectionIdsInDoc);

        if (uniqueNonLeafSectionIdsInDoc.length === 0) {
            continue;
        }

        matchedDocumentCount += 1;
        matchedReferenceCount += uniqueNonLeafSectionIdsInDoc.length;
        incrementCount(nonLeafCountDistribution, uniqueNonLeafSectionIdsInDoc.length);

        uniqueNonLeafSectionIdsInDoc.forEach((id) => referencedNonLeafSectionIds.add(id));

        if (samples.length < SAMPLE_LIMIT) {
            samples.push({
                documentId,
                folderId,
                documentName,
                nonLeafSectionCount: uniqueNonLeafSectionIdsInDoc.length,
                nonLeafSectionIds: uniqueNonLeafSectionIdsInDoc,
            });
        }
    }

    const distKeys = Array.from(nonLeafCountDistribution.keys()).sort((a, b) => a - b);

    const lines: string[] = [];
    lines.push('# 五欄檔案引用非底層產品單元章節檢查');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**非底層判定**: 產品單元章節 `hasChildren: true`');
    lines.push('');

    lines.push('## 統計摘要');
    lines.push('');
    lines.push('|項目|數量|');
    lines.push('|---|---:|');
    lines.push('|非底層章節總數（hasChildren=true）|' + nonLeafSectionIds.length + '|');
    lines.push('|掃描五欄檔案筆數|' + scannedDocumentCount + '|');
    lines.push('|引用到非底層章節的五欄檔案數|' + matchedDocumentCount + '|');
    lines.push('|引用到非底層章節的引用數（檔案內去重）|' + matchedReferenceCount + '|');
    lines.push('|被引用到的非底層章節 Id 去重數|' + referencedNonLeafSectionIds.size + '|');
    lines.push('');

    lines.push('## 分佈：單一檔案命中非底層章節數');
    lines.push('');
    lines.push('|命中數|檔案數|');
    lines.push('|---:|---:|');
    distKeys.forEach((key) => {
        lines.push('|' + key + '|' + (nonLeafCountDistribution.get(key) || 0) + '|');
    });
    lines.push('');

    lines.push('## 100 筆樣本');
    lines.push('');
    lines.push('|五欄檔案 Id|資料夾 Id|五欄檔案名稱|命中數|非底層章節 Id（預覽）|');
    lines.push('|---|---|---|---:|---|');

    samples.forEach((sample) => {
        lines.push(
            '|' +
                '`' +
                sample.documentId +
                '`|' +
                '`' +
                sample.folderId +
                '`|' +
                sample.documentName +
                '|' +
                sample.nonLeafSectionCount +
                '|' +
                formatIdList(sample.nonLeafSectionIds) +
                '|'
        );
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：引用非底層章節的五欄檔案 ' + matchedDocumentCount + ' 筆');
    console.log('✓ 結果已寫入：' + outputPath);
});
