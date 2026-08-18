import { useState, useEffect, useMemo } from "react";
import {
  Wrench, Boxes, Building2, LayoutDashboard, Plus, Search, X, AlertTriangle,
  CheckCircle2, PackageX, Trash2, Pencil, ImagePlus, Loader2, Image as ImageIcon,
} from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------- constants ----------
const ASSET_TYPES = ["คอมพิวเตอร์", "โน้ตบุ๊ก", "จอภาพ", "เครื่องพิมพ์", "อุปกรณ์เครือข่าย", "อื่นๆ"];
const ASSET_STATUS = ["ใช้งานอยู่", "ในสต็อก", "ส่งซ่อม", "ปลดระวาง"];
const TICKET_STATUS = ["แจ้งใหม่", "กำลังดำเนินการ", "รอชิ้นส่วน", "ซ่อมเสร็จ", "ปิดงาน"];
const PRIORITY = ["ต่ำ", "ปานกลาง", "สูง", "ด่วนมาก"];
const NORTH_PROVINCES = ["เชียงใหม่","เชียงราย","ลำพูน","ลำปาง","แพร่","น่าน","พะเยา","แม่ฮ่องสอน","อุตรดิตถ์","ตาก","สุโขทัย","พิษณุโลก","พิจิตร","เพชรบูรณ์","กำแพงเพชร","นครสวรรค์"];
const PHOTO_CATEGORIES = [
  { key: "fault", label: "รูปอาการเสีย" },
  { key: "shipping", label: "รูปพัสดุจัดส่ง (ไปซ่อม)" },
  { key: "afterRepair", label: "รูปหลังซ่อมเสร็จ / ซ่อมไม่ได้" },
  { key: "shipBack", label: "รูปพัสดุจัดส่งกลับสาขา" },
];
const emptyPhotos = () => ({ fault: [], shipping: [], afterRepair: [], shipBack: [] });

const STATUS_COLOR = {
  "ใช้งานอยู่": "#5B9DF9", "ในสต็อก": "#4ADE80", "ส่งซ่อม": "#F0A83C", "ปลดระวาง": "#6B7280",
  "แจ้งใหม่": "#F0A83C", "กำลังดำเนินการ": "#5B9DF9", "รอชิ้นส่วน": "#E879F9", "ซ่อมเสร็จ": "#4ADE80", "ปิดงาน": "#6B7280",
};
const PRIORITY_COLOR = { "ต่ำ": "#6B7280", "ปานกลาง": "#5B9DF9", "สูง": "#F0A83C", "ด่วนมาก": "#F87171" };

function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) { if (!d) return "-"; try { return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }); } catch { return d; } }

