# منظومة متابعة حلقات القرآن — نسخة Production

تطبيق ويب حقيقي (Multi-user) مبني بالاعتماد على الـ prototype الأصلي
`quran_halaqat_tracker_tarbawi_v2-2.html`. راجع `PROJECT_ANALYSIS.md` لتفاصيل تحليل الملف الأصلي.

> **ملاحظة مهمة:** المشروع مرّ بمرحلتين معماريتين. البداية كانت Express + Prisma (موثّقة في
> `PROJECT_ANALYSIS.md`)، ثم تم التحويل بقرار صريح إلى **Next.js + Supabase Auth + RLS مباشرة**
> (بدون Backend وسيط خاص) — وهذا هو الوضع الحالي الفعلي للكود. نسخة Express القديمة محفوظة محليًا
> في `_deprecated_express_backend_prototype/` (غير متتبّعة بـ git، لن تُرفع لأي مستودع) للرجوع
> إليها فقط، وليست جزءًا من التطبيق العامل.

## البنية الفعلية الحالية

```
app/                 Next.js App Router (صفحات + Route Handlers)
  login/page.tsx      شاشة الدخول (Client Component، supabase.auth.signInWithPassword)
  page.tsx            الصفحة الرئيسية → <AppShell/>
  api/admin/teachers/  Route Handlers الوحيدة في المشروع (تحتاج service_role لإنشاء مستخدم Auth)
components/           AppShell + أقسام الواجهة (Dashboard, Students, Daily, Tilawah, Edu, Report, Manage)
lib/                  أنواع مشتركة (types.ts)، requireAdmin.ts، lib/supabase/database.types.ts
utils/supabase/       client.ts (متصفح), server.ts (Server Components), middleware.ts, admin.ts (سيرفر فقط)
middleware.ts         يحدّث الجلسة ويحوّل غير المسجّلين لـ /login على كل طلب
```

**لا يوجد Backend API عام يطبّق الصلاحيات بالكود** كما كان مخطّطًا أول الأمر — بدلًا من ذلك:
كل استعلام بيانات (طلاب، حلقات، سجلات يومية، تلاوة، ملاحظات تربوية) يذهب **مباشرة من المتصفح إلى
Supabase (PostgREST)**، والحماية بالكامل عبر **Row Level Security policies حقيقية** في قاعدة
البيانات (راجع "الأمان" أدناه). الاستثناء الوحيد: إنشاء حساب محفظ جديد، لأنه يحتاج صلاحية
Supabase Auth Admin API التي لا يمكن استدعاؤها من المتصفح أبدًا — لهذا فقط يوجد Route Handler
واحد (`app/api/admin/teachers/`) يعمل بمفتاح `service_role` على الخادم.

قاعدة البيانات: PostgreSQL مستضافة على Supabase (مشروع `quran-halaqat-tracker`، المنطقة
`eu-central-1`، project ref `nmjxwhuuyhuxgstiijlt`). المستخدمون عبر **Supabase Auth** (بريد
إلكتروني + كلمة مرور)، وبيانات الدور/الحالة في جدول `profiles` المرتبط بـ `auth.users`.

## التشغيل محليًا

```bash
npm install
cp .env.local.example .env.local   # القيم العامة معبّأة مسبقًا؛ اترك SUPABASE_SERVICE_ROLE_KEY فاضي إن لم تحتجه بعد
npm run dev
```

المتغيرات في `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: عامة، آمنة للتعريض في
  المتصفح (هذا تصميم Supabase المقصود)، معبّأة مسبقًا في `.env.local.example`.
- `SUPABASE_SERVICE_ROLE_KEY`: **سرّي، سيرفر فقط**. مطلوب فقط لميزة "إضافة محفظ" من صفحة الإدارة
  و لإعادة تعيين كلمة مرور محفظ. بدونه، باقي التطبيق يعمل بشكل طبيعي وهذه الميزة فقط ترجع خطأ
  واضح. احصل عليه من: Supabase Dashboard → Project Settings → API → `service_role` secret key.
  **لا تضعه أبدًا في كود يصل المتصفح ولا في أي ملف يُرفع لـ Git.**

## حساب المدير الأول

لا توجد شاشة "تسجيل مستخدم جديد" (بالتصميم — فقط الأدمن يُنشئ حسابات). حساب مدير تجريبي أُنشئ
فعليًا أثناء البناء وتم ربطه بـ `profiles` كـ `ADMIN`:

- البريد: `osamazaedsefalden+admin@gmail.com`
- كلمة المرور: عيّنها بنفسك من Supabase Dashboard → Authentication → Users → ابحث عن هذا
  البريد → خيار تعيين/إعادة تعيين كلمة المرور مباشرة (إرسال إيميل تلقائي تجاوز الحد المجاني
  وقت البناء، فالتعيين المباشر من اللوحة هو الأضمن).

لإنشاء أي مدير/محفظ إضافي لاحقًا: من صفحة "⚙️ الإدارة" داخل التطبيق (يتطلب `SUPABASE_SERVICE_ROLE_KEY`
مضبوطًا)، أو يدويًا عبر Supabase Dashboard ثم إضافة صف في جدول `profiles` بنفس الـ `id`.

## البناء والنشر (Netlify)

```bash
npm run build
npm start        # تشغيل محلي للنسخة الإنتاجية
```

النشر على **Netlify** مضبوط عبر `netlify.toml` (يتعرّف Netlify على Next.js تلقائيًا، لا يلزم plugin).
كل `git push` على فرع `main` يعمل deploy تلقائيًا بعد ربط المستودع من لوحة Netlify
(Add new project → Import from GitHub).

**متغيرات البيئة** (Netlify → Site configuration → Environment variables):

| المتغير | ملاحظة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عام |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | عام |
| `SUPABASE_SERVICE_ROLE_KEY` | **سرّي** — فعّل خيار *Contains secret values*؛ لا يوضع في الكود ولا في Git |

**بعد أول نشر** اضبط في Supabase → Authentication → URL Configuration: **Site URL** = رابط موقع
Netlify، وأضف `https://<موقعك>/**` إلى **Redirect URLs** (وإلا ستحوّل روابط استعادة كلمة المرور
إلى عنوان خاطئ). التفاصيل الكاملة في `EMAIL_SETUP.md`.

