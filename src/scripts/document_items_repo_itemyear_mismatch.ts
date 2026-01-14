/**
 * 原始需求：確認題目關聯的五欄檔案儲存庫與題目學年向度資訊的學程是否對不上，僅需統計資訊與前 20 筆明細。
 * 腳本功能：找出學程缺失或不一致的題目關聯資料，輸出統計與樣本。
 * 腳本原理：先建立文件與儲存庫對照表，再以 itemId 批次查詢題目學年學程並逐批比對，支援續跑。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'document_items_repo_itemyear_mismatch.md';
const CHECKPOINT_FILE_NAME = 'document_items_repo_itemyear_mismatch_checkpoint.json';
const SAMPLE_LIMIT = 20;
const BATCH_SIZE = 5000;
const CHECKPOINT_SAVE_INTERVAL = 5;

const args = process.argv.slice(2);
const maxBatchesIndex = args.indexOf('--max-batches');
const maxBatches = maxBatchesIndex >= 0 ? Number(args[maxBatchesIndex + 1]) : null;
const finalizeIndex = args.indexOf('--finalize-only');
const finalizeOnly = finalizeIndex >= 0;
const startDateIndex = args.indexOf('--start-date');
const endDateIndex = args.indexOf('--end-date');
const startDateInput = startDateIndex >= 0 ? args[startDateIndex + 1] : null;
const endDateInput = endDateIndex >= 0 ? args[endDateIndex + 1] : null;
const startDate = startDateInput ? new Date(startDateInput) : null;
const endDate = endDateInput ? new Date(endDateInput) : null;

type ReasonStats = {
    count: number;
    itemIds: Set<string>;
};

type SampleRow = {
    documentItemId: string;
    itemId: string;
    documentId: string;
    documentRepoId: string;
    repoBodyOfKnowledgeId: string;
    itemYearBodies: string[];
    mismatchReason: string;
};

type DocumentItemRow = {
    documentItemId: string;
    itemId: string;
    documentId: string;
};

type Checkpoint = {
    lastDocumentItemId?: string;
    documentItemCount: number;
    allItemIds: string[];
    reasonStats: Record<string, { count: number; itemIds: string[] }>;
    samples: SampleRow[];
};

function loadCheckpoint(filePath: string): Checkpoint | null {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) {
        return null;
    }
    return JSON.parse(raw) as Checkpoint;
}

function saveCheckpoint(filePath: string, checkpoint: Checkpoint): void {
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

withDB(async (db: Db) => {
    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    const checkpointPath = path.join(__dirname, '../outputs/' + CHECKPOINT_FILE_NAME);

    const checkpoint = loadCheckpoint(checkpointPath);
    const lastDocumentItemId = checkpoint?.lastDocumentItemId;

    if (finalizeOnly) {
        if (!checkpoint) {
            console.log('找不到續跑檔案，無法輸出暫存結果');
            return;
        }
    }

    const reasonStats = new Map<string, ReasonStats>();
    if (checkpoint?.reasonStats) {
        Object.keys(checkpoint.reasonStats).forEach((reason) => {
            const stat = checkpoint.reasonStats[reason];
            reasonStats.set(reason, { count: stat.count, itemIds: new Set(stat.itemIds || []) });
        });
    }

    const allItemIds = new Set<string>(checkpoint?.allItemIds || []);
    const samples: SampleRow[] = checkpoint?.samples || [];
    let documentItemCount = checkpoint?.documentItemCount || 0;

    if (checkpoint) {
        console.log('已讀取續跑檔案，從 documentItemId ' + (lastDocumentItemId || '起始') + ' 開始');
    }

    if (finalizeOnly) {
        const lines: string[] = [];
        lines.push('# 題目關聯儲存庫與題目學程不一致統計');
        lines.push('');
        lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
        lines.push('**不一致文件題目筆數**: ' + documentItemCount);
        lines.push('**涉及題目數**: ' + allItemIds.size);
        lines.push('');

        lines.push('## 不一致類型統計');
        lines.push('');
        lines.push('|不一致類型|文件題目筆數|涉及題目數|');
        lines.push('|---|---:|---:|');
        reasonStats.forEach((stat, reason) => {
            lines.push('|' + reason + '|' + stat.count + '|' + stat.itemIds.size + '|');
        });

        lines.push('');
        lines.push('## 前 20 筆明細');
        lines.push('');
        lines.push('|文件題目 Id|題目 Id|五欄檔案 Id|五欄檔案儲存庫 Id|儲存庫學程 Id|題目學程 Id 清單|不一致原因|');
        lines.push('|---|---|---|---|---|---|---|');
        samples.forEach((sample) => {
            lines.push(
                '|' +
                    sample.documentItemId +
                    '|' +
                    sample.itemId +
                    '|' +
                    sample.documentId +
                    '|' +
                    sample.documentRepoId +
                    '|' +
                    sample.repoBodyOfKnowledgeId +
                    '|' +
                    sample.itemYearBodies.join(', ') +
                    '|' +
                    sample.mismatchReason +
                    '|'
            );
        });

        fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
        console.log('✓ 已輸出暫存結果：' + outputPath);
        return;
    }

    const repoBodyMap = new Map<string, string>();
    let repoCount = 0;

    const repoCursor = db
        .collection('DocumentRepositories')
        .find({}, { projection: { _id: 1, bodyOfKnowledgeId: 1 } })
        .batchSize(2000);

    for await (const repo of repoCursor) {
        repoCount += 1;
        const repoId = repo._id ? String(repo._id) : '未知';
        const bodyId = repo.bodyOfKnowledgeId ? String(repo.bodyOfKnowledgeId) : '';
        repoBodyMap.set(repoId, bodyId);
    }

    console.log('已載入儲存庫 ' + repoCount + ' 筆');

    const documentRepoMap = new Map<string, string>();
    let documentCount = 0;

    const documentCursor = db
        .collection('Documents')
        .find({}, { projection: { _id: 1, documentRepoId: 1 } })
        .batchSize(2000);

    for await (const doc of documentCursor) {
        documentCount += 1;
        const documentId = doc._id ? String(doc._id) : '未知';
        const repoId = doc.documentRepoId ? String(doc.documentRepoId) : '';
        documentRepoMap.set(documentId, repoId);
    }

    console.log('已載入文件 ' + documentCount + ' 筆');

    let scannedDocumentItems = 0;
    let batchIndex = 0;
    let batchesSinceSave = 0;
    let lastProcessedId: string | undefined = lastDocumentItemId;

    const batchRows: DocumentItemRow[] = [];
    const batchItemIds = new Set<string>();

    async function processBatch(rows: DocumentItemRow[], itemIds: Set<string>): Promise<void> {
        if (rows.length === 0) {
            return;
        }
        batchIndex += 1;
        const itemIdList = Array.from(itemIds);
        console.log('開始處理批次 ' + batchIndex + '，itemId 數量 ' + itemIdList.length + '，題目筆數 ' + rows.length);

        const itemYearMap = new Map<string, Set<string>>();
        const itemYearCursor = db
            .collection('ItemYearDimensionValues')
            .find({ itemId: { $in: itemIdList as any } }, { projection: { itemId: 1, bodyOfKnowledgeId: 1 } })
            .batchSize(2000);

        for await (const row of itemYearCursor) {
            const itemId = row.itemId ? String(row.itemId) : '未知';
            const bodyId = row.bodyOfKnowledgeId ? String(row.bodyOfKnowledgeId) : '';
            if (!bodyId) {
                continue;
            }
            const existing = itemYearMap.get(itemId);
            if (existing) {
                existing.add(bodyId);
            } else {
                itemYearMap.set(itemId, new Set([bodyId]));
            }
        }

        rows.forEach((row) => {
            const repoId = documentRepoMap.get(row.documentId) || '';
            const repoBodyId = repoBodyMap.get(repoId) || '';
            const itemYearBodies = itemYearMap.get(row.itemId);

            if (!repoId || !repoBodyId) {
                return;
            }
            if (!itemYearBodies || itemYearBodies.size === 0) {
                return;
            }
            if (!itemYearBodies.has(repoBodyId)) {
                const mismatchReason = '儲存庫學程與題目學程不一致';
                documentItemCount += 1;
                allItemIds.add(row.itemId);
                const stat = reasonStats.get(mismatchReason) || { count: 0, itemIds: new Set<string>() };
                stat.count += 1;
                stat.itemIds.add(row.itemId);
                reasonStats.set(mismatchReason, stat);

                if (samples.length < SAMPLE_LIMIT) {
                    samples.push({
                        documentItemId: row.documentItemId,
                        itemId: row.itemId,
                        documentId: row.documentId,
                        documentRepoId: repoId,
                        repoBodyOfKnowledgeId: repoBodyId,
                        itemYearBodies: itemYearBodies ? Array.from(itemYearBodies) : [],
                        mismatchReason,
                    });
                }
            }

            return;
        });
    }

    const documentItemQuery: any = lastDocumentItemId
        ? { _id: { $gt: lastDocumentItemId } }
        : {};

    if (startDate || endDate) {
        documentItemQuery.addedOn = {};
        if (startDate) {
            documentItemQuery.addedOn.$gte = startDate;
        }
        if (endDate) {
            documentItemQuery.addedOn.$lt = endDate;
        }
    }

    const documentItemCursor = db
        .collection('DocumentItems')
        .find(documentItemQuery, { projection: { _id: 1, itemId: 1, documentId: 1, addedOn: 1 } })
        .sort({ _id: 1 })
        .batchSize(2000);

    for await (const row of documentItemCursor) {
        scannedDocumentItems += 1;
        if (scannedDocumentItems % 200000 === 0) {
            console.log('已掃描文件題目 ' + scannedDocumentItems + ' 筆');
        }

        const documentItemId = row._id ? String(row._id) : '未知';
        const itemId = row.itemId ? String(row.itemId) : '未知';
        const documentId = row.documentId ? String(row.documentId) : '';

        batchRows.push({ documentItemId, itemId, documentId });
        batchItemIds.add(itemId);
        lastProcessedId = documentItemId;

        if (batchItemIds.size >= BATCH_SIZE) {
            await processBatch(batchRows, batchItemIds);
            batchRows.length = 0;
            batchItemIds.clear();

            batchesSinceSave += 1;
            if (batchesSinceSave >= CHECKPOINT_SAVE_INTERVAL) {
                const checkpointData: Checkpoint = {
                    lastDocumentItemId: lastProcessedId,
                    documentItemCount,
                    allItemIds: Array.from(allItemIds),
                    reasonStats: Array.from(reasonStats.entries()).reduce(
                        (acc, [reason, stat]) => {
                            acc[reason] = { count: stat.count, itemIds: Array.from(stat.itemIds) };
                            return acc;
                        },
                        {} as Record<string, { count: number; itemIds: string[] }>
                    ),
                    samples,
                };
                saveCheckpoint(checkpointPath, checkpointData);
                console.log('已寫入續跑檔案，documentItemId ' + (lastProcessedId || '未知'));
                batchesSinceSave = 0;
            }

            if (maxBatches !== null && batchIndex >= maxBatches) {
                console.log('已達 max-batches 限制，停止掃描');
                break;
            }
        }
    }

    await processBatch(batchRows, batchItemIds);

    const finalCheckpoint: Checkpoint = {
        lastDocumentItemId: lastProcessedId,
        documentItemCount,
        allItemIds: Array.from(allItemIds),
        reasonStats: Array.from(reasonStats.entries()).reduce(
            (acc, [reason, stat]) => {
                acc[reason] = { count: stat.count, itemIds: Array.from(stat.itemIds) };
                return acc;
            },
            {} as Record<string, { count: number; itemIds: string[] }>
        ),
        samples,
    };
    saveCheckpoint(checkpointPath, finalCheckpoint);

    const lines: string[] = [];
    lines.push('# 題目關聯儲存庫與題目學程不一致統計');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**不一致文件題目筆數**: ' + documentItemCount);
    lines.push('**涉及題目數**: ' + allItemIds.size);
    lines.push('');

    lines.push('## 不一致類型統計');
    lines.push('');
    lines.push('|不一致類型|文件題目筆數|涉及題目數|');
    lines.push('|---|---:|---:|');
    reasonStats.forEach((stat, reason) => {
        lines.push('|' + reason + '|' + stat.count + '|' + stat.itemIds.size + '|');
    });

    if (reasonStats.size === 0) {
        lines.push('|（無）|0|0|');
    }

    lines.push('');
    lines.push('## 前 20 筆明細');
    lines.push('');
    lines.push('|文件題目 Id|題目 Id|五欄檔案 Id|五欄檔案儲存庫 Id|儲存庫學程 Id|題目學程 Id 清單|不一致原因|');
    lines.push('|---|---|---|---|---|---|---|');
    samples.forEach((sample) => {
        lines.push(
            '|' +
                sample.documentItemId +
                '|' +
                sample.itemId +
                '|' +
                sample.documentId +
                '|' +
                sample.documentRepoId +
                '|' +
                sample.repoBodyOfKnowledgeId +
                '|' +
                sample.itemYearBodies.join(', ') +
                '|' +
                sample.mismatchReason +
                '|'
        );
    });

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：不一致文件題目筆數 ' + documentItemCount);
    console.log('✓ 結果已寫入：' + outputPath);
});
