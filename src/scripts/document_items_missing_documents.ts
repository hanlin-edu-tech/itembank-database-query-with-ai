/**
 * 原始需求：確認是否有文件不存在但對應的五欄檔案題目仍存在，僅需統計資訊。
 * 腳本功能：統計 DocumentItems 中 documentId 找不到對應文件的筆數與涉及的 documentId 數量。
 * 腳本原理：使用 $lookup 連結文件資料，篩出沒有對應文件的題目後統計。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'document_items_missing_documents.md';

withDB(async (db: Db) => {
    const result = await db
        .collection('DocumentItems')
        .aggregate(
            [
                {
                    $lookup: {
                        from: 'Documents',
                        localField: 'documentId',
                        foreignField: '_id',
                        as: 'document',
                    },
                },
                { $match: { document: { $eq: [] } } },
                {
                    $group: {
                        _id: null,
                        missingDocumentItemCount: { $sum: 1 },
                        missingDocumentIds: { $addToSet: '$documentId' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        missingDocumentItemCount: 1,
                        missingDocumentIdCount: { $size: '$missingDocumentIds' },
                    },
                },
            ],
            { allowDiskUse: true }
        )
        .toArray();

    const summary = result.length > 0 ? result[0] : { missingDocumentItemCount: 0, missingDocumentIdCount: 0 };

    const lines: string[] = [];
    lines.push('# 五欄檔案題目對應文件不存在統計');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**缺失文件的題目筆數**: ' + summary.missingDocumentItemCount);
    lines.push('**缺失文件的 documentId 數量**: ' + summary.missingDocumentIdCount);

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：缺失文件題目筆數 ' + summary.missingDocumentItemCount);
    console.log('✓ 結果已寫入：' + outputPath);
});
