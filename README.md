# منظومة متابعة حلقات القرآن — مركز مضايا الثقافي

تطبيق ويب (PWA قابل للتثبيت ويعمل بدون إنترنت) لمتابعة الطلاب على **مسارات مستقلة**: الحفظ،
التلاوة، المراجعة، التلقين، العربية (بالصفحات)، والتربية، إضافة للحضور. المواصفات الكاملة في
`2026-10-06-tracks-halaqat-reporting.md` (خارج المستودع). راجع `PROJECT_ANALYSIS.md` لتاريخ المشروع
وتحليل الـ prototype الأصلي `quran_halaqat_tracker_tarbawi_v2-2.html`.

> المشروع بدأ بـ Express + Prisma ثم تحوّل إلى **Next.js + Supabase Auth + RLS مباشرة**. نسخة
> Express القديمة محفوظة محليًا في `_deprecated_express_backend_prototype/` (غير متتبّعة بـ git).

## البنية

```
app/                    Next.js App Router
  login/page.tsx         الدخول برمز OTP على البريد (shouldCreateUser: false)
  page.tsx               → <AppShell/>
  api/admin/teachers/    Route Handlers الوحيدة (تحتاج service_role لإنشاء حساب Auth)
components/
  AppShell.tsx           التنقل: الطلاب · التلقين · التقارير · الإدارة (للمدير) + شارة المزامنة
  StudentCard.tsx        بطاقة الطالب: الحضور، موقعه في كل مسار، وأقسام المسارات
  card/                  أقسام البطاقة (Quran tracks، العربية، التربية)
  sections/              Students (البحث والإضافة)، Talqeen، Reports، Manage
lib/
  offline/idb.ts         غلاف IndexedDB
  offline/store.ts       طبقة البيانات المحلية: outbox + حلقة المزامنة (push ثم pull)
  quran.ts               حسابات المصحف (فهرس الآيات، الطول، التحقق، التغطية)
  progress.ts            "الموقع الحالي" لكل طالب، يُحسب محليًا
  arabic.ts              مطابقة الأسماء العربية (همزات، تاء مربوطة، ألف مقصورة...)
public/sw.js             service worker لواجهة التطبيق (يفتح بدون إنترنت)
supabase/migrations/     ملفات SQL لكل تعديل على قاعدة البيانات منذ 2026-10-07
```

**القراءة والكتابة كلها محلية أولًا.** الواجهة تقرأ من نسخة محلية (IndexedDB)، وكل تعديل يُكتب
محليًا ويُضاف إلى outbox. حلقة المزامنة ترسل الـ outbox إلى Supabase (upsert مفتاحه UUID يُولَّد على
الجهاز، فإعادة الإرسال لا تكرّر شيئًا)، ثم تسحب ما تغيّر منذ آخر سحب (`updated_at`). المزامنة تعمل
عند فتح التطبيق، وعند عودة الاتصال، وعند العودة للتطبيق، وكل دقيقة. الحماية الفعلية كلها في
**RLS** داخل قاعدة البيانات.

## قاعدة البيانات

Supabase (مشروع `quran-halaqat-tracker`، `eu-central-1`، ref `nmjxwhuuyhuxgstiijlt`).

| الجدول | الغرض |
|---|---|
| `profiles` | الدور (`ADMIN` / `TEACHER`) والحالة لكل مستخدم Auth |
| `circles` | الحلقة = اسم نصي حر فريد + `active`. ينشئها المدير فقط |
| `students` | حلقة واحدة لكل طالب + `active` (الأرشفة للمدير فقط) |
| `quran_entries` | الحفظ/التلاوة/المراجعة/التلقين. النطاق قد يمتد عبر عدة سور |
| `attendance` | صف واحد لكل (طالب، يوم) |
| `talqeen_sessions` | جلسة تلقين لحلقة؛ تُنشئ إدخال TALQEEN لكل طالب معلَّم |
| `arabic_books`, `student_arabic_enrollments`, `arabic_entries` | مسار العربية بالصفحات |
| `edu_notes` | مسار التربية (عمود `points` مخفي حتى تصميم التقييم) |
| `deprecated_v1_daily_records`, `deprecated_v1_tilawah_records` | الجداول القديمة، مؤرشفة للقراءة فقط |

أعمدة المزامنة في كل جدول قابل للمزامنة: `updated_at` (يضبطه trigger، ويُستخدم للسحب)،
`updated_by`، `edited_at` (وقت التعديل على الجهاز؛ **آخر تعديل يفوز**)، و`deleted_at` (حذف ناعم).

الدوال: `save_talqeen_session` (جلسة التلقين كاملة في transaction واحدة)، `report_data` (بيانات
التقارير)، `sync_latest_quran_entries` و`sync_latest_arabic_entries` (للتنزيل الأول)، والـ view
`student_progress`. كلها `security invoker` فتبقى RLS مطبّقة.

**الـ migrations:** كل تعديل جديد يوضع في `supabase/migrations/` ويُطبّق على المشروع، ثم يُعاد
توليد `lib/supabase/database.types.ts`. الـ migrations قبل 2026-10-07 (من `init_schema` إلى
`auto_provision_self_signup_profile`) موجودة فقط في سجل المشروع على Supabase.

## التشغيل محليًا

