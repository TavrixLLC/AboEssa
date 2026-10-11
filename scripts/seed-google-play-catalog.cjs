const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient, ProductListingStatus, AuctionStatus, AuctionTier } = require('@prisma/client');
const { Queue } = require('bullmq');
const { Client: MinioClient } = require('minio');

const prisma = new PrismaClient();
const assetsDir = process.env.DEMO_ASSETS_DIR || '/tmp/aboessa-google-play-catalog';
const bucket = process.env.MINIO_BUCKET || 'aboessa-media';

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
});

const categories = [
  { name: 'الإلكترونيات', slug: 'electronics', icon: '📱', sortOrder: 0 },
  { name: 'المنزل والمطبخ', slug: 'home-kitchen', icon: '🏠', sortOrder: 1 },
  { name: 'الأزياء والإكسسوارات', slug: 'fashion-accessories', icon: '👜', sortOrder: 2 },
  { name: 'العناية والجمال', slug: 'beauty-care', icon: '✨', sortOrder: 3 },
  { name: 'العدد والأدوات', slug: 'tools', icon: '🛠️', sortOrder: 4 },
  { name: 'الألعاب والترفيه', slug: 'gaming-entertainment', icon: '🎮', sortOrder: 5 },
];

const products = [
  {
    id: 'demo_google_play_product_headphones',
    title: 'سماعات لاسلكية بعزل الضوضاء',
    description: 'صوت غني وواضح، بطارية تدوم طوال اليوم ووسائد ناعمة تمنحك راحة ممتازة في الاستخدام الطويل.',
    categorySlug: 'electronics',
    image: 'headphones.png',
    price: 185000,
    quantity: 8,
  },
  {
    id: 'demo_google_play_product_air_fryer',
    title: 'قلاية هوائية رقمية سعة 8 لتر',
    description: 'طهي سريع بقليل من الزيت، سعة عائلية وتحكم رقمي بسيط لوجبات يومية ألذ وأسهل.',
    categorySlug: 'home-kitchen',
    image: 'air-fryer.png',
    price: 149000,
    quantity: 6,
  },
  {
    id: 'demo_google_play_product_handbag',
    title: 'حقيبة جلدية بتصميم كلاسيكي',
    description: 'حقيبة أنيقة بخامة جلدية ناعمة، تفاصيل معدنية راقية ومساحة عملية تناسب الإطلالات اليومية.',
    categorySlug: 'fashion-accessories',
    image: 'leather-handbag.png',
    price: 95000,
    quantity: 5,
  },
  {
    id: 'demo_google_play_product_perfume',
    title: 'عطر العنبر الدافئ – إصدار فاخر',
    description: 'توليفة شرقية دافئة بلمسات عنبر وخشب ناعم، مقدمة في علبة أنيقة لتكون هدية مميزة.',
    categorySlug: 'beauty-care',
    image: 'amber-perfume.png',
    price: 120000,
    quantity: 10,
  },
  {
    id: 'demo_google_play_product_drill',
    title: 'عدة مثقاب لاسلكي متكاملة',
    description: 'مثقاب قوي وخفيف مع بطاريتين ومجموعة رؤوس مرتبة لأعمال الصيانة والتركيب في المنزل.',
    categorySlug: 'tools',
    image: 'cordless-drill.png',
    price: 175000,
    quantity: 4,
  },
  {
    id: 'demo_google_play_product_espresso',
    title: 'ماكينة إسبرسو منزلية احترافية',
    description: 'حضّر إسبرسو غني وكابتشينو كريمي في المنزل مع عصا تبخير وهيكل معدني أنيق.',
    categorySlug: 'home-kitchen',
    image: 'espresso-machine.png',
    price: 325000,
    quantity: 3,
  },
];

const auctions = [
  {
    id: 'demo_google_play_auction_smart_watch',
    title: 'ساعة ذكية بشاشة AMOLED',
    description: 'شاشة واضحة، تتبع للنشاط اليومي وتصميم أنيق يناسب العمل والرياضة.',
    categorySlug: 'electronics',
    image: 'smart-watch.png',
    startingPrice: 75000,
    minIncrement: 5000,
    durationHours: 6,
  },
  {
    id: 'demo_google_play_auction_robot_vacuum',
    title: 'مكنسة روبوت ذكية مع خرائط دقيقة',
    description: 'تنظيف ذكي للمنازل مع تخطيط الغرف، حساسات متقدمة وتحكم سهل.',
    categorySlug: 'home-kitchen',
    image: 'robot-vacuum.png',
    startingPrice: 180000,
    minIncrement: 10000,
    durationHours: 18,
  },
  {
    id: 'demo_google_play_auction_instant_camera',
    title: 'كاميرا فورية بتصميم كلاسيكي',
    description: 'التقط اللحظة واطبعها فورًا بكاميرا أنيقة وسهلة الاستخدام.',
    categorySlug: 'electronics',
    image: 'instant-camera.png',
    startingPrice: 90000,
    minIncrement: 5000,
    durationHours: 30,
  },
  {
    id: 'demo_google_play_auction_classic_watch',
    title: 'ساعة أوتوماتيكية فاخرة',
    description: 'مينا أخضر عميق، هيكل مصقول وسوار جلدي أنيق لعشاق التفاصيل الكلاسيكية.',
    categorySlug: 'fashion-accessories',
    image: 'classic-watch.png',
    startingPrice: 140000,
    minIncrement: 10000,
    durationHours: 48,
  },
];

