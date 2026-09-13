# تطبيق أندرويد (APK) — دليل الإعداد والبناء

## الطريقة المستخدمة ولماذا

التطبيق Next.js حقيقي (Server-Side Rendering + middleware + Route Handler واحد للإدارة)،
مش موقع ثابت يمكن تصديره بـ `next export`. لهذا السبب الطريقة الصحيحة لتحويله لتطبيق أندرويد
هي **Capacitor بوضع "Remote URL"**: التطبيق الأندرويد عبارة عن غلاف WebView حقيقي (native shell،
أيقونة حقيقية، تثبيت حقيقي على الهاتف) يفتح مباشرة على خادم Next.js الفعلي — **كل منطق التطبيق،
الصلاحيات، RLS، والـ Authentication يعمل بالضبط متل ما يعمل بالمتصفح**، لأنه فعليًا نفس الخادم.

البديل (تصدير الموقع كملفات ثابتة داخل التطبيق) غير مناسب هنا لأنه يفقد الـ middleware
(التحويل التلقائي لصفحة الدخول) وRoute Handler الإدارة.

## الوضع الحالي: نسخة اختبار (Debug)

`capacitor.config.ts` مضبوط مؤقتًا على:
```
server: { url: "http://192.168.100.9:3000", cleartext: true }
```
هذا عنوان الشبكة المحلية (LAN) لجهاز التطوير الحالي. **يعمل فقط إذا كان الهاتف على نفس شبكة
الواي فاي**، ولأنه HTTP وليس HTTPS فعّلت `android:usesCleartextTraffic="true"` مؤقتًا في
`android/app/src/main/AndroidManifest.xml` (لازم يُزال هذا السطر عند النشر النهائي).

تم بناء APK تجريبي فعليًا (`android/app/build/outputs/apk/debug/app-debug.apk`، ~4.5MB) وأُرسل
لك مباشرة بالمحادثة. لسا ما تم تثبيته أو اختباره على جهاز حقيقي (لا يوجد جهاز/محاكي متصل بالبيئة
الحالية) — هذا ينتظر منك.

### خطوات الاختبار المطلوبة منك الآن

1. تأكد إن هاتفك على نفس شبكة الواي فاي متاع هالجهاز.
2. تأكد إن سيرفر Next.js شغّال (`npm run dev` من مجلد المشروع — شغّال حاليًا فعليًا).
3. ثبّت ملف الـ APK المُرسَل (فعّل "تثبيت من مصادر غير معروفة" إذا طلب منك أندرويد ذلك).
4. افتح التطبيق وجرّب:
   - تسجيل الدخول بحساب المدير الحقيقي.
   - وصول لوحة التحكم، الطلاب، الحلقات — تأكد البيانات تظهر صح (يعني Supabase Auth + RLS
     شغّالين من داخل التطبيق مش بس بالمتصفح).
   - تسجيل تقييم يومي أو ملاحظة تربوية والتأكد إنها تُحفظ.
   - افحص شكل الواجهة على شاشة الهاتف (القوائم، الجداول، النماذج).
5. قلي شو صار بالضبط (نجح كليًا؟ في مشكلة بمكان معيّن؟).

## الأيقونة

مصادر الأيقونة بصيغة SVG بمجلد `resources/` (`icon-source.svg` كامل، `icon-foreground.svg` +
`icon-background.svg` للـ Adaptive Icon على أندرويد 8+). التصميم: كتاب مفتوح + هلال بألوان
التطبيق نفسها (التدرّج الأخضر `#176b52`→`#0f5742`). أُنشئت كل الأحجام المطلوبة تلقائيًا عبر
`@capacitor/assets` داخل `android/app/src/main/res/mipmap-*`. إذا بدك تغيّر التصميم لاحقًا،
عدّل ملفات الـ SVG وأعد تشغيل:
```bash
npx capacitor-assets generate --android
```

## أدوات البناء المُثبَّتة على هذا الجهاز

- Android SDK كان موجودًا مسبقًا (`~/Android/sdk`، platforms 35/36، build-tools).
- JDK 17 كان موجودًا (`~/dev-tools/jdk17`) — لكن قالب Capacitor Android الحالي يتطلب **JDK 21**
  لتصريف كود الـ bridge (`sourceCompatibility JavaVersion.VERSION_21` في ملفات مولَّدة تلقائيًا،
  لا يجب تعديلها يدويًا لأنها تُعاد كتابتها عند `npx cap update`). **ثبّت JDK 21 (Temurin) في
  `~/dev-tools/jdk21`** خصيصًا لبناء أندرويد. لا تحذفه، وحدد `JAVA_HOME` عليه عند تشغيل Gradle:
  ```bash
  export JAVA_HOME=/home/osama/dev-tools/jdk21
  export ANDROID_HOME=/home/osama/Android/sdk
  cd android && ./gradlew assembleDebug
  ```

## الخطوات التالية للنسخة النهائية (بعد نجاح الاختبار)

1. **نشر التطبيق على استضافة حقيقية بـ HTTPS** (Vercel هو الأنسب لـ Next.js — صفر إعداد تقريبًا).
   هذا قرار يحتاج منك: عندك حساب Vercel؟ أو تفضّل منصة ثانية؟ بعد النشر رح يكون في رابط ثابت
   مثل `https://your-app.vercel.app`.
2. عدّل `capacitor.config.ts`:
   ```ts
   server: { url: "https://your-app.vercel.app" } // احذف cleartext نهائيًا
   ```
3. احذف `android:usesCleartextTraffic="true"` من `AndroidManifest.xml`.
4. أنشئ Keystore حقيقي لتوقيع النسخة النهائية (مختلف عن مفتاح الـ debug):
   ```bash
   keytool -genkeypair -v -keystore quran-halaqat-release.keystore -alias quran-halaqat \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   **احفظ هذا الملف وكلمة مروره بمكان آمن جدًا — فقدانه يعني عدم القدرة على تحديث التطبيق لاحقًا
   على نفس الحزمة (`com.quranhalaqat.app`) أبدًا.**
5. `npx cap sync android` ثم `./gradlew assembleRelease` (أو `bundleRelease` لملف `.aab` إذا
   بدك تنشره على Google Play).
6. اختبار أخير على الجهاز الحقيقي بالنسخة النهائية قبل أي توزيع.

## معلومات التطبيق الحالية

- اسم الحزمة (Package ID): `com.quranhalaqat.app`
- اسم التطبيق المعروض: حلقات القرآن
- الحد الأدنى لإصدار أندرويد المدعوم: API 24 (أندرويد 7.0+)
