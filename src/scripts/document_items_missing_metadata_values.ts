/**
 * 原始需求：找出五欄檔案題目中，出處/題型值不存在但仍被使用的資料，列出 100 筆並提供統計。
 * 腳本功能：統計遺失的出處與題型引用數量，並列出 100 筆缺失明細。
 * 腳本原理：先取得出處與題型值的 Id 清單，再掃描五欄檔案題目的元資料清單比對是否存在。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

type MissingRecord = {
    itemId: string;
    metadataType: string;
    metadataValueId: string;
    metadataValueName: string;
};

const OUTPUT_FILE_NAME = 'document_items_missing_metadata_values.md';
const SAMPLE_LIMIT = 100;

withDB(async (db: Db) => {
    const sourceValues = await db.collection('SourceValues').find({}, { projection: { _id: 1 } }).toArray();
    const userTypeValues = await db.collection('UserTypeValues').find({}, { projection: { _id: 1 } }).toArray();

    const sourceValueSet = new Set(sourceValues.map((value) => String(value._id)));
    const userTypeValueSet = new Set(userTypeValues.map((value) => String(value._id)));

    const missingSourceItemIds = new Set<string>();
    const missingUserTypeItemIds = new Set<string>();
    const missingSourceValueIds = new Set<string>();
    const missingUserTypeValueIds = new Set<string>();
    const missingRecords: MissingRecord[] = [];

    let missingSourceCount = 0;
    let missingUserTypeCount = 0;

    const cursor = db
        .collection('DocumentItems')
        .find({ 'metadataList.metadataType': { $in: ['source', 'userType'] } }, { projection: { itemId: 1, metadataList: 1 } })
        .batchSize(2000);

    let scannedCount = 0;

    for await (const doc of cursor) {
        scannedCount += 1;
        if (scannedCount % 20000 === 0) {
            console.log('已掃描 ' + scannedCount + ' 筆題目');
        }
        const itemId = doc.itemId ? String(doc.itemId) : '未知';
        const metadataList = Array.isArray(doc.metadataList) ? doc.metadataList : [];
        metadataList.forEach((metadata: any) => {
            const metadataType = metadata?.metadataType;
            if (metadataType !== 'source' && metadataType !== 'userType') {
                return;
            }
            const metadataValueId = metadata?.metadataValueId ? String(metadata.metadataValueId) : '';
            const metadataValueName = metadata?.metadataValueName ? String(metadata.metadataValueName) : '';

            if (!metadataValueId) {
                return;
            }

            if (metadataType === 'source' && !sourceValueSet.has(metadataValueId)) {
                missingSourceCount += 1;
                missingSourceItemIds.add(itemId);
                missingSourceValueIds.add(metadataValueId);
                if (missingRecords.length < SAMPLE_LIMIT) {
                    missingRecords.push({
                        itemId,
                        metadataType: '出處',
                        metadataValueId,
                        metadataValueName,
                    });
                }
            }

            if (metadataType === 'userType' && !userTypeValueSet.has(metadataValueId)) {
                missingUserTypeCount += 1;
                missingUserTypeItemIds.add(itemId);
                missingUserTypeValueIds.add(metadataValueId);
                if (missingRecords.length < SAMPLE_LIMIT) {
                    missingRecords.push({
                        itemId,
                        metadataType: '題型',
                        metadataValueId,
                        metadataValueName,
                    });
                }
            }
        });
    }

    const missingEitherItemIds = new Set<string>([...missingSourceItemIds, ...missingUserTypeItemIds]);

    const lines: string[] = [];
    lines.push('# 五欄檔案題目遺失出處/題型值');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**遺失出處引用筆數**: ' + missingSourceCount);
    lines.push('**遺失題型引用筆數**: ' + missingUserTypeCount);
    lines.push('**涉及題目數（出處）**: ' + missingSourceItemIds.size);
    lines.push('**涉及題目數（題型）**: ' + missingUserTypeItemIds.size);
    lines.push('**涉及題目數（合併）**: ' + missingEitherItemIds.size);
    lines.push('**遺失出處元資料 Id 數**: ' + missingSourceValueIds.size);
    lines.push('**遺失題型元資料 Id 數**: ' + missingUserTypeValueIds.size);
    lines.push('');

    lines.push('## 100 筆缺失明細');
    lines.push('');
    lines.push('|題目 Id|類型|元資料 Id|元資料名稱|');
    lines.push('|---|---|---|---|');

    missingRecords.forEach((record) => {
        lines.push(
            '|' +
                record.itemId +
                '|' +
                record.metadataType +
                '|' +
                record.metadataValueId +
                '|' +
                record.metadataValueName +
                '|'
        );
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：遺失出處引用 ' + missingSourceCount + ' 筆、遺失題型引用 ' + missingUserTypeCount + ' 筆');
    console.log('✓ 結果已寫入：' + outputPath);
});
