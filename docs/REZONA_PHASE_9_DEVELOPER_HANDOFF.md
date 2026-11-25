# REZONA — تسليم المطوّر لإكمال المرحلة 9

تاريخ الحالة: **2026-11-25، Asia/Baghdad**. هذا الملف دليل استمرار العمل من مستودعات GitHub، وليس تصريح نشر. القيم ونتائج الاختبار أدناه لها تاريخ؛ لا تعرضها كقياسات حية جديدة.

## 1. أين توقفنا؟

**المرحلة 9.2: مقترح البنية مكتمل، لكن خادم staging المنفصل لم يُجهز. STAGING FAIL / NOT PROVISIONED؛ PRODUCTION NO-GO.** اختار المالك الانتقال إلى خادم staging مستقل بدلاً من مشاركته مع الإنتاج. لم يزوّد خادماً بديلاً، ولم يعتمد مزوّداً/خطة/منطقة/سعراً نهائياً. لا تعتبر عدم الإجابة موافقة على الشراء.

المطلوب التالي: الحصول من المالك على خادم احتياطي لفحصه قراءةً فقط، أو موافقة محددة على المزود والمواصفات والمنطقة والتكلفة النهائية وسقف الإنفاق والصلاحيات. بعد ذلك تُستكمل بوابات staging أدناه. لا تبدأ المرحلة التالية أو الإنتاج تلقائياً.

هذا التسليم يرفع الكود والتوثيق فقط على فرع `handoff/phase9-20261125` في:

