/**
 * 原始需求：檢查同一題目在不同年度的子題數量是否不同（以 questionIndex 去重數量計算）。
 * 腳本功能：統計題目在不同年度的子題數量差異，輸出統計與前 20 筆明細。
 * 腳本原理：依 itemId + year 聚合 questionIndex 去重數量，再找出同一題目跨年度的數量不一致情況。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'item_year_question_index_mismatch.md';
const SAMPLE_LIMIT = 20;

withDB(async (db: Db) => {
    const results = await db
        .collection('ItemYearDimensionValues')
        .aggregate(
            [
                {
                    $group: {
                        _id: {
                            itemId: '$itemId',
                            year: '$year',
                        },
                        questionIndexes: { $addToSet: '$questionIndex' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        itemId: '$_id.itemId',
                        year: '$_id.year',
                        questionCount: { $size: '$questionIndexes' },
                    },
                },
                {
                    $group: {
                        _id: '$itemId',
                        yearStats: {
                            $push: {
                                year: '$year',
                                questionCount: '$questionCount',
                            },
                        },
                        distinctCounts: { $addToSet: '$questionCount' },
                    },
                },
                {
                    $match: {
                        $expr: { $gt: [{ $size: '$distinctCounts' }, 1] },
                    },
                },
                {
                    $facet: {
                        summary: [
                            {
                                $group: {
                                    _id: null,
                                    itemCount: { $sum: 1 },
                                },
                            },
                            { $project: { _id: 0, itemCount: 1 } },
                        ],
                        samples: [
                            { $sort: { _id: 1 } },
                            { $limit: SAMPLE_LIMIT },
                        ],
                    },
                },
            ],
            { allowDiskUse: true }
        )
        .toArray();

    const summary = results[0]?.summary?.[0] || { itemCount: 0 };
    const samples = results[0]?.samples || [];

    const lines: string[] = [];
    lines.push('# 題目跨年度子題數量不一致清單');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**不一致題目數**: ' + summary.itemCount);
    lines.push('');

    lines.push('## 前 20 筆明細');
    lines.push('');
    lines.push('|題目 Id|年度-子題數量清單|');
    lines.push('|---|---|');

    samples.forEach((sample: any) => {
        const yearStats = Array.isArray(sample.yearStats)
            ? sample.yearStats
                  .map((stat: any) => `${stat.year}:${stat.questionCount}`)
                  .sort()
                  .join(', ')
            : '';
        lines.push('|' + sample._id + '|' + yearStats + '|');
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：不一致題目數 ' + summary.itemCount);
    console.log('✓ 結果已寫入：' + outputPath);
});