function redisConnection() {
  const value = new URL(process.env.REDIS_URL || 'redis://redis:6379');
  return {
    host: value.hostname,
    port: Number(value.port || 6379),
    username: value.username || undefined,
    password: value.password || undefined,
  };
}

async function uploadAsset(filename, folder, adminId) {
  const source = path.join(assetsDir, filename);
  const stat = fs.statSync(source);
  const key = `${folder}/google-play-${filename}`;
  const url = `/api/media/${key}`;

  await minio.fPutObject(bucket, key, source, { 'Content-Type': 'image/png' });
  await prisma.fileAsset.upsert({
    where: { key },
    create: {
      key,
      url,
      mimeType: 'image/png',
      size: stat.size,
      uploadedByAdminId: adminId,
    },
    update: {
      url,
      mimeType: 'image/png',
      size: stat.size,
      uploadedByAdminId: adminId,
    },
  });

  return url;
}

async function main() {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true, status: 'ACTIVE' },
    orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
  });
  if (!admin) throw new Error('No active AboEssa admin account is available for demo catalog ownership.');

  if (!(await minio.bucketExists(bucket))) await minio.makeBucket(bucket);

  const categoryBySlug = new Map();
  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, isActive: true },
      update: {
        name: category.name,
        icon: category.icon,
        isActive: true,
        sortOrder: category.sortOrder,
      },
    });
    categoryBySlug.set(category.slug, saved);
  }

  await prisma.category.updateMany({
    where: { slug: '', isActive: true },
    data: { isActive: false, sortOrder: 999 },
  });

  const assetUrls = {};
  for (const product of products) {
    assetUrls[product.image] = await uploadAsset(product.image, 'products', admin.id);
  }
  for (const auction of auctions) {
    assetUrls[auction.image] = await uploadAsset(auction.image, 'auctions', admin.id);
  }

  const now = new Date();
  for (const [index, product] of products.entries()) {
    const category = categoryBySlug.get(product.categorySlug);
    const publishedAt = new Date(now.getTime() - index * 3 * 60 * 1000);
    await prisma.productListing.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        title: product.title,
        description: product.description,
        categoryId: category.id,
        imageUrls: [assetUrls[product.image]],
        price: product.price,
        totalQuantity: product.quantity,
        availableQuantity: product.quantity,
        soldQuantity: 0,
        status: ProductListingStatus.ACTIVE,
        publishedAt,
        createdByAdminId: admin.id,
        createdAt: publishedAt,
      },
      update: {
        title: product.title,
        description: product.description,
        categoryId: category.id,
        imageUrls: [assetUrls[product.image]],
        price: product.price,
        totalQuantity: product.quantity,
        availableQuantity: product.quantity,
        soldQuantity: 0,
        status: ProductListingStatus.ACTIVE,
        publishedAt,
        createdByAdminId: admin.id,
      },
    });
  }

  const queue = new Queue('auction-close', { connection: redisConnection() });
  try {
    for (const auction of auctions) {
      const category = categoryBySlug.get(auction.categorySlug);
      const startsAt = new Date(now.getTime() - 10 * 60 * 1000);
      const endsAt = new Date(now.getTime() + auction.durationHours * 60 * 60 * 1000);
      await prisma.auction.upsert({
        where: { id: auction.id },
        create: {
          id: auction.id,
          title: auction.title,
          description: auction.description,
          categoryId: category.id,
          imageUrls: [assetUrls[auction.image]],
          startingPrice: auction.startingPrice,
          currentPrice: auction.startingPrice,
          minIncrement: auction.minIncrement,
          status: AuctionStatus.ACTIVE,
          tier: AuctionTier.NORMAL,
          startsAt,
          endsAt,
          originalEndsAt: endsAt,
          extensionSeconds: 180,
          extensionTriggerSeconds: 60,
          maxExtensions: 20,
          extensionsCount: 0,
          createdByAdminId: admin.id,
        },
        update: {
          title: auction.title,
          description: auction.description,
          categoryId: category.id,
          imageUrls: [assetUrls[auction.image]],
          startingPrice: auction.startingPrice,
          currentPrice: auction.startingPrice,
          minIncrement: auction.minIncrement,
          status: AuctionStatus.ACTIVE,
          tier: AuctionTier.NORMAL,
          startsAt,
          endsAt,
          originalEndsAt: endsAt,
          extensionSeconds: 180,
          extensionTriggerSeconds: 60,
          maxExtensions: 20,
          extensionsCount: 0,
          winnerCustomerId: null,
          winningBidId: null,
          soldOrderItemId: null,
          createdByAdminId: admin.id,
        },
      });

      const jobId = `auction-close-${auction.id}`;
      const oldJob = await queue.getJob(jobId);
      if (oldJob) await oldJob.remove();
      await queue.add(
        'close',
        { auctionId: auction.id },
        {
          jobId,
          delay: Math.max(0, endsAt.getTime() - Date.now()),
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    }
  } finally {
    await queue.close();
  }

  console.log(`DEMO_CATALOG_READY categories=${categories.length} products=${products.length} auctions=${auctions.length} images=${Object.keys(assetUrls).length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Demo catalog seed failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
