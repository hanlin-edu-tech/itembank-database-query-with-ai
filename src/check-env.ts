import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function checkEnv() {
    console.log('🔍 正在檢查環境設定...');

    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.log('❌ 錯誤：找不到 MONGODB_URI。');
        console.log('   請在根目錄建立 .env 檔案。');
        console.log('   範例內容：MONGODB_URI=mongodb+srv://user:pass@host/ItemBank');
        return;
    }

    console.log('✅ 已找到 MONGODB_URI。');

    const client = new MongoClient(uri);

    try {
        console.log('⏳ 正在嘗試連線至 MongoDB...');
        await client.connect();
        const db = client.db();
        
        // Ping command to verify connection
        await db.command({ ping: 1 });
        
        console.log(`✅ 連線成功！已連線至資料庫："${db.databaseName}"`);
        console.log('   您已準備就緒，可以開始要求 Gemini 為您建構查詢。');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('❌ 連線失敗：', message);
        console.log('   請檢查您的連線字串與網路狀態。');
    } finally {
        await client.close();
    }
}

checkEnv();
