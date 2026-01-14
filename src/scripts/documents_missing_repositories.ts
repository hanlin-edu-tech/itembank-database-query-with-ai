/**
 * 原始需求：確認五欄檔案找不到對應五欄檔案儲存庫的資料，僅需統計資訊。
 * 腳本功能：統計五欄檔案中 documentRepoId 找不到對應儲存庫的筆數與涉及的儲存庫 Id 數量。
 * 腳本原理：使用 $lookup 連結儲存庫資料，篩出沒有對應儲存庫的文件後統計。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'documents_missing_repositories.md';

withDB(async (db: Db) => {
    const result = await db
        .collection('Documents')
        .aggregate(
            [
                {
                    $lookup: {
                        from: 'DocumentRepositories',
                        localField: 'documentRepoId',
                        foreignField: '_id',
                        as: 'repo',
                    },
                },
                { $match: { repo: { $eq: [] } } },
                {
                    $group: {
                        _id: null,
                        missingDocumentCount: { $sum: 1 },
                        missingRepositoryIds: { $addToSet: '$documentRepoId' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        missingDocumentCount: 1,
                        missingRepositoryIdCount: { $size: '$missingRepositoryIds' },
                    },
                },
            ],
            { allowDiskUse: true }
        )
        .toArray();

    const summary = result.length > 0 ? result[0] : { missingDocumentCount: 0, missingRepositoryIdCount: 0 };

    const lines: string[] = [];
    lines.push('# 五欄檔案對應儲存庫不存在統計');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**缺失儲存庫的文件筆數**: ' + summary.missingDocumentCount);
    lines.push('**缺失儲存庫的 documentRepoId 數量**: ' + summary.missingRepositoryIdCount);

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：缺失儲存庫文件筆數 ' + summary.missingDocumentCount);
    console.log('✓ 結果已寫入：' + outputPath);
});