التطبيق **تطبيق ويب** فقط (متجاوب مع الهاتف)، وقابل للتثبيت من المتصفح كـ PWA عبر
`app/manifest.ts` — لا يوجد تطبيق أندرويد/iOS أصلي.

## الأمان (مهم)

- **كل الصلاحيات مطبّقة داخل قاعدة البيانات (RLS)، وليس في كود التطبيق** — حتى لو استُدعي
  Supabase مباشرة من أي مكان (console المتصفح مثلًا)، النتيجة نفسها محكومة بنفس القواعد. الدوال
  المساعدة (`is_admin`, `can_access_circle`, `can_access_student`...) موجودة في schema منفصل
  اسمه `private` غير معرَّض عبر REST API، بحيث ما حدا يقدر يستدعيها مباشرة، فقط RLS policies
  وTriggers تستخدمها داخليًا.
- نقاط التقييم اليومي (`daily_records.points`) **تُحسب دائمًا بواسطة Trigger في قاعدة البيانات**
  (`compute_daily_points`)، وليس بالمتصفح — حتى لو تلاعب أحد بالـ payload المُرسَل، القيمة
  المخزَّنة الفعلية محسوبة من `attendance/grade/work_type/adjustment` بمنطق ثابت من السيرفر.
- التحقق من صحة أرقام آيات التلاوة (لا تتجاوز عدد آيات السورة) يتم أيضًا بـ Trigger
  (`validate_tilawah`) قبل أي إدراج، وليس فقط في الواجهة.
- تعطيل محفظ (`profiles.active = false`) يقطع وصوله **فورًا** لكل البيانات عبر RLS، حتى لو كانت
  جلسته (JWT) لسا صالحة تقنيًا — تم اختباره فعليًا (راجع تفاصيل الاختبار أدناه).
- كل الجداول عليها RLS مفعّل صراحة، وتم فحصها بأداة الأمان الخاصة بـ Supabase (`get_advisors`)
  بعد كل تعديل بنيوي وصفّرت كل التحذيرات ذات الدلالة.
- لا شيء يُخزَّن بـ localStorage — كل شيء يمر عبر جلسة Supabase Auth (كوكيز httpOnly تديرها
  مكتبة `@supabase/ssr`) و RLS.

### تم اختباره فعليًا (وليس افتراضًا)

أثناء البناء تم إنشاء حسابي اختبار مؤقتين (مدير ومحفظ) واختبار: تسجيل دخول حقيقي، عزل الصلاحيات
(محفظ لا يرى طلاب حلقة غير حلقته ولا يقدر يُدرج لهم سجلات — 403 فعليًا)، صحة حساب النقاط تلقائيًا
(تحقّق رقمي مطابق)، تحديث موضع الطالب تلقائيًا بعد حفظ جديد، رفض رقم آية خارج نطاق السورة، رفض
نقاط تربوية خارج النطاق المسموح، وقطع الوصول الفوري عند تعطيل محفظ. كل الحسابات والبيانات
التجريبية حُذفت بعد الاختبار — القاعدة الآن فاضية إلا من حساب المدير الحقيقي المذكور أعلاه.

## القيود المعروفة / أفكار للتوسع لاحقًا

- ميزة "Leaked Password Protection" (فحص كلمات المرور المسرّبة عبر HaveIBeenPwned) غير مفعّلة —
  إعداد على مستوى مشروع Supabase (Authentication → Policies)، يُفضَّل تفعيله يدويًا من اللوحة.
- الحلقة تُسنَد لمحفظ رئيسي واحد فقط (قرار تصميمي موثّق في `PROJECT_ANALYSIS.md`). دعم عدة
  محفظين لحلقة واحدة يتطلب جدول ربط إضافي إن احتجته مستقبلًا.
- لا توجد شاشة "تغيير كلمة المرور الشخصية" لمستخدم مسجّل دخول (فقط الأدمن يقدر يغيّر كلمة مرور
  محفظ عبر Route Handler الإدارة). يمكن إضافتها بسهولة عبر `supabase.auth.updateUser()`.
- الجداول الست القديمة من نسخة Express (`deprecated_*`) لا تزال موجودة بقاعدة البيانات (فاضية،
  RLS مفعّل بلا policies = ممنوع الوصول كليًا) — لم تُحذف نهائيًا بعد لأن الحذف يحتاج تأكيدًا
  صريحًا إضافيًا؛ يمكن حذفها بأمان في أي وقت لاحق.
