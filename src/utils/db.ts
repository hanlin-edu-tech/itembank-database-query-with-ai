import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error('錯誤：.env 檔案中未定義 MONGODB_URI。');
    console.error('請將 .env.example 複製為 .env 並設定您的連線字串。');
    process.exit(1);
}

const client = new MongoClient(uri);

/**
 * 輔助函式：連線至 MongoDB，執行回呼函式，然後關閉連線。
 * 
 * @param callback - 接收 'db' 實例的非同步函式。
 */
export async function withDB(callback: (db: Db) => Promise<void>): Promise<void> {
    try {
        await client.connect();
        const db = client.db(); // 使用連線字串中的資料庫名稱
        await callback(db);
    } catch (error) {
        console.error('資料庫操作錯誤：', error);
    } finally {
        await client.close();
    }
}

export { client };