- Backend العام: [TavrixLLC/AboEssa](https://github.com/TavrixLLC/AboEssa/tree/handoff/phase9-20261125).
- Flutter الخاص: [TavrixLLC/AboEssaMobile](https://github.com/TavrixLLC/AboEssaMobile/tree/handoff/phase9-20261125).

الأساس قبل حفظ التعديلات: backend `4f83036738dc4cec852d8743ec7baf70d3277f0b`؛ mobile بعد fast-forward الآمن `66430e8`، ويشمل تحديث iOS البعيد مع بقاء العمل المحلي. هذا الفرع ليس merge إلى `main` ولا إصداراً منشوراً. إنشاء commit جديد لا يعيد ختم الأدلة القديمة ولا يجعل APK المحفوظ مبنياً من commit التسليم تلقائياً.

## 2. اقرأ هذه الملفات بالترتيب

1. [مقترح staging المستقل 9.2](rezona-phase-9-2-dedicated-staging.md): أحدث قرار للبنية والميزانية والتسلسل.
2. [سجل قبول staging](rezona-protected-staging-acceptance.md): الحالة الحالية أعلى الملف؛ الأجزاء اللاحقة موسومة تاريخية.
3. [مراجعة إطلاق المرحلة 9](rezona-phase-9-production-launch.md).
4. [قائمة cutover والترحيل والرجوع](rezona-phase-9-cutover-checklist.md).
5. [مواصفة المراقبة بعد الإطلاق](rezona-phase-9-post-launch-monitoring.md).
6. [جاهزية إصدار Admin](rezona-admin-production-release-readiness.md) و[دليل المشغل](rezona-admin-production-runbook.md).
7. [تسليم Flutter](https://github.com/TavrixLLC/AboEssaMobile/blob/handoff/phase9-20261125/PHASE_9_HANDOFF.md).

تنبيه: روابط `benchmarks/...` في التقارير تشير إلى أدلة محلية خاصة غير مرفوعة إلى GitHub. اقرأ [سياسة إتاحة الأدلة](benchmarks/README.md). اطلب الحزمة الآمنة من المالك قبل اعتماد اختبار سابق؛ غيابها ليس PASS.

## 3. المعمارية وما يحتويه الكود

Backend متجر واحد مبني على NestJS/TypeScript وPrisma/PostgreSQL، Redis/BullMQ، Socket.IO، ومخزن كائنات S3-compatible. REST تحت `/api`، و`/health` و`/ready` للفحوص. عمليات الـworkers موجودة داخل عملية API؛ ليست خدمة يمكن تركها بإصدار قديم عند تحديث API. واجهتا Customer وAdmin مبنيتان بـFlutter مع حزم مشتركة في `packages/`.

| المجال | مكانه / الملاحظات |
| --- | --- |
| الدخول والصلاحيات | `src/admin-auth`, `src/auth`, `src/permissions`, `src/common/guards`؛ JWT rotation/revocation، Argon2id، RBAC وownership، audit. هذه ليست إثبات MFA مطبق |
| المنتجات والبحث | `src/products`, `src/catalog`؛ بحث عربي، cursor pagination وكاش/صور محسّنة في Flutter |
| صور Phase 2 | `src/image-optimization`, `src/files`, `src/uploads`؛ الأصل محفوظ، variants، ملكية وخصوصية وسلسلة مصدر |
| المخزون Phase 4 | `src/inventory`؛ ledger، allocations ومواقع؛ لا تعدّل المخزون مباشرةً بـSQL |
| الإدخال Phase 5 | `src/product-intake`؛ NEW وSTOCK_IN transactional، drafts، مراجعة المكرر وidempotency |
| التعرف Phase 6 | `src/ai`؛ provider/budget/duplicate review. لا تعرض mock كتعرف حقيقي |
| الاستوديو Phase 7–7.3 | `src/image-enhancement`؛ عزل محلي/guided، تركيب يحفظ foreground، fal، 20 قالباً ومراجعة الموظف |
| التجارة | `src/sales`, `src/auctions`, `src/shipping` وبقية وحدات الطلب/المحفظة؛ احتفظ بالسلوك الحالي ولا تعِد تصميم القواعد أثناء النشر |
| Flutter Admin | `apps/admin_app/lib/features/inventory` و`product_intake` وadmin console |
| Flutter Customer | `apps/customer_app`؛ الحزم المشتركة `api_client`, `shared_ui`, `app_models`, `secure_storage` وغيرها |

إزالة Display App مقصودة بطلب سابق للمالك، وتشمل المسارات/الاختبارات الخاصة به. لا تُرجعه لتسوية اختلاف git. بعض persistence التاريخي معطل لأغراض توافق، ولا يُحذف schema اعتباطياً.

## 4. ما تم التحقق منه فعلاً وحدود النتائج

النتائج التالية **تاريخية ومحلية** وليست قبول staging العام:

- 445 اختبار backend unit، 203 Admin، 166 Customer source، 27 E2E، و11 مجموعة intake و16 مجموعة commerce/inventory. اختبارات 20 قالباً/39 mode pairs استعملت transport محاكياً؛ ليست 39 استدعاءً مدفوعاً.
- مراجعة Phase 9 أعادت 32 اختباراً مركزاً: حراس الإصدار، S3، dependency contracts، وfal error diagnostics. يوجد إخفاق timing سابق لاختبار tabletop أصلي محفوظ؛ لا تُخفه بإعادة تصنيف النتائج.
- آخر npm audit محفوظ: production صفر، وكامل graph فيه 17 moderate dev-only، دون high/critical. هذا **ليس** فحص OS أو صور Docker أو Flutter؛ أعد الفحص في بيئة build معزولة قبل الإصدار ولا تستخدم `npm audit fix --force`.
- فحص إنتاج-mode Linux محلي وAPK signature/hash نجحا؛ لا يوجد قبول جديد لشبكات HTTPS أو MFA أو نسخة Customer منشورة على staging.
- Phase 9.1 شغّل ثم أوقف profile محلياً محدوداً `rezona-p91-786dbfa4`، دون host ports. نجحت 3 صور synthetic 12MP متسلسلة، 8 variants للصورة، hash الأصل، preview خاص، S3 محدود واستعادة synthetic.
- الصور الاصطناعية كانت مضغوطة 95–97KB؛ ليست صوراً واقعية 5MiB أو حمل موظفين متزامن. استعادة DB synthetic (~177KB) في 2573ms ليست RTO لبيانات الإنتاج. لا تنقل هذه الأرقام كضمان أداء.

**فحوص أعيدت أثناء تجهيز تسليم GitHub بتاريخ 2026-11-25:** نجح `tsc --noEmit`، والاختبارات الأربعة المركزة 32/32، واختبارات Flutter Admin 203/203 وCustomer 166/166، و`flutter analyze` لكامل monorepo دون مشاكل. لم يُعد تشغيل كامل backend unit أو E2E أو QA/أجهزة/staging؛ لم يحدث build أو تثبيت أو inference مدفوع. نجاح هذه الفحوص لا يغيّر NO-GO ولا يختم artifacts سابقة من جديد.

### ميزانية موارد ابتدائية، لا اعتماد سعة نهائي

| الخدمة | حد RAM محلي | CPU | أعلى RAM محلي مرصود |
| --- | --- | --- | --- |
| API + workers | 1024MiB | 1 | 274.2MiB |
| PostgreSQL | 512MiB | 0.5 | 125.2MiB |
| Redis | 128MiB | 0.25 | 8.3MiB |
| S3/Silo | 768MiB | 0.5 | 405.6MiB |

المجموع الأساسي 2432MiB/2.25 core؛ مع probe وgateway وmonitor المقترحة 3200MiB/3 cores. الخادم المقترح مبدئياً Linux/amd64، 4vCPU، 8GiB، SSD لا يقل عن 100GB، Ubuntu 24.04 LTS. gateway/monitor وحدود I/O وعتبات الإيقاف لم تُقبل على خادم فعلي. لا تستعمل عتبة available RAM القديمة 6GiB لخادم مستقل 8GiB. مواصفات وأسعار العرض في تقرير 9.2 مؤرخة 2026-11-25، ليست شراءً معتمداً أو عرض checkout نهائياً.

## 5. بوابات تمنع النشر

1. **بنية staging والوصول:** اختيار الخادم، التحقق من هويته ومواصفاته والنسخ الاحتياطية؛ HTTPS وMFA/بديل قوي متوافق مع Flutter وsockets وprivate media؛ منع منافذ PG/Redis/S3 الإدارية العامة والوصول إلى الإنتاج. أسماء الموارد الحالية في 9.2 اقتراحات فقط.
2. **تخزين مدعوم وآمن:** live MinIO القديم لم يُصلَح بتحديث npm. اختُبر Silo محلياً فقط؛ يلزم قبول ترخيص AGPL/المسؤول عن الصيانة، فحص image/OS، IAM غير root، اختبار cross-bucket/admin denials وrestore. لا تركّب volume الإنتاج القديم على بديل تجريبي.
3. **تاريخ migrations:** 19 مطبقة وفق آخر فحص حي، 40 في المصدر، أي 21 معلقة. اختلاف checksum تاريخي أدناه لم يُحل رسمياً. ممنوع reset أو تعديل `_prisma_migrations` لتجميل النتيجة.
4. **الترحيل والمخزون:** rehearsal فعلي 19→40 وتوقيت locks/maintenance، backfill dry-run ثم تطبيق مصرح على clone، وإعادة reconciliation. لا تخمّن كميات أو رفوفاً فعلية.
5. **توافق العملاء:** APK Customer المنشور فعلاً مقابل migrated HTTPS staging، وليس rebuild جديداً يُسمى نسخة قديمة؛ اختبار شراء/COD/محفظة/مزايدات/إغلاق وفائز/طلبات وشحن/إلغاء ورد مبلغ/بحث عربي وصور وpagination وsockets ببيانات synthetic فقط.
6. **Admin والتوقيع:** تجربة release موقّع على جهاز Android فعلي، Wi-Fi وهوتسبوت بيانات؛ خطة انتقال من Debug إلى production cert ونسخ journals/drafts دون حذف غير مأذون.
7. **التعافي والتشغيل:** نقطة نسخ متناسقة DB+S3+Redis/jobs+uploads+config، نسخة مشفرة خارج الجهاز، اختبار استعادة وخطة rollback متوافقة بعد الكتابة الجديدة؛ إنذارات تصل فعلياً لمستلم معتمد، وليس specification فقط.
8. **موافقة إطلاق أخيرة:** لا تنشر إلى الإنتاج، تغيّر DNS/credentials/firewall، تشتري خدمة، تدفع AI، تثبّت APK أو تقبل/تنشر صوراً تلقائياً بناءً على هذا التسليم.

## 6. قاعدة البيانات وتسلسل العمل الآمن

المشكلة التاريخية: `202609190001_auction_optional_featured_rarity`.

- checksum المسجل في DB: `fff0ea321e491ef40ce5ba3fd46d70950d8f3e6523bacb8fe246695449fdbb03`.
- checksum المصدر/النسخة المنشورة/الأرشيفات الثلاثة: `4388744932e623810a54f5f5262a201ef0bb3b183fd38bebf3e3286d655556b5`.
- إعادة بناء مستقلة لـ19 migration طابقت schema المستعاد؛ سبب الفرق في SQL الأصلي **غير معروف**. يلزم record disposition يراجعه DBA/الأمن/المالك مع أدلته وخطة غير هدامة واختبار Prisma المثبت. النجاح التشخيصي المحلي السابق 19→40 ليس تلك الموافقة.

الترتيب المطلوب بعد تصريح staging:

1. خادم منفصل، secrets جديدة، شبكات وvolumes معزولة وحدود موارد/قرص/logs، فحص security وTLS/strong access وإيقاف آمن مقيد بمعرّفات هذا المشروع فقط.
2. نقل artifact متحقق من hash؛ لا build على خادم الإنتاج ولا إعادة استخدام v1.
3. حفظ نسخة snapshot الأصلية مغلقة. restore التاريخ في lane offline معزول عن API؛ entrypoint يتوقع `postgres` و`live_commerce` وpostgres user، لذلك DB ثانية داخل cluster يصل إليه API superuser ليست عزلاً كافياً.
4. disposition للتاريخ ثم timed clone migration/reconciliation. لا تشغّل API على raw financial clone؛ auction/BullMQ workers تعمل مع API ولا يوجد تعطيل عالمي مثبت لكل workers.
5. تجهيز lane قبول anonymized/synthetic، وإبطال جلسات/أسرار العملاء المنسوخة وعزل push/payment/AI/external callbacks قبل أي وصول أو تشغيل. لا تغيّر النسخة التاريخية الأصلية لإجراء الاختبارات.
6. فحص S3/IAM/الصور/NEW/STOCK_IN/المدفوعات/المخزون/الأجهزة/old clients/failures/المراقبة والrestore، ثم تحديث سجل staging بالأدلة الحقيقية والنتائج الفاشلة أيضاً.
7. إن نجحت كل البوابات، اقترح cutover محدداً وتوقيتاً وrollback متوافقاً واطلب GO صريحاً جديداً. لا تنفّذ live migrations تلقائياً.

ترتيب الـ21 migration هو ترتيب مجلدات `prisma/migrations` بعد آخر 19، من `202611160001_image_optimization` إلى `20261123000200_studio_media_roles`؛ القائمة التفصيلية في cutover checklist. تحقق من الأسماء/checksums والحالة الحية من جديد وقت التصريح، لا تعتمد العدد وحده.

Backfill الحالي: `POST /api/admin/inventory/backfill`، صلاحية `INVENTORY_MIGRATE`، `dryRun=true` افتراضياً، `limit<=50` وcursor `afterId`. يستعمل مصدر available+pending مع `SYS_LEGACY / UNALLOCATED_LEGACY` كحساب legacy **لا كموقع فعلي**؛ الحالات غير المدعومة تحتاج مراجعة. لا تنفذه live الآن. بمجرد وجود mapped inventory، API نوفمبر القديم ليس rollback معتمداً؛ إخفاء feature flag لا يلغي invariants.

## 7. artifacts المقبولة والمحفوظة خارج Git

هذه الملفات لا تُنزل من المستودع. اطلب نقلها الآمن من المالك وتحقق من hashes؛ إذا أُعيد build فهي artifacts جديدة تحتاج قبولاً جديداً.

| artifact تحت `D:/rezona-admin-hardening/run-130f0653/` | bytes | SHA-256 |
| --- | --- | --- |
| `rezona-admin-api-1.1.0-3-130f0653-v2-image.tar` | 307438592 | `9627212a7f6c1b0637f44c1a145a17df8e8a99c9938b75a446a8dd7a31754480` |
| `backend-source-v2.tar` | 2091520 | `ce79b2c4a4aa3ad813e98223cc414a281c3dd7b512f5dc123519e7bbec9e8838` |
| `rezona-admin-v1.1.0-3-production.apk` | 72419106 | `d866a50ebd55cfb854eb6dcc978cab79fcb680bfcc75aade5f180b3decdd528a` |

Backend tag `rezona-admin-rc:130f0653-v2`، Docker-reported identity/RepoDigest `sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48`. Config blob منفصل `sha256:d53111748836b5692a6b4142f64622ef9d7d86cb10463269e40b3d5f2363cfd7`. ليس إثبات remote registry/pull. **v1 مرفوض** بسبب dist path؛ لا تستخدم tag غير مؤهل أو archive قديم. آخر toolchain: Node 24.22.3، Prisma lock 6.19.3، sharp 0.35.5، Linux amd64/non-root، entry `dist/src/main.js`.

Admin: `com.singlestore.admin_app`، `1.1.0+3`، entry `lib/main.dart`، شهادة SHA-256 `2b768b09c968ba8ebcb3652d959f3e7936ffa143f601a27504dd7d274808850a`. التطبيق القديم Debug-signed مختلف، فلا تحديث in-place. مفتاح الإنتاج و`signing.dpapi` وmetadata في `C:/Users/3ma/Documents/aboessa-secrets/rezona-admin-release/`؛ ليست داخل Git أو Flutter، وDPAPI مرتبط بمستخدم Windows. يلزم backup ونقل آمن معتمد، ولا تُقرأ أو تطبع الأسرار في التقارير.

## 8. الأدلة الخاصة والبيانات الحية

Namespaces محلية داخل backend `docs/benchmarks/`:

- `admin-production-hardening/130f0653`: artifacts، restore، signing وhardening.
- `phase9-release-review/0f3e402b`: hashes، 32 tests، audit، migration manifest ومراجعة الإصدار.
- `phase91-host/158d63fa`: آخر continuity قراءة فقط، **2026-11-25T05:18:36Z**.
- `phase91-envelope/786dbfa4`: caps/cgroups، synthetic workload/recovery وseal.
- `phase92-infrastructure/acc6c8d1`: المقترح، عروض الأسعار العامة، النسخة الأصلية من سجل 9.1 وseal.

آخر live API معروف: `sha256:aaef434fb83436522ec03b488a67e367928d806205a3793f006f5adfb8064c03`؛ `/opt/aboessa/current` إلى `/opt/aboessa/releases/20261102-guest-account`. في فحص 2026-11-25T05:08Z: 19 migrations، 6 products، 23 auctions، 3 orders، 19 customers، 10 FileAssets، 11 WalletEntries. هذه ليست حالة حية أو reconciliation جديدة. عنوان الخدمة الإنتاجية في التقارير؛ لا تستعمله كبيئة اختبار. بيانات SSH لا تُرفع ولا تُلصق بالمحادثة؛ تحقق من host fingerprint بقناة مالك مستقلة قبل أي تصريح اتصال جديد.

النسخ المشفرة في `D:/rezona-admin-hardening/run-130f0653/private-production-backup/` مرتبطة بـDPAPI وملف مستخدم Windows. هي snapshots online/non-quiesced، ليست نقطة cutover متناسقة أو backup محمولاً خارج الجهاز. originals/صور الموظفين، الأرصدة والبيانات الشخصية، tokens ومفاتيح المزود والتوقيع لا تُضاف إلى المستودع العام. لا تفكها/تنقلها دون موافقة وقناة آمنة.

لا تحذف namespaces الفاشلة أو تغيّر الأدلة المختومة لعرض نتيجة أفضل. آخر profile محلي 786dbfa4 متوقف مع volumes محفوظة؛ توجد QA stacks أقدم. ممنوع `docker system prune` أو تنظيف شامل باعتباره خطوة إعداد.

## 9. AI وخصوصية الصور — تبقى مقيدة

الافتراضي composition محلي محايد يحفظ المنتج الحقيقي. احتفظ بالأصل وapproved masks/source lineage؛ الموظف يراجع قبل الاستخدام. AI_PROMOTIONAL يبقى خاصاً/ثانوياً ولا يحل محل factual image تلقائياً. رفض unsafe segmentation أو تغيّر brand/text/shape/duplicate product ليس سبباً لإخفاء التحذير أو تشغيل retries.

في Stage A أبقِ dispatch/live/mock approvals و`PRODUCT_STUDIO_ENABLED` و`REAL_PRODUCT_STUDIO_REVIEW_ENABLED` وprepaid experiment وAI recognition/live calls وGemini/fal/tabletop/premium live flags و`IMAGE_NEURAL_SEGMENTATION_ENABLED` **OFF**. `PRODUCT_STUDIO_PROVIDER=fal` يمكنه عرض catalog القوالب دون مفتاح أو inference. تحقق من قائمة env الدقيقة في runbook؛ لا تحتاج المفتاح للتصفح.

لا صلاحية إنفاق جديدة هنا. بعض fal charges السابقة غير محسومة: لا تحول reservation إلى charge ولا تُحرر UNKNOWN. الدفعة التاريخية `ff4e41c6` مبلغها المثبت $0.254955؛ إجمالي كل المحاولات التاريخية غير معروف، والحجوزات/commitments السابقة $1.044480 منفصلة محفوظة. لا تُعرض أرصدة قديمة كرصيد حالي. أي اختبار مدفوع جديد يحتاج موافقة المالك بعد reconciliation، بحدود واضحة وبدون retries/model fallback تلقائي.

## 10. بدء آمن للمبرمج الجديد

ابدأ من فرع التسليم في المستودعين مع `git status` وحفظ أي عمل محلي. استخدم `.env.example` كنموذج فقط وsecrets محلية جديدة لبيئة معزولة؛ لا تنقل env الإنتاج إلى جهاز التطوير. لا تحدث lockfiles تلقائياً.

فحوص backend محلية بعد توفير Node/الحزم المثبتة، من جذر `AboEssa`:

```powershell
npm ci
npm run prisma:generate
npx tsc --noEmit
# Offline-style unit checks: no integration/QA/SSH/pilot runner.
$env:NODE_OPTIONS='--require ./scripts/studio20-network-fence.cjs'
npm test -- --runInBand --runTestsByPath tests/unit/admin-production-release.spec.ts tests/unit/minio-s3-storage.spec.ts tests/unit/dependency-security.spec.ts tests/unit/fal-error-diagnostics.spec.ts
Remove-Item Env:NODE_OPTIONS
```

راجع env والسكربتات قبل تشغيلها؛ fence يمنع external `fetch` في عملية الاختبار، وليس firewall عاماً لكل transport. `npm ci` قد ينفذ install scripts/تنزيلاً عادياً، فلا تشغله بحساب إنتاج أو بأسرار حية. إذا ضبطت `NODE_OPTIONS` مسبقاً احفظه واستعده بدلاً من إزالته. لا تستخدم `npm run lint` كفحص غير معدل لأنه يحتوي `--fix`؛ استعمل ESLint بلا `--fix` عند الحاجة.

أدوات `scripts/phase*`, `admin-hardening-*`, `real-fal-*`, `premium-3d-*`, `studio20-*` تشمل عمليات QA/شبكة/إنفاق/تثبيت وأسماء تشغيل مغلقة ومسارات `D:`. ليست setup عاماً ولا تُنفّذ دفعة واحدة. راجعها، وانشئ namespace جديداً no-overwrite ودليلاً جديداً عند التصريح؛ لا تعِد تشغيل finalized scripts فوق نتائج قديمة. `phase91-safety-policy.cjs` مقيد بأسماء p91؛ جهّز allowlist مراجَعاً للمشروع الجديد ولا تستبدل الأسماء عالمياً.

للـFlutter اتبع ملف تسليم mobile: locked/offline pub resolution، analyze وunit tests، ثم لاحقاً signed-device acceptance بتصريح منفصل. لا تغير routes أو DTO أو payment/stock rules لاجتياز الفحوص.

## 11. ماذا يسلّم المبرمج عند اكتمال 9؟

تقرير جديد مؤرخ يميز VERIFIED / FAILED / UNKNOWN، قائمة host/artifact/config identities بلا أسرار، disposition للتاريخ، migration/recovery timings، counts والـledger/media reconciliation، نتائج الأجهزة والنسخة المنشورة، resource/security/IAM/access tests، alert delivery، وقائمة استثناءات ومخاطر صريحة. حدّث staging ledger بوضوح دون مسح التاريخ، ثم اطلب قبول المالك وGO محدداً للإنتاج. **ما دام أي gate إلزامي غير مقبول، تبقى production NO-GO.**
