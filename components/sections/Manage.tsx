"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { store, useStore } from "@/lib/offline/store";

// Admin-only actions (spec §5.4). These need a connection: they write straight to Supabase
// (RLS re-checks is_admin()) and then refresh the local copy.
export default function Manage() {
  return (
    <section>
      <div className="card notice">
        صلاحيات المدير: إدارة المحفّظين والمدراء، إنشاء الحلقات وتسميتها وأرشفتها، أرشفة الطلاب، وإدارة كتب العربية. كل محفّظ
        مفعّل يرى جميع الطلاب ويضيف ويعدّل إدخالاتهم. هذه الإجراءات تحتاج اتصالًا بالإنترنت.
      </div>
      <Teachers />
      <Halaqat />
      <ArabicBooks />
    </section>
  );
}

function Teachers() {
  const s = useStore();
  const { supabase, profile, showToast } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const people = s.all("profiles").sort((a, b) => a.name.localeCompare(b.name, "ar"));

  async function refresh() {
    const { data } = await supabase.from("profiles").select("id,name,role,active");
    if (data) await store.applyRemote("profiles", data);
  }

  async function add() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || "تعذّر إضافة المحفّظ");
      setName("");
      setEmail("");
      setPassword("");
      await refresh();
      showToast("تمت إضافة المحفّظ");
    } catch {
      setError("تحتاج اتصالًا بالإنترنت");
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: { active?: boolean; role?: string }, msg: string) {
    setError("");
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return setError(error.message);
    await refresh();
    showToast(msg);
  }

  async function resetPassword(id: string) {
    const pw = prompt("كلمة المرور الجديدة (8 أحرف على الأقل):");
    if (!pw) return;
    const res = await fetch(`/api/admin/teachers/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "تعذّر تغيير كلمة المرور");
    showToast("تم تغيير كلمة المرور");
  }

  return (
    <div className="card">
      <h3>👥 المحفّظون والمدراء</h3>
      <div className="formgrid compact">
        <input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="كلمة المرور (8 أحرف+)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={add} disabled={busy}>
          إضافة محفّظ
        </button>
      </div>
      <p className="small muted">يدخل المحفّظ بعدها برمز يصله على بريده. لا يستطيع أحد غير مسجّل هنا إنشاء حساب بنفسه.</p>
      {error && <p className="error-text">{error}</p>}
      <div style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.role === "ADMIN" ? "مدير" : "محفّظ"}</td>
                <td>{p.active ? "مفعّل" : "معطّل"}</td>
                <td className="row-actions">
                  {p.id !== profile.id && (
                    <>
                      <button className="link" onClick={() => update(p.id, { active: !p.active }, p.active ? "تم التعطيل" : "تم التفعيل")}>
                        {p.active ? "تعطيل" : "تفعيل"}
                      </button>
                      {p.role === "TEACHER" ? (
                        <button
                          className="link"
                          onClick={() => confirm(`ترقية ${p.name} إلى مدير؟`) && update(p.id, { role: "ADMIN" }, "تمت الترقية إلى مدير")}
                        >
                          ترقية لمدير
                        </button>
                      ) : (
                        <button
                          className="link"
                          onClick={() => confirm(`إرجاع ${p.name} إلى محفّظ؟`) && update(p.id, { role: "TEACHER" }, "تم التحويل إلى محفّظ")}
                        >
                          إلغاء الإدارة
                        </button>
                      )}
                    </>
                  )}
                  <button className="link" onClick={() => resetPassword(p.id)}>
                    كلمة المرور
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Halaqat() {
  const s = useStore();
  const { supabase, showToast } = useApp();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const circles = s.all("circles").sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "ar"));
  const count = (id: string) => s.all("students").filter((st) => st.active && st.circle_id === id).length;

  function friendly(msg: string) {
    return /circles_name_unique|duplicate/i.test(msg) ? "يوجد حلقة بهذا الاسم" : msg;
  }

  async function add() {
    setError("");
    if (!name.trim()) return setError("أدخل اسم الحلقة");
    const { data, error } = await supabase.from("circles").insert({ name: name.trim() }).select().single();
    if (error) return setError(friendly(error.message));
    await store.applyRemote("circles", [data]);
    setName("");
    showToast("تم إنشاء الحلقة");
  }

  async function update(id: string, patch: { name?: string; active?: boolean }) {
    setError("");
    const { data, error } = await supabase
      .from("circles")
      .update({ ...patch, edited_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return setError(friendly(error.message));
    await store.applyRemote("circles", [data]);
    showToast("تم الحفظ");
  }

  return (
    <div className="card">
      <h3>🏫 الحلقات</h3>
      <p className="small muted">اسم الحلقة نص حر يحمل أي تصنيف تريده، مثل «ذكور – الشيخ أحمد» أو «إناث 10–12».</p>
      <div className="search-row">
        <input placeholder="اسم الحلقة" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={add}>إضافة حلقة</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>الحلقة</th>
            <th>الطلاب</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {circles.map((c) => (
            <tr key={c.id} className={c.active ? "" : "muted"}>
              <td>
                {c.name} {!c.active && <span className="badge">مؤرشفة</span>}
              </td>
              <td>{count(c.id)}</td>
              <td className="row-actions">
                <button
                  className="link"
                  onClick={() => {
                    const n = prompt("الاسم الجديد للحلقة:", c.name);
                    if (n && n.trim() && n.trim() !== c.name) update(c.id, { name: n.trim() });
                  }}
                >
                  إعادة تسمية
                </button>
                <button className="link" onClick={() => update(c.id, { active: !c.active })}>
                  {c.active ? "أرشفة" : "استعادة"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArabicBooks() {
  const s = useStore();
  const { supabase, showToast } = useApp();
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState("");
  const [error, setError] = useState("");
  const books = s.all("arabic_books").sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title, "ar"));

  async function add() {
    setError("");
    const total = Number(pages);
    if (!title.trim() || !Number.isInteger(total) || total < 1) return setError("أدخل العنوان وعدد الصفحات");
    const { data, error } = await supabase.from("arabic_books").insert({ title: title.trim(), total_pages: total }).select().single();
    if (error) return setError(/unique|duplicate/i.test(error.message) ? "يوجد كتاب بهذا العنوان" : error.message);
    await store.applyRemote("arabic_books", [data]);
    setTitle("");
    setPages("");
    showToast("تمت إضافة الكتاب");
  }

  async function toggle(id: string, active: boolean) {
    const { data, error } = await supabase
      .from("arabic_books")
      .update({ active, edited_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return setError(error.message);
    await store.applyRemote("arabic_books", [data]);
  }

  return (
    <div className="card">
      <h3>📘 كتب العربية</h3>
      <div className="formgrid compact">
        <input placeholder="عنوان الكتاب (مثال: القراءة الراشدة ج1)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="عدد الصفحات" type="number" inputMode="numeric" min={1} value={pages} onChange={(e) => setPages(e.target.value)} />
        <button onClick={add}>إضافة كتاب</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {books.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>الكتاب</th>
              <th>الصفحات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id} className={b.active ? "" : "muted"}>
                <td>{b.title}</td>
                <td>{b.total_pages}</td>
                <td>
                  <button className="link" onClick={() => toggle(b.id, !b.active)}>
                    {b.active ? "أرشفة" : "استعادة"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
