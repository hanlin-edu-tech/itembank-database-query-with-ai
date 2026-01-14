/**
 * 原始需求：找出課本章節中，向度資訊不屬於該冊次所屬學程的資料。
 * 腳本功能：比對課本章節的向度資訊與冊次學程的向度清單，列出不一致的章節與統計。
 * 腳本原理：從課本章節取得向度資訊 Id，查出其所屬向度資訊表 Id，再比對冊次學程的向度清單。
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'textbook_section_dimension_mismatch.md';

withDB(async (db: Db) => {
    const sections = await db
        .collection('TextbookSections')
        .find({}, { projection: { _id: 1, textbookContentId: 1, dimensionValueIds: 1, name: 1, code: 1 } })
        .toArray();

    const textbookContentIds = Array.from(
        new Set(sections.map((section: any) => String(section.textbookContentId)).filter((id) => id && id !== 'undefined'))
    );

    const textbookContents = await db
        .collection('TextbookContents')
        .find({ _id: { $in: textbookContentIds as any } }, { projection: { _id: 1, volumeId: 1 } })
        .toArray();

    const volumeIds = Array.from(
        new Set(textbookContents.map((content: any) => String(content.volumeId)).filter((id) => id && id !== 'undefined'))
    );

    const volumes = await db
        .collection('Volumes')
        .find({ _id: { $in: volumeIds as any } }, { projection: { _id: 1, bodyOfKnowledgeId: 1, name: 1 } })
        .toArray();

    const bodyIds = Array.from(
        new Set(volumes.map((volume: any) => String(volume.bodyOfKnowledgeId)).filter((id) => id && id !== 'undefined'))
    );

    const bodiesOfKnowledge = await db
        .collection('BodiesOfKnowledge')
        .find({ _id: { $in: bodyIds as any } }, { projection: { _id: 1, name: 1, dimensionIds: 1 } })
        .toArray();

    const sectionDimensionValueIds = new Set<string>();
    sections.forEach((section: any) => {
        const ids = Array.isArray(section.dimensionValueIds) ? section.dimensionValueIds : [];
        ids.forEach((id: any) => {
            if (id) {
                sectionDimensionValueIds.add(String(id));
            }
        });
    });

    const dimensionValueIds = Array.from(sectionDimensionValueIds);
    const dimensionValues = await db
        .collection('DimensionValues')
        .find({ _id: { $in: dimensionValueIds as any } }, { projection: { _id: 1, dimensionId: 1, name: 1, code: 1 } })
        .toArray();

    const textbookContentMap = new Map<string, string>();
    textbookContents.forEach((content: any) => {
        if (content._id && content.volumeId) {
            textbookContentMap.set(String(content._id), String(content.volumeId));
        }
    });

    const volumeMap = new Map<string, { bodyOfKnowledgeId?: string; name?: string }>();
    volumes.forEach((volume: any) => {
        volumeMap.set(String(volume._id), {
            bodyOfKnowledgeId: volume.bodyOfKnowledgeId ? String(volume.bodyOfKnowledgeId) : undefined,
            name: volume.name || '未命名',
        });
    });

    const bodyMap = new Map<string, { name?: string; dimensionIdSet: Set<string> }>();
    bodiesOfKnowledge.forEach((body: any) => {
        const dimensionIds = Array.isArray(body.dimensionIds) ? body.dimensionIds.map((id: any) => String(id)) : [];
        bodyMap.set(String(body._id), {
            name: body.name || '未命名',
            dimensionIdSet: new Set(dimensionIds),
        });
    });

    const dimensionValueMap = new Map<string, { dimensionId?: string; name?: string; code?: string }>();
    dimensionValues.forEach((value: any) => {
        dimensionValueMap.set(String(value._id), {
            dimensionId: value.dimensionId ? String(value.dimensionId) : undefined,
            name: value.name || '未命名',
            code: value.code || '',
        });
    });

    const mismatches: Array<{
        sectionId: string;
        sectionName: string;
        sectionCode: string;
        textbookContentId: string;
        volumeId: string;
        volumeName: string;
        bodyOfKnowledgeId: string;
        bodyOfKnowledgeName: string;
        dimensionValueId: string;
        dimensionValueName: string;
        dimensionValueCode: string;
        dimensionId: string;
        mismatchReason: string;
    }> = [];

    sections.forEach((section: any) => {
        const sectionId = section._id ? String(section._id) : '未知';
        const sectionName = section.name || '未命名';
        const sectionCode = section.code || '';
        const textbookContentId = section.textbookContentId ? String(section.textbookContentId) : '未知';
        const volumeId = textbookContentMap.get(textbookContentId) || '未知';
        const volumeInfo = volumeMap.get(volumeId);
        const bodyOfKnowledgeId = volumeInfo?.bodyOfKnowledgeId || '未知';
        const bodyInfo = bodyMap.get(bodyOfKnowledgeId);
        const bodyName = bodyInfo?.name || '未知';
        const volumeName = volumeInfo?.name || '未命名';

        const dimensionValueIdsForSection = Array.isArray(section.dimensionValueIds) ? section.dimensionValueIds : [];
        dimensionValueIdsForSection.forEach((rawId: any) => {
            if (!rawId) {
                return;
            }
            const dimensionValueId = String(rawId);
            const valueInfo = dimensionValueMap.get(dimensionValueId);
            if (!valueInfo) {
                mismatches.push({
                    sectionId,
                    sectionName,
                    sectionCode,
                    textbookContentId,
                    volumeId,
                    volumeName,
                    bodyOfKnowledgeId,
                    bodyOfKnowledgeName: bodyName,
                    dimensionValueId,
                    dimensionValueName: '未知',
                    dimensionValueCode: '',
                    dimensionId: '未知',
                    mismatchReason: '向度資訊不存在',
                });
                return;
            }
            const dimensionId = valueInfo.dimensionId || '未知';
            if (!bodyInfo) {
                mismatches.push({
                    sectionId,
                    sectionName,
                    sectionCode,
                    textbookContentId,
                    volumeId,
                    volumeName,
                    bodyOfKnowledgeId,
                    bodyOfKnowledgeName: bodyName,
                    dimensionValueId,
                    dimensionValueName: valueInfo.name || '未命名',
                    dimensionValueCode: valueInfo.code || '',
                    dimensionId,
                    mismatchReason: '冊次沒有對應學程',
                });
                return;
            }
            if (!bodyInfo.dimensionIdSet.has(dimensionId)) {
                mismatches.push({
                    sectionId,
                    sectionName,
                    sectionCode,
                    textbookContentId,
                    volumeId,
                    volumeName,
                    bodyOfKnowledgeId,
                    bodyOfKnowledgeName: bodyName,
                    dimensionValueId,
                    dimensionValueName: valueInfo.name || '未命名',
                    dimensionValueCode: valueInfo.code || '',
                    dimensionId,
                    mismatchReason: '向度資訊不屬於冊次學程',
                });
            }
        });
    });

    const lines: string[] = [];
    lines.push('# 課本章節向度資訊與冊次學程不一致清單');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**不一致筆數**: ' + mismatches.length);
    lines.push('');

    lines.push('## 不一致明細');
    lines.push('');
    lines.push('|課本章節 Id|章節名稱|章節代碼|課本章節表 Id|冊次 Id|冊次名稱|學程 Id|學程名稱|向度資訊 Id|向度資訊名稱|向度資訊代碼|向度資訊表 Id|不一致原因|');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');

    mismatches.forEach((row) => {
        lines.push(
            '|' +
                row.sectionId +
                '|' +
                row.sectionName +
                '|' +
                row.sectionCode +
                '|' +
                row.textbookContentId +
                '|' +
                row.volumeId +
                '|' +
                row.volumeName +
                '|' +
                row.bodyOfKnowledgeId +
                '|' +
                row.bodyOfKnowledgeName +
                '|' +
                row.dimensionValueId +
                '|' +
                row.dimensionValueName +
                '|' +
                row.dimensionValueCode +
                '|' +
                row.dimensionId +
                '|' +
                row.mismatchReason +
                '|'
        );
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：共找到 ' + mismatches.length + ' 筆不一致資料');
    console.log('✓ 結果已寫入：' + outputPath);
});
