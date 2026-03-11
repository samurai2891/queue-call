import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as schema from "../drizzle/schema.ts";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

async function seed() {
  console.log("🌱 Starting seed...");

  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection, { schema, mode: "default" });

  try {
    // Check if demo store already exists
    const existingStore = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, "demo"))
      .limit(1);

    if (existingStore.length > 0) {
      console.log("⚠️  Demo store already exists. Skipping seed.");
      console.log("   To re-seed, delete the store first or use a different slug.");
      return;
    }

    // Generate keys
    const kioskKey = nanoid(32);
    const boardKey = nanoid(32);
    
    // Hash PINs
    const managerPinHash = await bcrypt.hash("1234", 10);
    const staffPinHash = await bcrypt.hash("5678", 10);

    // Create demo store
    const settings = {
      general: {
        storeName: "デモ店舗",
        defaultLocale: "ja",
        supportedLocales: ["ja", "en", "ko", "zh-Hans", "zh-Hant"],
        dayResetTime: "03:00",
      },
      queue: {
        intakeOpen: true,
        partySizeMin: 1,
        partySizeMax: 10,
        noteEnabled: true,
        remoteJoinEnabled: true,
        checkinDeadlineMinutes: 5,
        autoSkipEnabled: true,
        reorderEnabled: false,
        reorderMaxMove: 3,
      },
      notifications: {
        pushEnabled: true,
        smsEnabled: false,
        smsFromName: "デモ店舗",
        recallLimit: 3,
        smsTemplate: "{number}番です。入口へお願いします {url}",
      },
      kiosk: {
        enabled: true,
        key: kioskKey,
        autoResetSeconds: 30,
        maxPartySize: 10,
      },
      board: {
        enabled: true,
        key: boardKey,
        nextCount: 3,
      },
      menu: {
        enabled: true,
        defaultView: "feed",
        imageDensity: "large",
      },
    };

    const [result] = await db.insert(schema.stores).values({
      slug: "demo",
      name: "デモ店舗",
      ownerId: 1,
      managerPinHash,
      staffPinHash,
      settings: JSON.stringify(settings),
      currentNumber: 0,
      dayKey: new Date().toISOString().split("T")[0],
    });

    const storeId = Number(result.insertId);

    console.log("✅ Demo store created:");
    console.log(`   Store ID: ${storeId}`);
    console.log(`   Slug: demo`);
    console.log(`   Manager PIN: 1234`);
    console.log(`   Staff PIN: 5678`);
    console.log(`   Kiosk Key: ${kioskKey}`);
    console.log(`   Board Key: ${boardKey}`);

    // Create sample menu categories
    const [categoryResult1] = await db.insert(schema.menuCategories).values({
      storeId,
      nameJa: "人気メニュー",
      nameEn: "Popular Items",
      nameKo: "인기 메뉴",
      nameZhHans: "热门菜单",
      nameZhHant: "熱門菜單",
      sortOrder: 1,
      isActive: true,
    });

    const category1Id = Number(categoryResult1.insertId);

    const [categoryResult2] = await db.insert(schema.menuCategories).values({
      storeId,
      nameJa: "ドリンク",
      nameEn: "Drinks",
      nameKo: "음료",
      nameZhHans: "饮料",
      nameZhHant: "飲料",
      sortOrder: 2,
      isActive: true,
    });

    const category2Id = Number(categoryResult2.insertId);

    // Create sample menu items
    await db.insert(schema.menuItems).values([
      {
        storeId,
        categoryId: category1Id,
        nameJa: "ラーメン",
        nameEn: "Ramen",
        nameKo: "라멘",
        nameZhHans: "拉面",
        nameZhHant: "拉麵",
        descJa: "自家製麺を使用した濃厚スープのラーメン",
        descEn: "Rich soup ramen with homemade noodles",
        descKo: "수제 면을 사용한 진한 국물 라멘",
        descZhHans: "使用自制面条的浓郁汤拉面",
        descZhHant: "使用自製麵條的濃郁湯拉麵",
        price: 980,
        sortOrder: 1,
        isActive: true,
      },
      {
        storeId,
        categoryId: category1Id,
        nameJa: "チャーハン",
        nameEn: "Fried Rice",
        nameKo: "볶음밥",
        nameZhHans: "炒饭",
        nameZhHant: "炒飯",
        descJa: "パラパラに仕上げた香ばしいチャーハン",
        descEn: "Fragrant fried rice with perfect texture",
        descKo: "고슬고슬하게 볶은 향긋한 볶음밥",
        descZhHans: "炒得粒粒分明的香喷喷炒饭",
        descZhHant: "炒得粒粒分明的香噴噴炒飯",
        price: 850,
        sortOrder: 2,
        isActive: true,
      },
      {
        storeId,
        categoryId: category2Id,
        nameJa: "生ビール",
        nameEn: "Draft Beer",
        nameKo: "생맥주",
        nameZhHans: "生啤酒",
        nameZhHant: "生啤酒",
        descJa: "キンキンに冷えた生ビール",
        descEn: "Ice-cold draft beer",
        descKo: "차갑게 식힌 생맥주",
        descZhHans: "冰镇生啤酒",
        descZhHant: "冰鎮生啤酒",
        price: 550,
        sortOrder: 1,
        isActive: true,
      },
    ]);

    console.log("✅ Sample menu items created");

    // Create sample feed posts
    await db.insert(schema.feedPosts).values([
      {
        storeId,
        photoLargeUrl: "https://placehold.co/800x600/3b82f6/white?text=Today%27s+Special",
        titleJa: "本日のおすすめ",
        titleEn: "Today's Special",
        titleKo: "오늘의 추천",
        titleZhHans: "今日推荐",
        titleZhHant: "今日推薦",
        captionJa: "特製ラーメン",
        captionEn: "Signature Ramen",
        captionKo: "특제 라멘",
        captionZhHans: "特制拉面",
        captionZhHant: "特製拉麵",
        sortOrder: 1,
        isActive: true,
      },
      {
        storeId,
        photoLargeUrl: "https://placehold.co/800x600/10b981/white?text=New+Menu",
        titleJa: "新メニュー登場",
        titleEn: "New Menu Item",
        titleKo: "신메뉴 출시",
        titleZhHans: "新菜单登场",
        titleZhHant: "新菜單登場",
        captionJa: "お試しください",
        captionEn: "Try it now",
        captionKo: "지금 맛보세요",
        captionZhHans: "请尝试",
        captionZhHant: "請嘗試",
        sortOrder: 2,
        isActive: true,
      },
    ]);

    console.log("✅ Sample feed posts created");

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📝 Quick start:");
    console.log(`   1. Visit: http://localhost:3000/s/demo`);
    console.log(`   2. Join queue and get a ticket`);
    console.log(`   3. Staff login: http://localhost:3000/s/demo/staff (PIN: 5678)`);
    console.log(`   4. Kiosk: http://localhost:3000/s/demo/kiosk?key=${kioskKey}`);
    console.log(`   5. Board: http://localhost:3000/s/demo/board?key=${boardKey}`);
    console.log(`   6. Settings: http://localhost:3000/admin/settings (Manager PIN: 1234)`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

seed()
  .then(() => {
    console.log("\n✅ Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });
