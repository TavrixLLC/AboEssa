# REZONA — المرحلة الثانية: تحسين الصور

**الحالة: تنفيذ واختبار محلي، غير منشور.** هذه المرحلة تضيف البنية والواجهة البرمجية ومكوّن Flutter المشترك. الشاشات المنشورة لا تزال تستخدم روابطها الحالية؛ استهلاك النسخ في الكروت والكاش القرصي والـpagination للمرحلة الثالثة. لا تغييرات في الشراء، المخزون، الدفع، المزايدة، الطلبات أو المصادقة.

## ما تغيّر

| الموقع | الوظيفة |
|---|---|
| [Prisma schema](../prisma/schema.prisma) و[مهاجرة الجداول](../prisma/migrations/202611160001_image_optimization/migration.sql) | جدول مهمة دائمة لكل asset/recipe، وبيانات النسخ مع تفرد asset/recipe/type/format. لم نكرر `imageUrls[]` في ProductMedia: المرجع الحالي وحالة النشر هما مصدر الموافقة. المنتج والمزاد يحتفظان بكيانيهما. |
| [فهرس المنتج](../prisma/migrations/202611160002_product_image_lookup/migration.sql) و[فهرس المزاد](../prisma/migrations/202611160003_auction_image_lookup/migration.sql) | GIN لروابط الوسائط، كل `CREATE INDEX CONCURRENTLY` في مهاجرة منفصلة. لا تغيير للبيانات التاريخية. |
| [الرفع](../src/uploads/uploads.service.ts) و[ضوابط multipart](../src/uploads/uploads.module.ts) | حدّ قبل buffering؛ فحص signature وMIME والأبعاد والبكسلات، وفك ترميز صارم. الأصل في MinIO بنفس البايتات. FileAsset والمهمة تُنشآن بعملية Prisma واحدة؛ API يرجع URL الأصلي من دون انتظار النسخ. |
| [وصفة الصور](../src/image-optimization/image-codec.ts)، [المعالج](../src/image-optimization/image-optimization.service.ts)، [عامل BullMQ](../src/image-optimization/image-optimization.runtime.ts) | تصحيح EXIF، إزالة metadata، حفظ النسبة دون تكبير، جودة متكيفة بحد أدنى، WebP وJPEG منفصلان. حالة PostgreSQL مستمرة؛ تنسيق التوزيع يحجز مهلة ويستعيد ما لم يصل إلى Redis. BullMQ يعيد المحاولة بتأخير متزايد، مع قيد وفصل المحاولات المتزامنة وكتابة metadata ذرية. |
| [مسارات النسخ](../src/image-optimization/image-variants.controller.ts) و[المسار القديم](../src/files/media.controller.ts) | manifest اختياري ووسائط برابط hash ثابت؛ مسارات النسخ تتحقق من ارتباط FileAsset الحالي بمنتج فعال متاح أو مزاد فعال لم ينته. المسار القديم بقي بنفس URL والمحتوى؛ cache policy صارت `no-store` للأصول التي يحتمل أن تكون مسودات أو مراجع قابلة للتغيير. |
| [Backfill](../src/maintenance/backfill-image-variants.ts) | dry-run افتراضي، دفعات، حدّ لكل تشغيل، إكمال من حالة DB، إعادة الفشل الصريحة. لا وصول لروابط خارجية أو حذف أو لمس لقطات الطلب. |
| Flutter `packages/shared_ui/lib/src/components/app_optimized_image.dart` | `AppOptimizedImage`: aspect ratio ثابت، اختيار بحسب مساحة الرسم وDPR، decode محدود بلا تكبير، WebP ← JPEG ← الأصل (أو العكس عند تفضيل JPEG)، placeholder محلي/نسخة 40px اختيارية. يتلقى manifest أو رابطاً قديماً؛ لا يجلب metadata تلقائياً لكل كارت. |

- **Manifest:** `GET /api/media/products/<original-filename>/variants` أو `auctions`. الرد عبر envelope المعتاد؛ الحقول `originalUrl`, `recipeVersion`, `variants[{type,format,url,width,height,fileSize}]`. إذا كانت المهمة لم تنته أو الصورة غير مؤهلة، الرد 404 و`no-store`؛ استعمل الأصل من بيانات المنتج.
- **Bytes:** `GET /api/media/catalog-variants/v/<asset-slug>-v1-<sha256>-<type>.<ext>`. الاسم مبني على هاش المحتوى، والتخزين تحت prefix منفصل غير مقروء من handler الأصول القديم. الاستجابة الصحيحة تُرسل MIME محدداً و`public, max-age=31536000, immutable`؛ الخطأ لا يُخزّن. أي وصفة جديدة تحتاج إصداراً جديداً، وأي أصل جديد يحتاج key جديد. إعادة محاولة بنفس الناتج لا تبدّل المحتوى تحت المفتاح.
- **الخصوصية:** مسار النسخ لا يصل إلى مفاتيح private أو منتج draft لم ينشر. أصل الرفع العام القديم كان قابلاً للوصول بالرابط، ولا نغيّر صلاحية القراءة التي تعتمد عليها نسخة الأدمن الحالية، لكن نوقف تخزينه العام. مرحلة intake الخاصة تستخدم مخزناً غير قابل للعنونة بهذه المسارات. صورة سبق نشرها قد تبقى في edge/client cache حسب immutable TTL؛ لا تعتبر رفع صورة حساسة ثم إخفاءها آلية إلغاء وصول. لا تضف Cache Rule عام على `/api/media/*`.

## الإعدادات

| المتغيّر | الافتراضي/الحدود | الأثر |
|---|---|---|
| `IMAGE_OPTIMIZATION_ENABLED` | `false` | `true` لتسجيل jobs تلقائياً لصور `products`/`auctions` وتشغيل العامل. إيقافه يوقّف المعالجة، ولا يقطع روابط النسخ المنشورة سابقاً. |
| `IMAGE_MAX_PIXELS` | 12,000,000؛ 1,048,576–20,000,000 | حدّ فك الترميز؛ 8192px لكل ضلع حد مستقل. JPEG وPNG وWebP أحادية الصورة فقط. |
| `IMAGE_OPTIMIZATION_CONCURRENCY` | 1؛ 1–3 | عدد jobs في كل عملية API. اضربه بعدد الـreplicas عند تقدير الحمل؛ ابدأ بـ1 على البنية الحالية. |
| `UPLOAD_MAX_BYTES` | 5,242,880؛ سقف pipeline 12 MiB | أصغر حد فعّال من Multer/الخدمة/Nginx يطبّق عند الرفع. Nginx يبقى على 10 MB لكل الطلب؛ لا نرفعه. |
| `UPLOAD_ALLOWED_MIME` | `image/jpeg,image/png,image/webp` | القائمة الحالية، بالإضافة إلى تطابق حقيقي مع نوع الملف. |
| `IMAGE_BACKFILL_DATABASE_URL` | مطلوب للأداة فقط | صرّح بقاعدة الهدف؛ الأداة لا تستخدم `DATABASE_URL` أو dotenv كبديل. |
| `IMAGE_BACKFILL_CONFIRM_DATABASE` | مطلوب عند `--apply` | يجب أن يطابق اسم قاعدة الهدف في URL؛ dry-run لا يحتاج التأكيد. |
| `REZONA_IMAGE_QA` | غير مفعّل | `1` يسمح للـintegration runner بالاتصال **فقط** بعنوان QA والـports المحلية المحددة أدناه. |

إعدادات Redis وMinIO الحالية تستخدم كما هي. Dispatcher يقرأ حتى 50 مهمة كل 5s ويتوقف مؤقتاً عند نحو 150 مهمة غير منتهية في Redis، ومع فقد Redis يبقى سجل PostgreSQL وتُعاد المحاولة تلقائياً بعد الحجز (حتى نحو دقيقة بعد محاولة توزيع فاشلة). بيانات العملاء خارج المعالجة والـbackfill. الخطأ الدائم يوقف المعالجة، والخطأ المؤقت له حتى 3 محاولات؛ لا أسرار أو محتوى صور في سجلات العامل.

## نتائج القياس — 10 أصول PNG في المستودع

`npm run build` ثم `node scripts/benchmark-image-variants.cjs`؛ أضف `--review` للحصول على مقارنة أصل مصغّر/نسخة WebP على نفس القياس. Runtime: Node 24 / Sharp 0.35.5 / libvips 8.18.7، تشغيل متسلسل على جهاز التطوير. زمن المعالجة يتضمن إنشاء 8 ملفات لا شبكة/DB/MinIO. المصادر كلها 1254×1254.

| الملف | الأصل KB | WebP 240 KB | WebP 480 KB | WebP 1024 KB | الوقت ms |
|---|---:|---:|---:|---:|---:|
| Air fryer | 1459.7 | 4.0 | 10.5 | 33.4 | 320 |
| Amber perfume | 1972.7 | 4.5 | 14.4 | 94.7 | 345 |
| Classic watch | 2032.8 | 5.1 | 17.5 | 95.5 | 395 |
| Cordless drill | 1824.7 | 5.5 | 17.1 | 66.9 | 338 |
| Espresso machine | 1779.7 | 4.9 | 14.9 | 62.5 | 387 |
| Headphones | 1600.0 | 3.7 | 10.5 | 45.6 | 318 |
| Instant camera | 1726.7 | 4.5 | 14.1 | 62.8 | 351 |
| Leather handbag | 2197.9 | 4.7 | 18.5 | 121.2 | 377 |
| Robot vacuum | 1652.1 | 4.4 | 12.7 | 43.7 | 317 |
| Smart watch | 2025.5 | 5.7 | 20.8 | 96.9 | 365 |
| **المتوسط** | **1827.2** | **4.7** | **15.1** | **72.3** | **351** |

- متوسط 40px WebP **0.37 KB**. JPEG المتوسط في 40/240/480/1024px: **0.68 / 7.94 / 24.69 / 103.28 KB**.
- الأصل إلى WebP 480px: **120.9× أصغر (99.17% أقل بايتات)** على هذه العينات مقارنة بـPNG الأصلي غير المعاد ترميزه. هذا قياس ملف وليس زمن تحميل أو hit rate. نسبة البكسلات عند 480² بدل 1254² نحو **6.8×** في عينة مربعة؛ ليس قياس heap.
- فحص جنب-إلى-جنب للساعات والمثقاب والكاميرا والإسبريسو والعطر: الحواف والنقش وعلامات الساعة بقوا واضحين بهذا الحجم، وظهر تنعيم طفيف بالملمس الدقيق وبعض تدرجات الخلفية. العينات شبه خالية من نص وصفي صغير قابل للقراءة؛ لا ادعاء لتحقق الباركود أو نص العبوات الفعلي، و1024px/الأصل يبقيان خيار التفاصيل.
- الأصل + **جميع 8 نسخ** متوسطه **2.056 MB**؛ زيادة تخزين **0.229 MB/صورة**، حوالي 12.5%. التقدير لنفس توزيع العينة دون نسخ احتياطية أو تكرار: **2.06 GB** لكل 1,000، **20.56 GB** لكل 10,000، **205.63 GB** لكل 100,000 (وحدات عشرية).
- فحص الإنتاج العام انتهت مهلة الاتصال قبل HTTP. نسخة Docker المحلية القديمة أعطت `200 image/png` و`Cache-Control: public, max-age=31536000, immutable` لصورة الاختبار. النسخة الجديدة فُحصت محلياً؛ لم نقس أو نغيّر Cloudflare/DNS أو ندّعِ Edge HIT.

## اختبارات وتكرارها

- **150** اختبارات Jest، **157** للزبون، **139** للأدمن، **10** لـshared_ui. تحليل مكوّن Flutter واختباره بدون نتائج سلبية. codec يغطي عدم التكبير، EXIF، سلامة الأصل، الأبعاد، صيغة/شفافية WebP وJPEG، الأحجام، وتلف المصدر.
- تكامل حقيقي على PostgreSQL 16 + Redis 7 + MinIO، مع Nest HTTP: رفع multipart بحدّ الحجم ورفض MIME/تلف، الأصل SHA-256 ومسار `/uploads/`، رفض المسودة وprivate namespace، إتاحة المنتج والمزاد المنشور، correct MIME/hash/cache لكل النسخ الثمان، وmanifest. تشغيل backfill على 10 fixtures + ملف تالف، dry-run بلا كتابة، تشغيل مرتين بلا صفوف مكررة، وفشل مؤقت مُحقَن بعد أول كتابة ثم إعادة BullMQ ناجحة بلا تكرار. ملف تالف بقي متاحاً كأصل ولم ينشر variant.
- DB QA طبّقت كامل سجل المهاجرات ومنه 3 مهاجرات Phase 2. اختلافات drift في جداول `AdminUser` و`InAppAd` و`LiveSession` من سجل المهاجرات السابق خارج النطاق؛ لا تستخدم `db push` أو `migrate reset` لحلها.

لإعادة الاختبار من مجلد السيرفر (PowerShell؛ فقط إذا المنافذ الثلاثة فارغة):

```powershell
docker run --rm -d --name rezona-phase2-qa-postgres -p 127.0.0.1:55442:5432 -e POSTGRES_USER=phase2_qa -e POSTGRES_PASSWORD=phase2-test-local-only -e POSTGRES_DB=rezona_phase2_qa postgres:16-alpine
docker run --rm -d --name rezona-phase2-qa-redis -p 127.0.0.1:56382:6379 redis:7-alpine
docker run --rm -d --name rezona-phase2-qa-minio -p 127.0.0.1:59042:9000 -e MINIO_ROOT_USER=phase2-qa -e MINIO_ROOT_PASSWORD=phase2-test-local-only minio/minio:RELEASE.2025-04-22T22-12-26Z server /data
$env:DATABASE_URL='postgresql://phase2_qa:phase2-test-local-only@127.0.0.1:55442/rezona_phase2_qa'
npm run prisma:deploy
npm run build
$env:REZONA_IMAGE_QA='1'
node scripts/phase2-image-integration.cjs
```

منفّذ الاختبار يزرع صفوفاً وعناصر اختبار فقط في قاعدة QA؛ افحص أسماء الحاويات قبل إيقاف الحاويات الثلاث التي أنشأتها للاختبار. لا تشغّله ضد نسخة تشغيل عادية.

## دليل النشر والاسترجاع — خطوات مستقبلية فقط

1. اعزل patch المرحلة الثانية عن التعديلات الأخرى غير المرفوعة. خذ نسخة من قاعدة البيانات وMinIO، واختبر استرجاعها في staging. تأكّد من بناء Docker على Linux بـNode 24 و`npm ci` **مع optional dependencies** لتركيب Sharp وفق المنصة. اختبارات هذا التقرير شغّلت Node على Windows وموارد QA داخل Docker؛ Docker Hub لم يحلّ DNS لصورة Node على هذا الجهاز، فلم يُختبر بناء Linux النهائي هنا. [تثبيت Sharp](https://sharp.pixelplumbing.com/install/).
2. طبّق `npm run prisma:deploy` على staging ثم الإنتاج بعد الموافقة. المهاجرات additive، وفهارس البحث online؛ راقب أي index غير صالح عند فشل CREATE INDEX CONCURRENTLY قبل استكمال النشر. لا تستبدل الأصلي أو تتجاوز مهاجرة فاشلة تلقائياً.
3. انشر API مع `IMAGE_OPTIMIZATION_ENABLED=false`، افحص `/ready` وروابط `/api/media/` و`/uploads/` والمنتج/المزاد بالعميل القديم. بعدها فعّل العامل في staging/نسخة تشغيل تجريبية بـconcurrency=1، افحص upload وترقّب اكتمال manifest ونسخة واحدة بالـhash والـheaders، وقِس CPU/RSS وعمق queue قبل التوسعة.
4. شغّل الأداة على قاعدة مصرح بها بإعداد `IMAGE_BACKFILL_DATABASE_URL` من مخزن أسرار؛ الأمر الافتراضي يقرأ فقط:

   ```powershell
   node dist/src/maintenance/backfill-image-variants.js --limit=200 --batch-size=25
   # بعد dry-run وموافقة مستقلة، اضبط IMAGE_BACKFILL_CONFIRM_DATABASE للاسم الصحيح:
   node dist/src/maintenance/backfill-image-variants.js --apply --limit=200 --batch-size=25
   # بعد معالجة سبب الفشل، فقط إذا أردت إعادة جدولة الصفوف الفاشلة:
   node dist/src/maintenance/backfill-image-variants.js --apply --retry-failed --limit=25
   ```

   أوقف بين الدفعات عند ضغط Redis/MinIO أو ارتفاع latency البيع/المزاد. الصفوف `PENDING / PROCESSING / COMPLETED / FAILED` هي نقطة التقدّم، والمفاتيح الفريدة تمنع إعادة الجدولة العادية. الملفات التالفة أو الخارجية التي لا يوجد لها FileAsset محلي تبقى على fallback؛ لا تنزيل remote. لن تمس الأداة صور الطلبات أو تحذف ملفاً.
5. إذا يلزم الرجوع، أوقف العامل وارجع لنسخة API سابقة متوافقة، مع إبقاء الجداول والأصول. إذا اعتمد عميل لاحقاً النسخ، يجب أن يحتفظ بالـfallback ويقرأ manifest دون إلزام. التراجع لا يسترد ملفاً سبق نشره في CDN؛ أي إجراء purge يحتاج تفويضاً. لا تُفعّل R2/Cloudflare Images أو AI بهذه المرحلة.

**حدود تشغيلية:** لا تكرار للشاشات أو تغيير العقود القديمة، فلا وفورات مرئية في التطبيق قبل ربط Phase 3. لا تغيير على `OpenAPI` الرسمي لأن مسارات media مثل الأصل مستبعدة منه. العرض يدعم الأصول المعتمدة ذات روابط MinIO المعروفة؛ الروابط الخارجية و`/uploads/` تعمل كأصول بلا variants. راقب مساحة الملفات الجزئية غير المشار إليها إذا فشلت مهمة بعد كتابة بعض النسخ؛ إعادة التشغيل تعيد استخدام نفس مفاتيح المحتوى ولم نضف حذفاً تلقائياً. حدود الجودة، ذاكرة الخادم على صور ملصقات حقيقية، وCDN ينبغي قياسها في staging. لا تغيّر بايتات أصل تحت key قديم حتى لو كان ملف seed.