function resizeImageFile(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- db <-> app field mapping ----------
const assetFromDb = (r) => ({ id: r.id, assetTag: r.asset_tag, type: r.type, brand: r.brand, model: r.model, serial: r.serial, branchId: r.branch_id, assignedTo: r.assigned_to, status: r.status, purchaseDate: r.purchase_date, notes: r.notes });
const assetToDb = (a) => ({ id: a.id, asset_tag: a.assetTag, type: a.type, brand: a.brand, model: a.model, serial: a.serial, branch_id: a.branchId || null, assigned_to: a.assignedTo, status: a.status, purchase_date: a.purchaseDate || null, notes: a.notes });
const branchFromDb = (r) => ({ id: r.id, name: r.name, code: r.code, province: r.province });
const branchToDb = (b) => ({ id: b.id, name: b.name, code: b.code, province: b.province });
const ticketFromDb = (r) => ({ id: r.id, ticketNo: r.ticket_no, assetId: r.asset_id, branchId: r.branch_id, reporter: r.reporter, issueType: r.issue_type, description: r.description, priority: r.priority, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const ticketToDb = (t) => ({ id: t.id, ticket_no: t.ticketNo, asset_id: t.assetId || null, branch_id: t.branchId || null, reporter: t.reporter, issue_type: t.issueType, description: t.description, priority: t.priority, status: t.status });

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [assets, setAssets] = useState([]);
  const [branches, setBranches] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = async () => {
    try {
      const [{ data: b, error: eb }, { data: a, error: ea }, { data: t, error: et }, { data: p, error: ep }] = await Promise.all([
        supabase.from("branches").select("*").order("name"),
        supabase.from("assets").select("*").order("created_at", { ascending: false }),
        supabase.from("tickets").select("*").order("created_at", { ascending: false }),
        supabase.from("ticket_photos").select("*"),
      ]);
      if (eb || ea || et || ep) throw eb || ea || et || ep;
      const photosByTicket = {};
      (p || []).forEach((row) => {
        photosByTicket[row.ticket_id] = photosByTicket[row.ticket_id] || emptyPhotos();
        photosByTicket[row.ticket_id][row.category].push({ id: row.id, url: row.url });
      });
      setBranches((b || []).map(branchFromDb));
      setAssets((a || []).map(assetFromDb));
      setTickets((t || []).map((row) => ({ ...ticketFromDb(row), photos: photosByTicket[row.id] || emptyPhotos() })));
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ ตรวจสอบการตั้งค่า Supabase");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // ---------- assets ----------
  const addAsset = async (data) => {
    const row = assetToDb({ ...data, id: uid("as") });
    const { error } = await supabase.from("assets").insert(row);
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    fetchAll();
  };
  const editAsset = async (data) => {
    const { id, ...rest } = assetToDb(data);
    const { error } = await supabase.from("assets").update(rest).eq("id", id);
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    fetchAll();
  };
  const deleteAsset = async (id) => {
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) return alert("ลบไม่สำเร็จ: " + error.message);
    fetchAll();
  };

  // ---------- branches ----------
  const addBranch = async (data) => {
    const { error } = await supabase.from("branches").insert(branchToDb({ ...data, id: uid("br") }));
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    fetchAll();
  };
  const addBranchesBulk = async (rows) => {
    const payload = rows.map((r) => branchToDb({ ...r, id: uid("br") }));
    const { error } = await supabase.from("branches").insert(payload);
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    fetchAll();
  };
  const editBranch = async (data) => {
    const { id, ...rest } = branchToDb(data);
    const { error } = await supabase.from("branches").update(rest).eq("id", id);
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    fetchAll();
  };
  const deleteBranch = async (id) => {
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) return alert("ลบไม่สำเร็จ: " + error.message);
    fetchAll();
  };

  // ---------- tickets ----------
  const createTicket = async (data) => {
    const ticketNo = "TK-" + String(tickets.length + 1).padStart(5, "0");
    const row = ticketToDb({ ...data, id: uid("tk"), ticketNo });
    const { error } = await supabase.from("tickets").insert(row);
    if (error) return alert("บันทึกไม่สำเร็จ: " + error.message);
    if (data.assetId) {
      await supabase.from("assets").update({ status: "ส่งซ่อม" }).eq("id", data.assetId);
    }
    await fetchAll();
  };
  const updateTicketStatus = async (t, status) => {
    const { error } = await supabase.from("tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return alert("อัปเดตไม่สำเร็จ: " + error.message);
    if (t.assetId && (status === "ซ่อมเสร็จ" || status === "ปิดงาน")) {
      await supabase.from("assets").update({ status: "ใช้งานอยู่" }).eq("id", t.assetId);
    }
    await fetchAll();
  };
  const deleteTicket = async (id) => {
    const { error } = await supabase.from("tickets").delete().eq("id", id);
    if (error) return alert("ลบไม่สำเร็จ: " + error.message);
    fetchAll();
  };

  // ---------- photos ----------
  const uploadTicketPhoto = async (ticketId, category, file) => {
    const blob = await resizeImageFile(file);
    const path = `${ticketId}/${category}/${uid("img")}.jpg`;
    const { error: upErr } = await supabase.storage.from("ticket-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) { alert("อัปโหลดรูปไม่สำเร็จ: " + upErr.message); return; }
    const { data: pub } = supabase.storage.from("ticket-photos").getPublicUrl(path);
    const { error: insErr } = await supabase.from("ticket_photos").insert({ ticket_id: ticketId, category, url: pub.publicUrl });
    if (insErr) { alert("บันทึกรูปไม่สำเร็จ: " + insErr.message); return; }
    await fetchAll();
  };
  const deleteTicketPhoto = async (photoId) => {
    const { error } = await supabase.from("ticket_photos").delete().eq("id", photoId);
    if (error) return alert("ลบรูปไม่สำเร็จ: " + error.message);
    fetchAll();
  };

  const branchName = (id) => branches.find((b) => b.id === id)?.name || "—";
  const assetLabel = (id) => { const a = assets.find((x) => x.id === id); return a ? `${a.assetTag} · ${a.brand} ${a.model}` : "—"; };

  const nav = [
    { id: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
    { id: "assets", label: "ทะเบียนทรัพย์สิน", icon: Boxes },
    { id: "tickets", label: "แจ้งซ่อม", icon: Wrench },
    { id: "branches", label: "สาขา", icon: Building2 },
  ];

  return (
    <div style={{
      "--bg": "#0F1420", "--panel": "#171E2C", "--panel2": "#1E2735", "--line": "#2A3444",
      "--text": "#E7ECF5", "--muted": "#8B96AA", "--accent": "#F0A83C", "--accent2": "#5B9DF9",
      background: "var(--bg)", color: "var(--text)", minHeight: "100vh", display: "flex",
    }}>
      <GlobalStyle />
      <div style={{ width: 230, borderRight: "1px solid var(--line)", padding: "22px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 8px 22px" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, letterSpacing: ".08em" }}>ASSET-CTRL // เหนือ</div>
          <div style={{ fontSize: 16.5, fontWeight: 700, marginTop: 4 }}>ระบบจัดการสินทรัพย์ IT</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {nav.map((n) => (
            <div key={n.id} className={`navitem ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <n.icon size={17} strokeWidth={2.2} />{n.label}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", padding: "10px 8px", fontSize: 11.5, color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          {branches.length} สาขา · {assets.length} รายการทรัพย์สิน
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: "26px 32px", maxWidth: 1180 }}>
        {error && (
          <div style={{ background: "#3A1A1A", border: "1px solid #7A3333", color: "#FCA5A5", padding: "12px 16px", borderRadius: 10, marginBottom: 18, fontSize: 13.5 }}>
            เชื่อมต่อฐานข้อมูลไม่สำเร็จ: {error} — ตรวจสอบว่าใส่ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ถูกต้อง และรัน schema SQL แล้ว
          </div>
        )}
        {!loaded ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>กำลังโหลดข้อมูล…</div>
        ) : tab === "dashboard" ? (
          <Dashboard assets={assets} branches={branches} tickets={tickets} branchName={branchName} setTab={setTab} />
        ) : tab === "assets" ? (
          <AssetsView assets={assets} branches={branches} branchName={branchName} onAdd={addAsset} onEdit={editAsset} onDelete={deleteAsset} />
        ) : tab === "tickets" ? (
          <TicketsView tickets={tickets} assets={assets} branches={branches} branchName={branchName} assetLabel={assetLabel}
            onCreate={createTicket} onStatus={updateTicketStatus} onDelete={deleteTicket}
            onUploadPhoto={uploadTicketPhoto} onDeletePhoto={deleteTicketPhoto} />
        ) : (
          <BranchesView branches={branches} assets={assets} onAdd={addBranch} onAddBulk={addBranchesBulk} onEdit={editBranch} onDelete={deleteBranch} />
        )}
      </div>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      .mono { font-family: 'IBM Plex Mono', monospace; }
      button { font-family: inherit; cursor: pointer; }
      input, select, textarea { font-family: inherit; }
      ::placeholder { color: #5B6577; }
      .btn { display:inline-flex; align-items:center; gap:6px; padding:9px 14px; border-radius:8px; border:1px solid var(--line); background: var(--panel2); color: var(--text); font-size:13.5px; font-weight:600; transition: all .15s; }
      .btn:hover { border-color: var(--accent); }
      .btn-primary { background: var(--accent); color:#1A1206; border-color: var(--accent); }
      .btn-primary:hover { filter: brightness(1.08); }
      .btn:disabled { opacity: .5; cursor: not-allowed; }
      .field-label { font-size:12px; color:var(--muted); font-weight:600; margin-bottom:5px; display:block; letter-spacing:.02em; }
      .field-input { width:100%; background: var(--bg); border:1px solid var(--line); color:var(--text); padding:9px 11px; border-radius:7px; font-size:14px; }
      .field-input:focus { outline:none; border-color: var(--accent2); }
      table { border-collapse: collapse; width:100%; }
      th { text-align:left; font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
      td { padding:11px 12px; border-bottom:1px solid #1D2635; font-size:13.5px; vertical-align:middle; }
      tr:hover td { background: #161D2A; }
      .chip { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
      .modal-overlay { position:fixed; inset:0; background:rgba(6,9,15,0.7); display:flex; align-items:center; justify-content:center; z-index:50; padding:20px; }
      .modal { background: var(--panel); border:1px solid var(--line); border-radius:14px; padding:24px; width:100%; max-width:520px; max-height:88vh; overflow-y:auto; }
      .navitem { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:8px; color:var(--muted); font-size:14px; font-weight:600; cursor:pointer; }
      .navitem.active { background: var(--panel2); color: var(--text); }
      .navitem.active svg { color: var(--accent); }
      .navitem:hover { color: var(--text); }
    `}</style>
  );
}

// ================= DASHBOARD =================
function Dashboard({ assets, branches, tickets, branchName, setTab }) {
  const byStatus = useMemo(() => {
    const m = {}; ASSET_STATUS.forEach((s) => (m[s] = 0));
    assets.forEach((a) => { m[a.status] = (m[a.status] || 0) + 1; });
    return m;
  }, [assets]);
  const openTickets = tickets.filter((t) => t.status !== "ปิดงาน");
  const urgent = openTickets.filter((t) => t.priority === "ด่วนมาก" || t.priority === "สูง").slice(0, 6);

  const StatCard = ({ label, value, color, icon: Icon }) => (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="mono" style={{ fontSize: 30, fontWeight: 700, marginTop: 8, color }}>{value}</div>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>ภาพรวมระบบ</h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 22 }}>สรุปสถานะทรัพย์สิน IT ทั้งหมดในเขตภาคเหนือ</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard label="ทรัพย์สินทั้งหมด" value={assets.length} color="#E7ECF5" icon={Boxes} />
        <StatCard label="ใช้งานอยู่" value={byStatus["ใช้งานอยู่"]} color={STATUS_COLOR["ใช้งานอยู่"]} icon={CheckCircle2} />
        <StatCard label="ในสต็อก" value={byStatus["ในสต็อก"]} color={STATUS_COLOR["ในสต็อก"]} icon={PackageX} />
        <StatCard label="ส่งซ่อม" value={byStatus["ส่งซ่อม"]} color={STATUS_COLOR["ส่งซ่อม"]} icon={Wrench} />
        <StatCard label="ใบแจ้งซ่อมค้าง" value={openTickets.length} color="var(--accent)" icon={AlertTriangle} />
        <StatCard label="สาขาทั้งหมด" value={branches.length} color={STATUS_COLOR["กำลังดำเนินการ"]} icon={Building2} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>ใบแจ้งซ่อมที่ต้องเร่งดำเนินการ</div>
            <button className="btn" onClick={() => setTab("tickets")} style={{ padding: "6px 10px", fontSize: 12 }}>ดูทั้งหมด</button>
          </div>
          {urgent.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13.5, padding: "12px 0" }}>ไม่มีรายการเร่งด่วนตอนนี้</div>
          ) : urgent.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1D2635" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.issueType} — {branchName(t.branchId)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.ticketNo} · แจ้งโดย {t.reporter} · {fmtDate(t.createdAt)}</div>
              </div>
              <span className="chip" style={{ background: PRIORITY_COLOR[t.priority] + "22", color: PRIORITY_COLOR[t.priority], height: "fit-content" }}>{t.priority}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 14 }}>สถานะทรัพย์สินตามประเภท</div>
          {ASSET_TYPES.map((type) => {
            const count = assets.filter((a) => a.type === type).length;
            const max = Math.max(1, ...ASSET_TYPES.map((tp) => assets.filter((a) => a.type === tp).length));
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: "var(--muted)" }}>{type}</span><span className="mono">{count}</span>
                </div>
                <div style={{ height: 6, background: "#1D2635", borderRadius: 3 }}>
                  <div style={{ height: 6, width: `${(count / max) * 100}%`, background: "var(--accent2)", borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ================= ASSETS =================
function AssetsView({ assets, branches, branchName, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [modal, setModal] = useState(null);

  const filtered = assets.filter((a) => {
    const matchQ = !q || `${a.assetTag} ${a.brand} ${a.model} ${a.serial} ${a.assignedTo}`.toLowerCase().includes(q.toLowerCase());
    const matchB = !filterBranch || a.branchId === filterBranch;
    const matchS = !filterStatus || a.status === filterStatus;
    return matchQ && matchB && matchS;
  });

  const save = async (data) => {
    if (modal.mode === "new") await onAdd(data); else await onEdit(data);
    setModal(null);
  };
  const remove = (id) => { if (confirm("ลบรายการนี้ใช่หรือไม่?")) onDelete(id); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>ทะเบียนทรัพย์สิน</h1>
          <p style={{ color: "var(--muted)", fontSize: 13.5 }}>สต็อกและอุปกรณ์ที่ใช้งานอยู่ทุกสาขา</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: "new", data: emptyAsset() })}><Plus size={15} /> เพิ่มทรัพย์สิน</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--muted)" }} />
          <input className="field-input" style={{ paddingLeft: 32 }} placeholder="ค้นหา เลขครุภัณฑ์ / ยี่ห้อ / serial / ผู้ใช้งาน" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field-input" style={{ width: 190 }} value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
          <option value="">ทุกสาขา</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="field-input" style={{ width: 160 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {ASSET_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>เลขครุภัณฑ์</th><th>ประเภท</th><th>ยี่ห้อ/รุ่น</th><th>Serial</th><th>สาขา</th><th>ผู้ใช้งาน</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>ไม่พบรายการ — ลองปรับตัวกรอง หรือเพิ่มทรัพย์สินใหม่</td></tr>}
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="mono" style={{ color: "var(--accent)" }}>{a.assetTag}</td>
                  <td>{a.type}</td>
                  <td>{a.brand} {a.model}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{a.serial || "-"}</td>
                  <td>{branchName(a.branchId)}</td>
                  <td>{a.assignedTo || "-"}</td>
                  <td><span className="chip" style={{ background: STATUS_COLOR[a.status] + "22", color: STATUS_COLOR[a.status] }}>{a.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn" style={{ padding: 6 }} onClick={() => setModal({ mode: "edit", data: a })}><Pencil size={13} /></button>
                      <button className="btn" style={{ padding: 6 }} onClick={() => remove(a.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <AssetModal mode={modal.mode} data={modal.data} branches={branches} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function emptyAsset() { return { id: "", assetTag: "", type: ASSET_TYPES[0], brand: "", model: "", serial: "", branchId: "", assignedTo: "", status: "ในสต็อก", purchaseDate: todayISO(), notes: "" }; }

function AssetModal({ mode, data, branches, onClose, onSave }) {
  const [form, setForm] = useState(data);
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{mode === "new" ? "เพิ่มทรัพย์สินใหม่" : "แก้ไขทรัพย์สิน"}</div>
          <X size={18} style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><span className="field-label">เลขครุภัณฑ์ *</span><input className="field-input" value={form.assetTag} onChange={(e) => up("assetTag", e.target.value)} placeholder="เช่น PC-CM-0032" /></div>
          <div><span className="field-label">ประเภท</span><select className="field-input" value={form.type} onChange={(e) => up("type", e.target.value)}>{ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><span className="field-label">ยี่ห้อ</span><input className="field-input" value={form.brand} onChange={(e) => up("brand", e.target.value)} /></div>
          <div><span className="field-label">รุ่น</span><input className="field-input" value={form.model} onChange={(e) => up("model", e.target.value)} /></div>
          <div><span className="field-label">Serial Number</span><input className="field-input" value={form.serial} onChange={(e) => up("serial", e.target.value)} /></div>
          <div><span className="field-label">วันที่จัดซื้อ</span><input type="date" className="field-input" value={form.purchaseDate} onChange={(e) => up("purchaseDate", e.target.value)} /></div>
          <div><span className="field-label">สาขา *</span>
            <select className="field-input" value={form.branchId} onChange={(e) => up("branchId", e.target.value)}>
              <option value="">— เลือกสาขา —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><span className="field-label">สถานะ</span><select className="field-input" value={form.status} onChange={(e) => up("status", e.target.value)}>{ASSET_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1" }}><span className="field-label">ผู้ใช้งานประจำเครื่อง</span><input className="field-input" value={form.assignedTo} onChange={(e) => up("assignedTo", e.target.value)} placeholder="ชื่อพนักงาน (ถ้ามี)" /></div>
          <div style={{ gridColumn: "1 / -1" }}><span className="field-label">หมายเหตุ</span><textarea className="field-input" rows={2} value={form.notes} onChange={(e) => up("notes", e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!form.assetTag || !form.branchId} onClick={() => onSave(form)}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}

// ================= TICKETS =================
function TicketsView({ tickets, assets, branches, branchName, assetLabel, onCreate, onStatus, onDelete, onUploadPhoto, onDeletePhoto }) {
  const [filterStatus, setFilterStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const filtered = tickets.filter((t) => !filterStatus || t.status === filterStatus)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const detail = tickets.find((t) => t.id === detailId) || null;

  const save = async (data) => { await onCreate(data); setModal(false); };
  const remove = (id) => { if (confirm("ลบใบแจ้งซ่อมนี้ใช่หรือไม่?")) { onDelete(id); setDetailId(null); } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>แจ้งซ่อม / แจ้งเสีย</h1>
          <p style={{ color: "var(--muted)", fontSize: 13.5 }}>ติดตามใบแจ้งซ่อมทุกสาขาตั้งแต่แจ้งจนปิดงาน</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={15} /> แจ้งซ่อมใหม่</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn" style={{ background: !filterStatus ? "var(--panel2)" : "transparent", borderColor: !filterStatus ? "var(--accent)" : "var(--line)" }} onClick={() => setFilterStatus("")}>ทั้งหมด ({tickets.length})</button>
        {TICKET_STATUS.map((s) => (
          <button key={s} className="btn" style={{ background: filterStatus === s ? "var(--panel2)" : "transparent", borderColor: filterStatus === s ? "var(--accent)" : "var(--line)" }} onClick={() => setFilterStatus(s)}>
            {s} ({tickets.filter((t) => t.status === s).length})
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5, padding: 30, textAlign: "center", background: "var(--panel)", borderRadius: 12, border: "1px solid var(--line)" }}>ไม่มีใบแจ้งซ่อมในหมวดนี้</div>}
        {filtered.map((t) => (
          <div key={t.id} onClick={() => setDetailId(t.id)} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{t.ticketNo}</span>
                <span className="chip" style={{ background: PRIORITY_COLOR[t.priority] + "22", color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.issueType} {t.assetId ? `— ${assetLabel(t.assetId)}` : ""}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{branchName(t.branchId)} · แจ้งโดย {t.reporter} · {fmtDate(t.createdAt)}</div>
            </div>
            <span className="chip" style={{ background: STATUS_COLOR[t.status] + "22", color: STATUS_COLOR[t.status], flexShrink: 0 }}>{t.status}</span>
          </div>
        ))}
      </div>

      {modal && <TicketModal assets={assets} branches={branches} onClose={() => setModal(false)} onSave={save} />}
      {detail && (
        <TicketDetail
          t={detail} branchName={branchName} assetLabel={assetLabel}
          onClose={() => setDetailId(null)}
          onStatus={(s) => onStatus(detail, s)}
          onDelete={() => remove(detail.id)}
          onUploadPhoto={(category, file) => onUploadPhoto(detail.id, category, file)}
          onDeletePhoto={onDeletePhoto}
        />
      )}
    </div>
  );
}

function emptyTicket() { return { assetId: "", branchId: "", reporter: "", issueType: "", description: "", priority: "ปานกลาง", status: "แจ้งใหม่" }; }

function TicketModal({ assets, branches, onClose, onSave }) {
  const [form, setForm] = useState(emptyTicket());
  const [saving, setSaving] = useState(false);
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const branchAssets = assets.filter((a) => a.branchId === form.branchId);

  const submit = async () => { setSaving(true); await onSave(form); setSaving(false); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>แจ้งซ่อม / แจ้งเสียใหม่</div>
          <X size={18} style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><span className="field-label">สาขา *</span>
            <select className="field-input" value={form.branchId} onChange={(e) => up("branchId", e.target.value)}>
              <option value="">— เลือกสาขา —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><span className="field-label">อุปกรณ์ที่เกี่ยวข้อง</span>
            <select className="field-input" value={form.assetId} onChange={(e) => up("assetId", e.target.value)}>
              <option value="">— ไม่ระบุ —</option>
              {branchAssets.map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.brand} {a.model}</option>)}
            </select>
          </div>
          <div><span className="field-label">ผู้แจ้ง *</span><input className="field-input" value={form.reporter} onChange={(e) => up("reporter", e.target.value)} /></div>
          <div><span className="field-label">ประเภทปัญหา *</span><input className="field-input" value={form.issueType} onChange={(e) => up("issueType", e.target.value)} placeholder="เช่น เครื่องเปิดไม่ติด" /></div>
          <div><span className="field-label">ความสำคัญ</span><select className="field-input" value={form.priority} onChange={(e) => up("priority", e.target.value)}>{PRIORITY.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><span className="field-label">สถานะเริ่มต้น</span><select className="field-input" value={form.status} onChange={(e) => up("status", e.target.value)}>{TICKET_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1" }}><span className="field-label">รายละเอียดปัญหา</span><textarea className="field-input" rows={3} value={form.description} onChange={(e) => up("description", e.target.value)} /></div>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>แนบรูปได้หลังจากบันทึกใบแจ้งซ่อม — เปิดใบงานนี้แล้วแนบรูปทั้ง 4 ประเภทได้ในหน้ารายละเอียด</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!form.branchId || !form.reporter || !form.issueType || saving} onClick={submit}>
            {saving ? "กำลังบันทึก…" : "บันทึกใบแจ้งซ่อม"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketDetail({ t, branchName, assetLabel, onClose, onStatus, onDelete, onUploadPhoto, onDeletePhoto }) {
  const [lightbox, setLightbox] = useState(null);
  const photos = t.photos || emptyPhotos();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="mono" style={{ color: "var(--accent)", fontSize: 13 }}>{t.ticketNo}</span>
          <X size={18} style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{t.issueType}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{branchName(t.branchId)} · แจ้งโดย {t.reporter} · {fmtDate(t.createdAt)}</div>
        {t.assetId && <div style={{ marginBottom: 12, fontSize: 13.5 }}><span style={{ color: "var(--muted)" }}>อุปกรณ์: </span>{assetLabel(t.assetId)}</div>}
        {t.description && <div style={{ marginBottom: 16, fontSize: 13.5, background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>{t.description}</div>}

        <span className="field-label">อัปเดตสถานะ</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {TICKET_STATUS.map((s) => (
            <button key={s} className="btn" style={{
              padding: "6px 12px", fontSize: 12.5,
              background: t.status === s ? STATUS_COLOR[s] + "22" : "transparent",
              borderColor: t.status === s ? STATUS_COLOR[s] : "var(--line)",
              color: t.status === s ? STATUS_COLOR[s] : "var(--text)",
            }} onClick={() => onStatus(s)}>{s}</button>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <ImageIcon size={14} style={{ color: "var(--accent)" }} /> รูปประกอบใบแจ้งซ่อม
          </div>
          {PHOTO_CATEGORIES.map((cat) => (
            <PhotoField
              key={cat.key}
              label={cat.label}
              photos={photos[cat.key] || []}
              onAdd={(file) => onUploadPhoto(cat.key, file)}
              onRemove={onDeletePhoto}
              onView={setLightbox}
            />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button className="btn" onClick={onDelete} style={{ color: "#F87171" }}><Trash2 size={13} /> ลบใบแจ้งซ่อม</button>
          <button className="btn btn-primary" onClick={onClose}>ปิด</button>
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// photos: array of {id, url}
function PhotoField({ label, photos, onAdd, onRemove, onView }) {
  const [uploading, setUploading] = useState(false);
  const inputId = "upload_" + label.replace(/\s+/g, "_") + "_" + Math.random().toString(36).slice(2, 6);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) await onAdd(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <span className="field-label">{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", background: "var(--bg)" }}>
            <img src={p.url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }} onClick={() => onView(p.url)} />
            <button onClick={() => onRemove(p.id)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(10,13,20,0.75)", border: "none", borderRadius: 5, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
              <X size={11} color="#fff" />
            </button>
          </div>
        ))}
        <label htmlFor={inputId} style={{ width: 64, height: 64, borderRadius: 8, border: "1px dashed var(--line)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", gap: 2 }}>
          {uploading ? <Loader2 size={16} /> : <ImagePlus size={16} />}
          <span style={{ fontSize: 9.5 }}>{uploading ? "กำลังอัปโหลด" : "เพิ่มรูป"}</span>
        </label>
        <input id={inputId} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function Lightbox({ src, onClose }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 60, background: "rgba(4,6,10,0.9)" }} onClick={onClose}>
      <img src={src} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
      <X size={22} color="#fff" style={{ position: "absolute", top: 22, right: 26, cursor: "pointer" }} onClick={onClose} />
    </div>
  );
}

// ================= BRANCHES =================
function BranchesView({ branches, assets, onAdd, onAddBulk, onEdit, onDelete }) {
  const [modal, setModal] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [q, setQ] = useState("");

  const countFor = (id) => assets.filter((a) => a.branchId === id).length;
  const filtered = branches.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()));

  const save = async (data) => {
    if (modal.mode === "new") await onAdd(data); else await onEdit(data);
    setModal(null);
  };
  const remove = (id) => { if (confirm("ลบสาขานี้ใช่หรือไม่? (จะไม่ลบทรัพย์สินที่ผูกอยู่)")) onDelete(id); };

  const saveBulk = async () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      const [name, code, province] = line.split(",").map((s) => s?.trim());
      return { name: name || line, code: code || "", province: province || "" };
    });
    await onAddBulk(rows);
    setBulkText(""); setBulk(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>สาขา</h1>
          <p style={{ color: "var(--muted)", fontSize: 13.5 }}>รายชื่อสาขาในเขตภาคเหนือทั้งหมด</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setBulk(true)}>เพิ่มหลายสาขาพร้อมกัน</button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: "new", data: { name: "", code: "", province: "" } })}><Plus size={15} /> เพิ่มสาขา</button>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 320 }}>
        <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--muted)" }} />
        <input className="field-input" style={{ paddingLeft: 32 }} placeholder="ค้นหาสาขา" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <table>
          <thead><tr><th>ชื่อสาขา</th><th>รหัส</th><th>จังหวัด</th><th>จำนวนทรัพย์สิน</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>ยังไม่มีสาขา — เริ่มเพิ่มสาขาแรกได้เลย</td></tr>}
            {filtered.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td className="mono" style={{ color: "var(--muted)" }}>{b.code || "-"}</td>
                <td>{b.province || "-"}</td>
                <td className="mono">{countFor(b.id)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={{ padding: 6 }} onClick={() => setModal({ mode: "edit", data: b })}><Pencil size={13} /></button>
                    <button className="btn" style={{ padding: 6 }} onClick={() => remove(b.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{modal.mode === "new" ? "เพิ่มสาขา" : "แก้ไขสาขา"}</div>
              <X size={18} style={{ cursor: "pointer", color: "var(--muted)" }} onClick={() => setModal(null)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><span className="field-label">ชื่อสาขา *</span><input className="field-input" value={modal.data.name} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))} /></div>
              <div><span className="field-label">รหัสสาขา</span><input className="field-input" value={modal.data.code} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, code: e.target.value } }))} /></div>
              <div><span className="field-label">จังหวัด</span>
                <select className="field-input" value={modal.data.province} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, province: e.target.value } }))}>
                  <option value="">— เลือกจังหวัด —</option>
                  {NORTH_PROVINCES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="btn" onClick={() => setModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" disabled={!modal.data.name} onClick={() => save(modal.data)}>บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {bulk && (
        <div className="modal-overlay" onClick={() => setBulk(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>เพิ่มหลายสาขาพร้อมกัน</div>
              <X size={18} style={{ cursor: "pointer", color: "var(--muted)" }} onClick={() => setBulk(false)} />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>ใส่บรรทัดละ 1 สาขา รูปแบบ: ชื่อสาขา, รหัส, จังหวัด (รหัสและจังหวัดใส่หรือไม่ใส่ก็ได้)</p>
            <textarea className="field-input" rows={9} placeholder={"สาขาเชียงใหม่ 1, CM01, เชียงใหม่\nสาขาลำปาง 2, LP02, ลำปาง"} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setBulk(false)}>ยกเลิก</button>
              <button className="btn btn-primary" disabled={!bulkText.trim()} onClick={saveBulk}>เพิ่มสาขาทั้งหมด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
