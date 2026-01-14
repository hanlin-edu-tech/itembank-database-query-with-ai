/**
 * 原始需求：查出已被 archived 的向度資訊有哪些仍被使用，並提供依來源與依學程/科目的統計（含唯一向度數）。
 * 腳本功能：統計 archived 向度資訊在各資料來源中的使用情況，並彙整學程與科目分布。
 * 腳本原理：先找出 archived 的向度資訊 Id，再逐一掃描引用來源，計算引用筆數與唯一向度數，並依學程/科目分組彙整。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

type GroupStats = {
    docCount: number;
    referenceCount: number;
    dimensionIdSet: Set<string>;
    bodyOfKnowledgeId?: string;
    subjectId?: string;
};

type SourceStats = {
    label: string;
    docCount: number;
    referenceCount: number;
    dimensionIdSet: Set<string>;
    byBodySubject: Map<string, GroupStats>;
};

type NameMap = {
    name: string;
    subjectId?: string;
};

const OUTPUT_FILE_NAME = 'archived_dimension_usage.md';

function getMatchingIds(value: unknown, archivedSet: Set<string>): string[] {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter((id) => typeof id === 'string' && archivedSet.has(id));
    }
    if (typeof value === 'string' && archivedSet.has(value)) {
        return [value];
    }
    return [];
}

function ensureGroup(map: Map<string, GroupStats>, bodyOfKnowledgeId?: string, subjectId?: string): GroupStats {
    const bodyKey = bodyOfKnowledgeId || '未知';
    const subjectKey = subjectId || '未知';
    const key = bodyKey + '::' + subjectKey;
    const existing = map.get(key);
    if (existing) {
        return existing;
    }
    const created: GroupStats = {
        docCount: 0,
        referenceCount: 0,
        dimensionIdSet: new Set<string>(),
        bodyOfKnowledgeId: bodyOfKnowledgeId || '未知',
        subjectId: subjectId || '未知',
    };
    map.set(key, created);
    return created;
}

function updateStats(stats: SourceStats, matchingIds: string[], bodyOfKnowledgeId?: string, subjectId?: string): void {
    if (matchingIds.length === 0) {
        return;
    }
    const uniqueMatchingIds = Array.from(new Set(matchingIds));
    stats.docCount += 1;
    stats.referenceCount += uniqueMatchingIds.length;
    uniqueMatchingIds.forEach((id) => stats.dimensionIdSet.add(id));

    if (bodyOfKnowledgeId || subjectId) {
        const group = ensureGroup(stats.byBodySubject, bodyOfKnowledgeId, subjectId);
        group.docCount += 1;
        group.referenceCount += uniqueMatchingIds.length;
        uniqueMatchingIds.forEach((id) => group.dimensionIdSet.add(id));
    }
}

function mapToSortedRows(map: Map<string, GroupStats>): GroupStats[] {
    return Array.from(map.values()).sort((a, b) => {
        if (b.docCount !== a.docCount) {
            return b.docCount - a.docCount;
        }
        return b.referenceCount - a.referenceCount;
    });
}

withDB(async (db: Db) => {
    const archivedDimensionValues = await db
        .collection('DimensionValues')
        .find({ archived: true }, { projection: { _id: 1, name: 1, code: 1 } })
        .toArray();

    const archivedIds = archivedDimensionValues.map((item) => String(item._id));
    const archivedIdSet = new Set(archivedIds);

    const lines: string[] = [];
    lines.push('# 已被 archived 的向度資訊使用統計');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**archived 向度資訊總數**: ' + archivedIds.length);

    if (archivedIds.length === 0) {
        lines.push('');
        lines.push('目前沒有 archived 的向度資訊。');
        const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
        fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
        console.log('✓ 查詢完成：archived 向度資訊為 0');
        console.log('✓ 結果已寫入：' + outputPath);
        return;
    }

    const bodyMap = new Map<string, NameMap>();
    const bodiesOfKnowledge = await db
        .collection('BodiesOfKnowledge')
        .find({}, { projection: { _id: 1, name: 1, subjectId: 1 } })
        .toArray();
    bodiesOfKnowledge.forEach((item) => {
        bodyMap.set(String(item._id), {
            name: item.name || '未命名',
            subjectId: item.subjectId ? String(item.subjectId) : undefined,
        });
    });

    const subjectMap = new Map<string, NameMap>();
    const subjects = await db.collection('Subjects').find({}, { projection: { _id: 1, name: 1 } }).toArray();
    subjects.forEach((item) => {
        subjectMap.set(String(item._id), { name: item.name || '未命名' });
    });

    const productContentMap = new Map<string, { bodyOfKnowledgeId?: string; subjectId?: string }>();
    const productContents = await db
        .collection('ProductContents')
        .find({}, { projection: { _id: 1, bodyOfKnowledgeId: 1, subjectId: 1 } })
        .toArray();
    productContents.forEach((item) => {
        productContentMap.set(String(item._id), {
            bodyOfKnowledgeId: item.bodyOfKnowledgeId ? String(item.bodyOfKnowledgeId) : undefined,
            subjectId: item.subjectId ? String(item.subjectId) : undefined,
        });
    });

    const textbookContentMap = new Map<string, string>();
    const textbookContents = await db
        .collection('TextbookContents')
        .find({}, { projection: { _id: 1, volumeId: 1 } })
        .toArray();
    textbookContents.forEach((item) => {
        if (item.volumeId) {
            textbookContentMap.set(String(item._id), String(item.volumeId));
        }
    });

    const volumeMap = new Map<string, { bodyOfKnowledgeId?: string; subjectId?: string }>();
    const volumes = await db
        .collection('Volumes')
        .find({}, { projection: { _id: 1, bodyOfKnowledgeId: 1, subjectId: 1 } })
        .toArray();
    volumes.forEach((item) => {
        volumeMap.set(String(item._id), {
            bodyOfKnowledgeId: item.bodyOfKnowledgeId ? String(item.bodyOfKnowledgeId) : undefined,
            subjectId: item.subjectId ? String(item.subjectId) : undefined,
        });
    });

    const sources: Array<{
        label: string;
        collectionName: string;
        fieldName: string;
        projection: Record<string, number>;
        resolveBodySubject?: (doc: any) => { bodyOfKnowledgeId?: string; subjectId?: string };
    }> = [
        {
            label: '向度資訊：路徑欄位',
            collectionName: 'DimensionValues',
            fieldName: 'path',
            projection: { _id: 1, path: 1 },
        },
        {
            label: '向度資訊：上層 Id',
            collectionName: 'DimensionValues',
            fieldName: 'parentId',
            projection: { _id: 1, parentId: 1 },
        },
        {
            label: '題目學年向度資訊：向度資訊 Id',
            collectionName: 'ItemYearDimensionValues',
            fieldName: 'dimensionValueId',
            projection: { _id: 1, dimensionValueId: 1, bodyOfKnowledgeId: 1 },
            resolveBodySubject: (doc: any) => {
                const bodyOfKnowledgeId = doc.bodyOfKnowledgeId ? String(doc.bodyOfKnowledgeId) : undefined;
                const bodyInfo = bodyOfKnowledgeId ? bodyMap.get(bodyOfKnowledgeId) : undefined;
                return {
                    bodyOfKnowledgeId,
                    subjectId: bodyInfo ? bodyInfo.subjectId : undefined,
                };
            },
        },
        {
            label: '產品單元章節：向度資訊 Id 清單',
            collectionName: 'ProductSections',
            fieldName: 'dimensionValueIds',
            projection: { _id: 1, dimensionValueIds: 1, productContentId: 1 },
            resolveBodySubject: (doc: any) => {
                const productContentId = doc.productContentId ? String(doc.productContentId) : undefined;
                if (!productContentId) {
                    return {};
                }
                const info = productContentMap.get(productContentId);
                return info || {};
            },
        },
        {
            label: '產品單元章節元資料：最大族譜向度資訊 Id 清單',
            collectionName: 'ItemMapping.ProductSectionMetadatas',
            fieldName: 'maxPedisgreeDimensionValueIds',
            projection: { _id: 1, maxPedisgreeDimensionValueIds: 1, productContentId: 1 },
            resolveBodySubject: (doc: any) => {
                const productContentId = doc.productContentId ? String(doc.productContentId) : undefined;
                if (!productContentId) {
                    return {};
                }
                const info = productContentMap.get(productContentId);
                return info || {};
            },
        },
        {
            label: '產品單元章節元資料：族譜向度資訊 Id 清單',
            collectionName: 'ItemMapping.ProductSectionMetadatas',
            fieldName: 'pedisgreeDimensionValueIds',
            projection: { _id: 1, pedisgreeDimensionValueIds: 1, productContentId: 1 },
            resolveBodySubject: (doc: any) => {
                const productContentId = doc.productContentId ? String(doc.productContentId) : undefined;
                if (!productContentId) {
                    return {};
                }
                const info = productContentMap.get(productContentId);
                return info || {};
            },
        },
        {
            label: '課本章節：向度資訊 Id 清單',
            collectionName: 'TextbookSections',
            fieldName: 'dimensionValueIds',
            projection: { _id: 1, dimensionValueIds: 1, textbookContentId: 1 },
            resolveBodySubject: (doc: any) => {
                const textbookContentId = doc.textbookContentId ? String(doc.textbookContentId) : undefined;
                if (!textbookContentId) {
                    return {};
                }
                const volumeId = textbookContentMap.get(textbookContentId);
                if (!volumeId) {
                    return {};
                }
                const info = volumeMap.get(volumeId);
                return info || {};
            },
        },
    ];

    const sourceStatsList: SourceStats[] = [];
    const usedArchivedIdSet = new Set<string>();

    for (const source of sources) {
        const stats: SourceStats = {
            label: source.label,
            docCount: 0,
            referenceCount: 0,
            dimensionIdSet: new Set<string>(),
            byBodySubject: new Map<string, GroupStats>(),
        };

        const query = {
            [source.fieldName]: { $in: archivedIds },
        } as Record<string, unknown>;

        const cursor = db.collection(source.collectionName).find(query, { projection: source.projection });

        for await (const doc of cursor) {
            const matchingIds = getMatchingIds(doc[source.fieldName], archivedIdSet);
            if (matchingIds.length === 0) {
                continue;
            }
            const resolved = source.resolveBodySubject ? source.resolveBodySubject(doc) : {};
            updateStats(stats, matchingIds, resolved.bodyOfKnowledgeId, resolved.subjectId);
            matchingIds.forEach((id) => usedArchivedIdSet.add(id));
        }

        sourceStatsList.push(stats);
    }

    lines.push('**有被使用的 archived 向度資訊數**: ' + usedArchivedIdSet.size);
    lines.push('');
    lines.push('## 依來源統計');
    lines.push('');
    lines.push('|來源|引用文件數|引用次數|唯一向度數|');
    lines.push('|---|---:|---:|---:|');
    sourceStatsList.forEach((stats) => {
        lines.push(
            '|' +
                stats.label +
                '|' +
                stats.docCount +
                '|' +
                stats.referenceCount +
                '|' +
                stats.dimensionIdSet.size +
                '|'
        );
    });

    sourceStatsList.forEach((stats) => {
        if (stats.byBodySubject.size === 0) {
            return;
        }
        lines.push('');
        lines.push('## 依學程/科目統計 - ' + stats.label);
        lines.push('');
        lines.push('|學程 Id|學程名稱|科目 Id|科目名稱|引用文件數|引用次數|唯一向度數|');
        lines.push('|---|---|---|---|---:|---:|---:|');

        const rows = mapToSortedRows(stats.byBodySubject);
        rows.forEach((row) => {
            const bodyName = row.bodyOfKnowledgeId ? bodyMap.get(row.bodyOfKnowledgeId)?.name : undefined;
            const subjectName = row.subjectId ? subjectMap.get(row.subjectId)?.name : undefined;
            lines.push(
                '|' +
                    (row.bodyOfKnowledgeId || '未知') +
                    '|' +
                    (bodyName || '未知') +
                    '|' +
                    (row.subjectId || '未知') +
                    '|' +
                    (subjectName || '未知') +
                    '|' +
                    row.docCount +
                    '|' +
                    row.referenceCount +
                    '|' +
                    row.dimensionIdSet.size +
                    '|'
            );
        });
    });

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('備註：');
    lines.push('- 「引用文件數」表示含有 archived 向度資訊的文件筆數。');
    lines.push('- 「引用次數」表示文件內命中 archived 向度資訊的次數（已去除重複 Id）。');

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：共找到 ' + usedArchivedIdSet.size + ' 個 archived 向度資訊被使用');
    console.log('✓ 結果已寫入：' + outputPath);
});
