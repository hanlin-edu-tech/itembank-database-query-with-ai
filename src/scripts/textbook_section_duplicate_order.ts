/**
 * 原始需求：調查同一個課本章節表中有相同順序的資料，並提供重複清單與統計。
 * 腳本功能：找出課本章節在同一個課本章節表內 orderIndex 重複的情況，輸出摘要與明細。
 * 腳本原理：以課本章節表 Id + orderIndex 分組，篩出筆數大於 1 的群組，再彙整統計與列出明細。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'textbook_section_duplicate_order.md';

withDB(async (db: Db) => {
    const duplicates = await db
        .collection('TextbookSections')
        .aggregate([
            {
                $group: {
                    _id: {
                        textbookContentId: '$textbookContentId',
                        orderIndexNormalized: {
                            $ifNull: [{ $toString: '$orderIndex' }, 'null'],
                        },
                    },
                    count: { $sum: 1 },
                    sectionIds: { $push: '$_id' },
                    sectionNames: { $push: '$name' },
                    rawOrderIndexes: { $addToSet: '$orderIndex' },
                },
            },
            { $match: { count: { $gt: 1 } } },
            {
                $project: {
                    _id: 0,
                    textbookContentId: '$_id.textbookContentId',
                    orderIndex: '$_id.orderIndexNormalized',
                    count: 1,
                    sectionIds: 1,
                    sectionNames: 1,
                    rawOrderIndexes: 1,
                },
            },
            { $sort: { count: -1, textbookContentId: 1, orderIndex: 1 } },
        ])
        .toArray();

    const totalDuplicateGroups = duplicates.length;
    const totalDuplicateDocuments = duplicates.reduce((sum, item) => sum + item.count, 0);

    const lines: string[] = [];
    lines.push('# 課本章節重複順序調查');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**重複群組數**: ' + totalDuplicateGroups);
    lines.push('**涉及課本章節筆數**: ' + totalDuplicateDocuments);

    lines.push('');
    lines.push('## 重複明細');
    lines.push('');
    lines.push('|課本章節表 Id|orderIndex(正規化)|原始 orderIndex 值|重複數量|章節 Id 清單|章節名稱清單|');
    lines.push('|---|---|---|---:|---|---|');

    duplicates.forEach((item: any) => {
        const sectionIds = Array.isArray(item.sectionIds) ? item.sectionIds.join(', ') : '';
        const sectionNames = Array.isArray(item.sectionNames) ? item.sectionNames.join(', ') : '';
        const rawIndexes = Array.isArray(item.rawOrderIndexes) ? item.rawOrderIndexes.join(', ') : '';
        lines.push(
            '|' +
                (item.textbookContentId || '未知') +
                '|' +
                (item.orderIndex ?? '未知') +
                '|' +
                (rawIndexes || '未知') +
                '|' +
                item.count +
                '|' +
                sectionIds +
                '|' +
                sectionNames +
                '|'
        );
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：共找到 ' + totalDuplicateGroups + ' 個重複順序群組');
    console.log('✓ 結果已寫入：' + outputPath);
});
