/**
 * 原始需求：是否有五欄檔案儲存庫關聯到已作廢的產品單元表？
 * 追加需求：
 *  1) 另外找出「五欄檔案」引用不存在的產品單元章節
 *  2) 另外找出「五欄檔案」引用的產品單元章節不符合「五欄檔案儲存庫」的產品單元表
 *
 * 腳本功能：
 *  1) 找出「五欄檔案儲存庫」引用到「未啟用的產品單元表」的清單
 *  2) 針對上述資料夾底下的五欄檔案，檢查產品單元章節引用的正確性（缺失/不符合）
 *
 * 腳本原理：
 *  1) 先取出所有未啟用的產品單元表 Id
 *  2) 查詢五欄檔案儲存庫中引用到這些 Id 的資料夾（包含：產品單元表 Id 清單、標記題目數量記錄清單）
 *  3) 只針對命中的資料夾，掃描其底下五欄檔案的「產品單元章節 Id 清單」
 *  4) 批次查出章節是否存在，並比對章節的產品單元表 Id 是否在資料夾的產品單元表 Id 清單內
 *
 * 判定「已作廢」：產品單元表 `enabled: false`
 */
import { withDB } from '../utils/db';
import { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_FILE_NAME = 'document_repositories_disabled_product_contents.md';
const FOLDER_SAMPLE_LIMIT = 100;
const DOCUMENT_SAMPLE_LIMIT = 100;
const IDS_PREVIEW_LIMIT = 20;
const IN_CHUNK_SIZE = 5000;

type DisabledProductContentInfo = {
    id: string;
    name: string;
    year: number | null;
    term: string;
    subjectId: string;
    productId: string;
    bodyOfKnowledgeId: string;
};

type FolderSampleRow = {
    folderId: string;
    folderName: string;
    folderEnabled: boolean | null;
    catalogId: string;
    productContentIds: string[];
    disabledLinkedInContentIds: string[];
    disabledLinkedInTaggedRecords: string[];
};

type DocumentRecord = {
    documentId: string;
    documentRepoId: string;
    documentName: string;
    catalogId: string;
    productSectionIds: string[];
};

type MissingSectionSample = {
    folderId: string;
    folderName: string;
    documentId: string;
    documentName: string;
    missingProductSectionIds: string[];
};

type MismatchSectionSample = {
    folderId: string;
    folderName: string;
    documentId: string;
    documentName: string;
    productSectionId: string;
    sectionProductContentId: string;
    folderProductContentIds: string[];
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

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

function intersectSet(values: string[], set: Set<string>): string[] {
    const hits: string[] = [];
    values.forEach((value) => {
        const normalized = (value || '').trim();
        if (normalized && set.has(normalized)) {
            hits.push(normalized);
        }
    });
    return uniqueStrings(hits);
}

function formatIdList(ids: string[]): string {
    if (!Array.isArray(ids) || ids.length === 0) {
        return '(空)';
    }
    const preview = ids.slice(0, IDS_PREVIEW_LIMIT).map((id) => '`' + id + '`').join(', ');
    if (ids.length <= IDS_PREVIEW_LIMIT) {
        return preview;
    }
    return preview + ' ...（共 ' + ids.length + ' 個）';
}

withDB(async (db: Db) => {
    // 1) 取出未啟用的產品單元表
    const disabledProductContents = await db
        .collection<any>('ProductContents')
        .find(
            { enabled: false },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    year: 1,
                    term: 1,
                    subjectId: 1,
                    productId: 1,
                    bodyOfKnowledgeId: 1,
                },
            }
        )
        .toArray();

    const disabledInfos: DisabledProductContentInfo[] = disabledProductContents.map((doc: any) => ({
        id: doc?._id ? String(doc._id) : '',
        name: doc?.name ? String(doc.name) : '',
        year: typeof doc?.year === 'number' ? doc.year : null,
        term: doc?.term ? String(doc.term) : '',
        subjectId: doc?.subjectId ? String(doc.subjectId) : '',
        productId: doc?.productId ? String(doc.productId) : '',
        bodyOfKnowledgeId: doc?.bodyOfKnowledgeId ? String(doc.bodyOfKnowledgeId) : '',
    }));

    const disabledIds = uniqueStrings(disabledInfos.map((info) => info.id));
    const disabledIdSet = new Set<string>(disabledIds);
    const disabledInfoMap = new Map<string, DisabledProductContentInfo>();
    disabledInfos.forEach((info) => {
        if (info.id) {
            disabledInfoMap.set(info.id, info);
        }
    });

    // 2) 找出引用到未啟用產品單元表的「五欄檔案儲存庫」
    const folderCursor = db
        .collection<any>('DocumentRepositories')
        .find(
            {
                $or: [
                    { productContentIds: { $in: disabledIds } },
                    { 'taggedQuestionCountRecords.productContentId': { $in: disabledIds } },
                ],
            },
            {
                projection: {
                    _id: 1,
                    name: 1,
                    enabled: 1,
                    catalogId: 1,
                    productContentIds: 1,
                    taggedQuestionCountRecords: 1,
                },
            }
        )
        .batchSize(2000);

    let matchedFolderCount = 0;
    let linkedByContentIdsCount = 0;
    let linkedByTaggedRecordsCount = 0;

    const referencedDisabledProductContentIds = new Set<string>();

    const folderSamples: FolderSampleRow[] = [];
    const matchedFolderIds: string[] = [];
    const folderNameMap = new Map<string, string>();
    const folderProductContentIdSetMap = new Map<string, Set<string>>();

    for await (const doc of folderCursor) {
        matchedFolderCount += 1;

        const folderId = doc?._id ? String(doc._id) : '';
        const folderName = doc?.name ? String(doc.name) : '';
        const folderEnabled = typeof doc?.enabled === 'boolean' ? doc.enabled : null;
        const catalogId = doc?.catalogId ? String(doc.catalogId) : '';

        const productContentIds = Array.isArray(doc?.productContentIds) ? doc.productContentIds.map((id: any) => String(id)) : [];
        const productContentIdSet = new Set<string>(uniqueStrings(productContentIds));

        const disabledLinkedInContentIds = intersectSet(productContentIds, disabledIdSet);

        const taggedRecords = Array.isArray(doc?.taggedQuestionCountRecords) ? doc.taggedQuestionCountRecords : [];
        const taggedProductContentIds = taggedRecords
            .map((record: any) => (record?.productContentId ? String(record.productContentId) : ''))
            .filter((id: string) => Boolean(id));
        const disabledLinkedInTaggedRecords = intersectSet(taggedProductContentIds, disabledIdSet);

        if (disabledLinkedInContentIds.length > 0) {
            linkedByContentIdsCount += 1;
        }
        if (disabledLinkedInTaggedRecords.length > 0) {
            linkedByTaggedRecordsCount += 1;
        }

        [...disabledLinkedInContentIds, ...disabledLinkedInTaggedRecords].forEach((id) => referencedDisabledProductContentIds.add(id));

        if (folderId) {
            matchedFolderIds.push(folderId);
            folderNameMap.set(folderId, folderName);
            folderProductContentIdSetMap.set(folderId, productContentIdSet);
        }

        if (folderSamples.length < FOLDER_SAMPLE_LIMIT) {
            folderSamples.push({
                folderId,
                folderName,
                folderEnabled,
                catalogId,
                productContentIds: uniqueStrings(productContentIds),
                disabledLinkedInContentIds,
                disabledLinkedInTaggedRecords,
            });
        }
    }

    // 3) 追加檢查：只針對上述命中的資料夾底下的五欄檔案
    const uniqueMatchedFolderIds = uniqueStrings(matchedFolderIds);

    const documents: DocumentRecord[] = [];
    const allReferencedProductSectionIds = new Set<string>();

    let scannedDocumentCount = 0;

    if (uniqueMatchedFolderIds.length > 0) {
        const documentCursor = db
            .collection<any>('Documents')
            .find(
                {
                    documentRepoId: { $in: uniqueMatchedFolderIds },
                    productSectionIds: { $exists: true, $ne: [] },
                },
                {
                    projection: {
                        _id: 1,
                        documentRepoId: 1,
                        name: 1,
                        catalogId: 1,
                        productSectionIds: 1,
                    },
                }
            )
            .batchSize(2000);

        for await (const doc of documentCursor) {
            scannedDocumentCount += 1;
            if (scannedDocumentCount % 20000 === 0) {
                console.log('已掃描 ' + scannedDocumentCount + ' 筆五欄檔案（僅限命中資料夾）');
            }

            const documentId = doc?._id ? String(doc._id) : '';
            const documentRepoId = doc?.documentRepoId ? String(doc.documentRepoId) : '';
            const documentName = doc?.name ? String(doc.name) : '';
            const catalogId = doc?.catalogId ? String(doc.catalogId) : '';
            const productSectionIds = Array.isArray(doc?.productSectionIds)
                ? uniqueStrings(doc.productSectionIds.map((id: any) => String(id)))
                : [];

            if (!documentId || !documentRepoId || productSectionIds.length === 0) {
                continue;
            }

            documents.push({
                documentId,
                documentRepoId,
                documentName,
                catalogId,
                productSectionIds,
            });

            productSectionIds.forEach((id) => allReferencedProductSectionIds.add(id));
        }
    }

    // 3-1) 批次取出章節，建立「章節 -> 產品單元表 Id」對照
    const referencedProductSectionIds = Array.from(allReferencedProductSectionIds);
    const existingProductSectionIdSet = new Set<string>();
    const productSectionToProductContentId = new Map<string, string>();

    const sectionIdChunks = chunkArray(referencedProductSectionIds, IN_CHUNK_SIZE);
    for (let i = 0; i < sectionIdChunks.length; i += 1) {
        const chunk = sectionIdChunks[i];
        if (!chunk || chunk.length === 0) {
            continue;
        }

        const sectionDocs = await db
            .collection<any>('ProductSections')
            .find(
                { _id: { $in: chunk } },
                {
                    projection: {
                        _id: 1,
                        productContentId: 1,
                    },
                }
            )
            .toArray();

        sectionDocs.forEach((section: any) => {
            const sectionId = section?._id ? String(section._id) : '';
            const productContentId = section?.productContentId ? String(section.productContentId) : '';
            if (!sectionId) {
                return;
            }
            existingProductSectionIdSet.add(sectionId);
            productSectionToProductContentId.set(sectionId, productContentId);
        });
    }

    // 3-2) 計算缺失章節 / 章節不符合資料夾產品單元表
    let documentWithMissingSectionCount = 0;
    let documentWithMismatchSectionCount = 0;

    let missingSectionReferenceCount = 0;
    const missingProductSectionIdsSet = new Set<string>();

    let mismatchSectionReferenceCount = 0;
    const mismatchProductSectionIdsSet = new Set<string>();

    const missingSamples: MissingSectionSample[] = [];
    const mismatchSamples: MismatchSectionSample[] = [];

    documents.forEach((doc) => {
        const folderId = doc.documentRepoId;
        const folderName = folderNameMap.get(folderId) || '';
        const folderProductContentIdSet = folderProductContentIdSetMap.get(folderId) || new Set<string>();

        const missingSectionIds = doc.productSectionIds.filter((sectionId) => !existingProductSectionIdSet.has(sectionId));
        const uniqueMissingSectionIds = uniqueStrings(missingSectionIds);

        if (uniqueMissingSectionIds.length > 0) {
            documentWithMissingSectionCount += 1;
            missingSectionReferenceCount += uniqueMissingSectionIds.length;
            uniqueMissingSectionIds.forEach((id) => missingProductSectionIdsSet.add(id));

            if (missingSamples.length < DOCUMENT_SAMPLE_LIMIT) {
                missingSamples.push({
                    folderId,
                    folderName,
                    documentId: doc.documentId,
                    documentName: doc.documentName,
                    missingProductSectionIds: uniqueMissingSectionIds,
                });
            }
        }

        const mismatchSectionIds: string[] = [];
        doc.productSectionIds.forEach((sectionId) => {
            if (!existingProductSectionIdSet.has(sectionId)) {
                return;
            }
            const sectionProductContentId = productSectionToProductContentId.get(sectionId) || '';
            if (!sectionProductContentId) {
                // 章節缺少產品單元表 Id 時，亦視為不符合
                mismatchSectionIds.push(sectionId);
                return;
            }
            if (!folderProductContentIdSet.has(sectionProductContentId)) {
                mismatchSectionIds.push(sectionId);
            }
        });

        const uniqueMismatchSectionIds = uniqueStrings(mismatchSectionIds);
        if (uniqueMismatchSectionIds.length > 0) {
            documentWithMismatchSectionCount += 1;
            mismatchSectionReferenceCount += uniqueMismatchSectionIds.length;
            uniqueMismatchSectionIds.forEach((id) => mismatchProductSectionIdsSet.add(id));

            uniqueMismatchSectionIds.forEach((sectionId) => {
                if (mismatchSamples.length >= DOCUMENT_SAMPLE_LIMIT) {
                    return;
                }
                mismatchSamples.push({
                    folderId,
                    folderName,
                    documentId: doc.documentId,
                    documentName: doc.documentName,
                    productSectionId: sectionId,
                    sectionProductContentId: productSectionToProductContentId.get(sectionId) || '',
                    folderProductContentIds: Array.from(folderProductContentIdSet),
                });
            });
        }
    });

    // 4) 輸出報表
    const lines: string[] = [];
    lines.push('# 五欄檔案儲存庫關聯到未啟用的產品單元表');
    lines.push('');
    lines.push('**查詢時間**: ' + new Date().toLocaleString('zh-TW'));
    lines.push('**作廢判定**: 產品單元表 `enabled: false`');
    lines.push('');

    lines.push('## 統計摘要（作廢產品單元表）');
    lines.push('');
    lines.push('|項目|數量|');
    lines.push('|---|---:|');
    lines.push('|未啟用的產品單元表筆數|' + disabledIds.length + '|');
    lines.push('|關聯到未啟用產品單元表的五欄檔案儲存庫筆數|' + matchedFolderCount + '|');
    lines.push('|（其中）透過「產品單元表 Id 清單」關聯到未啟用者|' + linkedByContentIdsCount + '|');
    lines.push('|（其中）透過「標記題目數量記錄清單」關聯到未啟用者|' + linkedByTaggedRecordsCount + '|');
    lines.push('|被引用到的未啟用產品單元表 Id 去重數|' + referencedDisabledProductContentIds.size + '|');
    lines.push('');

    lines.push('## 100 筆樣本（資料夾）');
    lines.push('');
    lines.push('|五欄檔案儲存庫 Id|名稱|是否啟用|目錄 Id|未啟用產品單元表（來自 Id 清單）|未啟用產品單元表（來自標記記錄）|');
    lines.push('|---|---|---:|---|---|---|');

    folderSamples.forEach((row) => {
        const enabledText = row.folderEnabled === null ? '' : row.folderEnabled ? '1' : '0';
        lines.push(
            '|' +
                '`' +
                row.folderId +
                '`|' +
                row.folderName +
                '|' +
                enabledText +
                '|' +
                '`' +
                row.catalogId +
                '`|' +
                formatIdList(row.disabledLinkedInContentIds) +
                '|' +
                formatIdList(row.disabledLinkedInTaggedRecords) +
                '|'
        );
    });

    lines.push('');
    lines.push('## 未啟用產品單元表 Id 對照（僅列出本次有被引用到者）');
    lines.push('');
    lines.push('|產品單元表 Id|名稱|學年|期別|科目 Id|產品 Id|學程 Id|');
    lines.push('|---|---|---:|---|---|---|---|');

    const referencedDisabledIdsSorted = Array.from(referencedDisabledProductContentIds).sort();
    referencedDisabledIdsSorted.forEach((id) => {
        const info = disabledInfoMap.get(id);
        lines.push(
            '|' +
                '`' +
                id +
                '`|' +
                String(info?.name || '') +
                '|' +
                String(info?.year === null ? '' : info?.year) +
                '|' +
                String(info?.term || '') +
                '|' +
                '`' +
                String(info?.subjectId || '') +
                '`|' +
                '`' +
                String(info?.productId || '') +
                '`|' +
                '`' +
                String(info?.bodyOfKnowledgeId || '') +
                '`|'
        );
    });

    lines.push('');
    lines.push('# 追加檢查：五欄檔案的產品單元章節引用');
    lines.push('');
    lines.push('> 範圍：僅檢查「上述命中的資料夾」底下的五欄檔案（且產品單元章節 Id 清單非空）');
    lines.push('');

    lines.push('## 統計摘要（章節引用檢查）');
    lines.push('');
    lines.push('|項目|數量|');
    lines.push('|---|---:|');
    lines.push('|命中資料夾數（去重）|' + uniqueMatchedFolderIds.length + '|');
    lines.push('|掃描五欄檔案筆數|' + scannedDocumentCount + '|');
    lines.push('|五欄檔案引用不存在的產品單元章節（檔案數）|' + documentWithMissingSectionCount + '|');
    lines.push('|不存在章節引用數（以檔案內去重計）|' + missingSectionReferenceCount + '|');
    lines.push('|不存在章節 Id 去重數|' + missingProductSectionIdsSet.size + '|');
    lines.push('|五欄檔案引用的產品單元章節不符合資料夾產品單元表（檔案數）|' + documentWithMismatchSectionCount + '|');
    lines.push('|不符合章節引用數（以檔案內去重計）|' + mismatchSectionReferenceCount + '|');
    lines.push('|不符合章節 Id 去重數|' + mismatchProductSectionIdsSet.size + '|');
    lines.push('');

    lines.push('## 100 筆樣本：引用不存在的產品單元章節');
    lines.push('');
    lines.push('|資料夾 Id|資料夾名稱|五欄檔案 Id|五欄檔案名稱|不存在的產品單元章節 Id|');
    lines.push('|---|---|---|---|---|');

    missingSamples.forEach((sample) => {
        lines.push(
            '|' +
                '`' +
                sample.folderId +
                '`|' +
                sample.folderName +
                '|' +
                '`' +
                sample.documentId +
                '`|' +
                sample.documentName +
                '|' +
                formatIdList(sample.missingProductSectionIds) +
                '|'
        );
    });

    lines.push('');
    lines.push('## 100 筆樣本：章節不符合資料夾的產品單元表');
    lines.push('');
    lines.push('|資料夾 Id|資料夾名稱|五欄檔案 Id|五欄檔案名稱|產品單元章節 Id|章節的產品單元表 Id|資料夾產品單元表 Id（預覽）|');
    lines.push('|---|---|---|---|---|---|---|');

    mismatchSamples.forEach((sample) => {
        lines.push(
            '|' +
                '`' +
                sample.folderId +
                '`|' +
                sample.folderName +
                '|' +
                '`' +
                sample.documentId +
                '`|' +
                sample.documentName +
                '|' +
                '`' +
                sample.productSectionId +
                '`|' +
                '`' +
                String(sample.sectionProductContentId || '') +
                '`|' +
                formatIdList(uniqueStrings(sample.folderProductContentIds)) +
                '|'
        );
    });

    const outputPath = path.join(__dirname, '../outputs/' + OUTPUT_FILE_NAME);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    console.log('✓ 查詢完成：找到 ' + matchedFolderCount + ' 筆五欄檔案儲存庫有引用未啟用的產品單元表');
    console.log('✓ 章節檢查：缺失章節的五欄檔案 ' + documentWithMissingSectionCount + ' 筆；章節不符合資料夾產品單元表的五欄檔案 ' + documentWithMismatchSectionCount + ' 筆');
    console.log('✓ 結果已寫入：' + outputPath);
});
