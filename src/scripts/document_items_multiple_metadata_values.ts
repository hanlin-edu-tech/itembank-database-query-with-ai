/**
 * 原始需求：幫我看看五欄檔案題目中是否有多個出處或是多個題型的情況。
 * 腳本功能：只找出「同一筆五欄檔案題目」存在多個不同出處或多個不同題型的資料，並輸出統計與樣本。
 * 腳本原理：使用聚合查詢在資料庫端計算出處/題型的去重後數量（避免全量掃描後再由程式過濾），只回傳符合「去重後數量 > 1」的資料。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'document_items_multiple_metadata_values.md';
const SAMPLE_LIMIT = 100;

type Summary = {
    totalMultiCount: number;
    multiSourceCount: number;
    multiUserTypeCount: number;
};

type SampleRow = {
    documentItemId: string;
    documentId: string;
    itemId: string;
    sourceDistinctCount: number;
    sourceDistinctValueIds: string[];
    userTypeDistinctCount: number;
    userTypeDistinctValueIds: string[];
};

function formatIdList(ids: string[]): string {
    if (!Array.isArray(ids) || ids.length === 0) {
        return '';
    }
    return ids.map((id) => '`' + id + '`').join(', ');
}

withDB(async (db: Db) => {
    const pipeline: any[] = [
        {
            $match: {
                'metadataList.metadataType': { $in: ['source', 'userType'] },
            },
        },
        {
            $project: {
                _id: 0,
                documentItemId: { $toString: '$_id' },
                documentId: 1,
                itemId: 1,
                sourceValueIds: {
                    $map: {
                        input: {
                            $filter: {
                                input: '$metadataList',
                                as: 'm',
                                cond: { $eq: ['$$m.metadataType', 'source'] },
                            },
                        },
                        as: 'm',
                        in: { $ifNull: ['$$m.metadataValueId', ''] },
                    },
                },
                userTypeValueIds: {
                    $map: {
                        input: {
                            $filter: {
                                input: '$metadataList',
                                as: 'm',
                                cond: { $eq: ['$$m.metadataType', 'userType'] },
                            },
                        },
                        as: 'm',
                        in: { $ifNull: ['$$m.metadataValueId', ''] },
                    },
                },
            },
        },
        {
            $addFields: {
                sourceDistinctValueIds: {
                    $setDifference: [{ $setUnion: ['$sourceValueIds', []] }, ['']],
                },
                userTypeDistinctValueIds: {
                    $setDifference: [{ $setUnion: ['$userTypeValueIds', []] }, ['']],
                },
            },
        },
        {
            $addFields: {
                sourceDistinctCount: { $size: '$sourceDistinctValueIds' },
                userTypeDistinctCount: { $size: '$userTypeDistinctValueIds' },
            },
        },
        {
            $match: {
                $expr: {
                    $or: [
                        { $gt: ['$sourceDistinctCount', 1] },
                        { $gt: ['$userTypeDistinctCount', 1] },
                    ],
                },
            },
        },
        {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            totalMultiCount: { $sum: 1 },
                            multiSourceCount: {
                                $sum: {
                                    $cond: [{ $gt: ['$sourceDistinctCount', 1] }, 1, 0],
                                },
                            },
                            multiUserTypeCount: {
                                $sum: {
                                    $cond: [{ $gt: ['$userTypeDistinctCount', 1] }, 1, 0],
                                },
                            },
                        },
                    },
                    {
                        $project: {
                            _id: 0,
                            totalMultiCount: 1,
                            multiSourceCount: 1,
                            multiUserTypeCount: 1,
                        },
                    },
                ],
                samples: [
                    { $sort: { sourceDistinctCount: -1, userTypeDistinctCount: -1, documentItemId: 1 } },
                    { $limit: SAMPLE_LIMIT },
                    {
                        $project: {
                            _id: 0,
                            documentItemId: 1,
                            documentId: 1,
                            itemId: 1,
                            sourceDistinctCount: 1,
                            sourceDistinctValueIds: 1,
                            userTypeDistinctCount: 1,
                            userTypeDistinctValueIds: 1,
                        },
                    },
                ],
            },
        },
    ];

    const results = await db
        .collection('DocumentItems')
        .aggregate(pipeline, {
            allowDiskUse: true,
            hint: {
                'metadataList.metadataType': 1,
                'metadataList.metadataValueId': 1,
            },
        })
        .toArray();

    const summary: Summary = results[0]?.summary?.[0] || {
        totalMultiCount: 0,
        multiSourceCount: 0,
        multiUserTypeCount: 0,
    };

    const samples: SampleRow[] = Array.isArray(results[0]?.samples) ? results[0].samples : [];

    const lines: string[] = [];
    lines.push('# 五欄檔案題目多出處/多題型檢查');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('');

    lines.push('## 統計摘要（僅計入「多個不同值」）');
    lines.push('');
    lines.push('|項目|筆數|');
    lines.push('|---|---:|');
    lines.push('|任一類型多個不同值（出處或題型）|' + summary.totalMultiCount + '|');
    lines.push('|多個不同出處（去重後數量 > 1）|' + summary.multiSourceCount + '|');
    lines.push('|多個不同題型（去重後數量 > 1）|' + summary.multiUserTypeCount + '|');
    lines.push('');

    lines.push('## 100 筆樣本（依不同值數量由大到小）');
    lines.push('');
    lines.push('|五欄檔案題目 Id|五欄檔案 Id|題目 Id|出處(不同值數)|出處 Id 清單|題型(不同值數)|題型 Id 清單|');
    lines.push('|---|---|---|---:|---|---:|---|');

    samples.forEach((sample) => {
        lines.push(
            '|' +
                '`' +
                sample.documentItemId +
                '`|' +
                '`' +
                String(sample.documentId || '') +
                '`|' +
                '`' +
                String(sample.itemId || '') +
                '`|' +
                sample.sourceDistinctCount +
                '|' +
                formatIdList(sample.sourceDistinctValueIds) +
                '|' +
                sample.userTypeDistinctCount +
                '|' +
                formatIdList(sample.userTypeDistinctValueIds) +
                '|'
        );
    });

    lines.push('');
    lines.push('> 判定方式：同一筆五欄檔案題目的出處/題型「去重後數量 > 1」即視為多個。');

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：多個不同值（出處或題型）共 ' + summary.totalMultiCount + ' 筆');
    console.log('✓ 結果已寫入：' + outputPath);
});