```bash
npm install
cp .env.local.example .env.local   # اترك SUPABASE_SERVICE_ROLE_KEY فاضي إن لم تحتجه
npm run dev
```

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: عامة، معبّأة مسبقًا.
- `SUPABASE_SERVICE_ROLE_KEY`: **سرّي، للسيرفر فقط**. مطلوب لإضافة محفّظ ولإعادة تعيين كلمة المرور.

الـ service worker يُسجَّل في نسخة الإنتاج فقط. لتجربة العمل بدون إنترنت: `npm run build && npm start`
ثم افتح التطبيق مرة وأنت متصل، وبعدها فعّل وضع Offline من DevTools.

## الحسابات والدخول

**لا يوجد تسجيل ذاتي.** فقط الحسابات التي أنشأها المدير تستطيع الدخول. من يدخل ببريد غير مسجّل
يرى رسالة لطيفة ولا يُنشأ له حساب.

> ⚠️ **ضروري:** أوقف خيار **Allow new users to sign up** من
> Supabase → Authentication → Sign In / Providers. خيار `shouldCreateUser: false` موجود في كود
> صفحة الدخول فقط، وأي أحد يستطيع استدعاء API الخاص بـ Supabase مباشرة. مفتاح اللوحة هو الذي يمنع
> ذلك فعليًا. إضافة المحفّظين من شاشة الإدارة تبقى تعمل لأنها تستخدم مفتاح `service_role`.

**المدير** هو صف في جدول `profiles` بقيمة `role = 'ADMIN'`، وليس متغيّر بيئة (RLS داخل Postgres لا
ترى متغيّرات Netlify). المدراء الحاليون: `osamazaedsefalden@gmail.com` و`osamazaedsefalden+admin@gmail.com`.

**إعداد أول مدير (مرة واحدة):** أنشئ المستخدم من Supabase → Authentication → Users → *Add user*
(مع تفعيل "auto confirm")، ثم شغّل في SQL Editor:

```sql
insert into public.profiles (id, name, role, active)
select id, 'Admin name', 'ADMIN', true from auth.users where email = 'admin@example.com'
on conflict (id) do update set role = 'ADMIN', active = true;
```

بعدها يستطيع أي مدير ترقية محفّظ إلى مدير من شاشة «⚙️ الإدارة» دون الحاجة للوحة Supabase.

## الصلاحيات

| | المدير | المحفّظ |
|---|---|---|
| عرض كل الحلقات والطلاب | ✓ | ✓ |
| إضافة طالب وتعديله ونقله لحلقة أخرى | ✓ | ✓ |
| إضافة/تعديل/حذف الإدخالات على كل المسارات | ✓ | ✓ |
| جلسات التلقين والتقارير | ✓ | ✓ |
| إنشاء الحلقات وتسميتها وأرشفتها | ✓ | ✗ |
| أرشفة الطلاب | ✓ | ✗ |
| المحفّظون (إضافة، تعطيل، كلمة مرور، ترقية لمدير) | ✓ | ✗ |
| كتب العربية | ✓ | ✗ |

الحساب المعطّل لا يرى أي بيانات (RLS عبر `private.is_staff()`).

## العمل بدون إنترنت

- يجب **تثبيت التطبيق على الشاشة الرئيسية** (التطبيق يعرض التعليمات). على iOS هذا يقلل احتمال أن
  يمسح النظام البيانات المحفوظة، والتطبيق يطلب `navigator.storage.persist()`.
- أول دخول يحتاج إنترنت، وكذلك الدخول بعد انتهاء الجلسة تمامًا. التعديلات المحفوظة تبقى على الجهاز
  وتُرسل بعد تسجيل الدخول من جديد.
- الجهاز يحتفظ بآخر **60 يومًا** من الإدخالات، وكل إدخالات الحفظ، وآخر إدخال لكل طالب في كل مسار.
  السجل الأقدم يُحمَّل من البطاقة عند الاتصال («تحميل السجل الأقدم»).
- شارة المزامنة في الأعلى تعرض: كل شيء متزامن، أو عدد التغييرات المنتظرة، أو عدد التي فشلت مع سببها
  (إعادة المحاولة أو التجاهل). لا يضيع أي تغيير بصمت.
- تسجيل الخروج يمسح البيانات المحلية، ويحذّر أولًا إن كانت هناك تغييرات لم تُرسل.
- iOS لا يدعم Background Sync: المزامنة تحدث فقط والتطبيق مفتوح.
- بدون اتصال لا تعمل: إدارة المحفّظين، وإنشاء الحلقات والكتب، وتقارير الفترات الكاملة. تقرير اليوم
  يُعرض من بيانات الجهاز مع تنبيه أنه قد يكون ناقصًا.

## البناء والنشر (Netlify)

```bash
npm run build
npm start
```

النشر عبر `netlify.toml`، وكل `git push` على `main` ينشر تلقائيًا. متغيرات البيئة:
`NEXT_PUBLIC_SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`، و`SUPABASE_SERVICE_ROLE_KEY`
(سرّي). بعد أول نشر اضبط Site URL وRedirect URLs في Supabase (التفاصيل في `EMAIL_SETUP.md`).

## خارج النطاق حاليًا

- **التقييم والدرجات** لكل مسار. النقاط والنتيجة الشهرية القديمة مخفية، وعمود `quality` محفوظ في
  كل إدخال حتى يُحسب التقييم لاحقًا من البيانات الموجودة.
- "Leaked Password Protection" غير مفعّل (Authentication → Policies في لوحة Supabase).
