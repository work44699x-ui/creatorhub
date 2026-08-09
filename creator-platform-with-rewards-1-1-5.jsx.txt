import React, { useState, useEffect } from "react";
import { Compass, Flag, Wallet, User, Search, Gift, ChevronRight, Bell, HelpCircle, BookOpen, Link2, UserPlus, Moon, Globe, Play, Heart, MessageCircle, LogOut, ShieldCheck, Pencil, SlidersHorizontal, DollarSign, TrendingUp, TrendingDown, Trash2, Calculator, PiggyBank } from "lucide-react";

// ---------- backend API ----------
// Paste your deployed Apps Script Web App URL (ends in /exec) here:
const API_URL = "https://script.google.com/macros/s/AKfycbyxMocd9OtsVYgna_DRTk2T5U9LH3tsCjMMdBeidsOYFIZB-c9kBoDhlzIZ3llMKFN1/exec";
let AUTH_TOKEN = null; // set on login, cleared on logout — never persisted to storage
async function apiCall(action, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight against Apps Script
    body: JSON.stringify({ action, token: AUTH_TOKEN, ...(payload || {}) }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Request failed.");
  return data.result;
}

// ---------- design tokens (dark) ----------
const C = {
  bg: "#0A0A0B",
  surface: "#161618",
  surfaceAlt: "#1E1E21",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#FFFFFF",
  textMuted: "#9AA0A6",
  textFaint: "#6B7076",
  accent: "#FF3B5C",
  accentSoft: "rgba(255,59,92,0.14)",
  green: "#22C55E",
  greenSoft: "rgba(34,197,94,0.14)",
  amber: "#F5A623",
  amberSoft: "rgba(245,166,35,0.14)",
  red: "#EF4444",
  redSoft: "rgba(239,68,68,0.14)",
};

const sans = `Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;

// ---------- storage helpers ----------
const KEYS = {
  users: "users", tasks: "tasks", taskSubs: "task_submissions", reels: "reel_submissions",
  orders: "promotion_orders", announcements: "announcements", campaigns: "reward_campaigns", payments: "reward_payments",
  finance: "finance_data", activityLog: "admin_activity_log", sessionLog: "session_activity_log",
};
async function getJSON(key, fallback) {
  try { const r = await apiCall("getCollection", { key }); return (r === undefined || r === null) ? fallback : r; }
  catch { return fallback; }
}
async function setJSON(key, value) {
  try { await apiCall("setCollection", { key, value }); } catch (e) { console.error(e); }
}
const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtDateShort = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const monthKey = (dateStr) => (dateStr || todayStr()).slice(0, 7);
const monthLabel = (key) => { const [y, m] = key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }); };
const shiftMonthKey = (key, delta) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return d.toISOString().slice(0, 7); };

// ---------- session / login activity ----------
// Tracks only CreatorHub login/logout events (username + event + timestamp) — no device data.
function formatDuration(ms) {
  if (!ms || ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}
function computeSessionStats(username, sessionLog) {
  const events = (sessionLog || []).filter((e) => e.username === username).sort((a, b) => new Date(a.at) - new Date(b.at));
  let totalMs = 0;
  let openLogin = null;
  events.forEach((e) => {
    if (e.event === "login") openLogin = new Date(e.at);
    else if (e.event === "logout" && openLogin) { totalMs += new Date(e.at) - openLogin; openLogin = null; }
  });
  if (openLogin) totalMs += (Date.now() - openLogin);
  const lastActiveAt = events.length ? events[events.length - 1].at : null;
  const loginCount = events.filter((e) => e.event === "login").length;
  return { totalMs, lastActiveAt, loginCount, events: [...events].reverse() };
}

// default reward eligibility thresholds — can be overridden by finance.rewardConfig
const DEFAULT_REWARD_CONFIG = {
  weeklyWinnersCount: 5, weeklyAmountPerWinner: 100, weeklyThresholdPct: 100,
  monthlyWinnersCount: 10, monthlyAmountPerWinner: 100, monthlyThresholdPct: 80,
  monthlyMinApproved: 15,
};

// ---------- member analytics ----------
function computeMemberAnalytics(username, taskSubs, reels, payments, rewardConfig) {
  const cfg = { ...DEFAULT_REWARD_CONFIG, ...(rewardConfig || {}) };
  const mySubs = taskSubs.filter((s) => s.username === username);
  const myReels = reels.filter((r) => r.username === username);
  const myPayments = payments.filter((p) => p.username === username);

  const approvedSubs = mySubs.filter((s) => s.status === "approved");
  const rejectedSubs = mySubs.filter((s) => s.status === "rejected");
  const pendingSubs = mySubs.filter((s) => s.status === "pending");

  const today = dayKey(new Date());
  const todaySubs = mySubs.filter((s) => dayKey(s.submittedAt) === today);
  const todayCompleted = todaySubs.some((s) => s.status === "approved" || s.status === "pending");

  const last7 = daysAgo(6);
  const last30 = daysAgo(29);
  const activeDaySet = new Set([...mySubs, ...myReels].map((x) => dayKey(x.submittedAt)));
  const activeDays = activeDaySet.size;

  const daysWithApprovalInRange = (fromDate) => {
    const set = new Set(
      approvedSubs.filter((s) => new Date(s.submittedAt) >= fromDate).map((s) => dayKey(s.submittedAt))
    );
    return set.size;
  };
  const weeklyCompletedDays = daysWithApprovalInRange(last7);
  const monthlyCompletedDays = daysWithApprovalInRange(last30);
  const weeklyPct = Math.round((weeklyCompletedDays / 7) * 100);
  const monthlyPct = Math.round((monthlyCompletedDays / 30) * 100);

  const screenshotsSubmitted = mySubs.filter((s) => s.screenshotData || s.screenshotUrl).length;
  const reelsPromoted = myReels.filter((r) => r.status === "approved").length;
  const rewardsEarned = myPayments.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount || 0), 0);
  const rewardsPending = myPayments.filter((p) => p.status === "pending").reduce((a, p) => a + Number(p.amount || 0), 0);

  // ---- consecutive active months (calendar months with >= monthlyMinApproved approved screenshots) ----
  const approvedByMonth = {};
  approvedSubs.forEach((s) => { const mk = monthKey(s.submittedAt); approvedByMonth[mk] = (approvedByMonth[mk] || 0) + 1; });
  let consecutiveMonths = 0;
  let cursorKey = monthKey(todayStr());
  // only count the current month if it already meets the bar; then walk backward
  while ((approvedByMonth[cursorKey] || 0) >= cfg.monthlyMinApproved) {
    consecutiveMonths += 1;
    cursorKey = shiftMonthKey(cursorKey, -1);
  }
  const currentMonthApproved = approvedByMonth[monthKey(todayStr())] || 0;

  const weeklyEligible = weeklyPct >= cfg.weeklyThresholdPct;
  const monthlyEligible = monthlyPct >= cfg.monthlyThresholdPct;
  const eligible = weeklyEligible; // kept for backward compatibility with existing call sites

  return {
    mySubs, myReels, myPayments,
    approvedCount: approvedSubs.length, rejectedCount: rejectedSubs.length, pendingCount: pendingSubs.length,
    todayCompleted, activeDays, weeklyPct, monthlyPct, weeklyCompletedDays, monthlyCompletedDays,
    screenshotsSubmitted, reelsSubmitted: myReels.length, reelsPromoted,
    rewardsEarned, rewardsPending, eligible, weeklyEligible, monthlyEligible,
    consecutiveMonths, currentMonthApproved,
  };
}

// Reward status: Not Eligible -> Pending Review -> Eligible -> Selected -> Paid
function rewardStatus({ eligible, hasPendingReview, selectedPayment }) {
  if (selectedPayment && selectedPayment.status === "paid") return "Paid";
  if (selectedPayment && selectedPayment.status === "pending") return "Selected";
  if (eligible) return "Eligible";
  if (hasPendingReview) return "Pending Review";
  return "Not Eligible";
}
function rewardStatusColor(status) {
  return { "Not Eligible": C.textFaint, "Pending Review": C.amber, Eligible: C.accent, Selected: C.accent, Paid: C.green }[status] || C.textFaint;
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800, color: color || C.text }}>{value}</div>
      <div style={{ fontFamily: sans, fontSize: 10.5, color: C.textFaint, marginTop: 3, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function MemberAnalyticsPanel({ member, taskSubs, reels, payments, onBack, onToggleSuspend, rewardConfig, sessionLog }) {
  const a = computeMemberAnalytics(member.username, taskSubs, reels, payments, rewardConfig);
  const recentSubs = [...a.mySubs].sort((x, y) => new Date(y.submittedAt) - new Date(x.submittedAt)).slice(0, 8);
  const sess = computeSessionStats(member.username, sessionLog);
  const recentSessions = sess.events.slice(0, 8);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Button small variant="ghost" onClick={onBack}>← Back</Button>
        <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 800 }}>@{member.username}</div>
        <Badge status={member.status} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: a.weeklyEligible ? C.green : C.textFaint, background: a.weeklyEligible ? C.greenSoft : C.surfaceAlt, borderRadius: 999, padding: "5px 12px" }}>
            {a.weeklyEligible ? "Weekly eligible" : "Weekly: not yet"}
          </span>
          <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: a.monthlyEligible ? C.green : C.textFaint, background: a.monthlyEligible ? C.greenSoft : C.surfaceAlt, borderRadius: 999, padding: "5px 12px" }}>
            {a.monthlyEligible ? "Monthly eligible" : "Monthly: not yet"}
          </span>
        </div>
      </div>

      <SectionHeader title="Completion" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        <MiniStat label="Today" value={a.todayCompleted ? "Done" : "Not yet"} color={a.todayCompleted ? C.green : C.amber} />
        <MiniStat label="Weekly %" value={`${a.weeklyPct}%`} color={a.weeklyEligible ? C.green : C.text} />
        <MiniStat label="Monthly %" value={`${a.monthlyPct}%`} color={a.monthlyEligible ? C.green : C.text} />
      </div>
      <ProgressBar pct={a.weeklyPct} color={a.weeklyEligible ? C.green : C.amber} />
      <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, margin: "6px 0 18px" }}>
        {a.weeklyCompletedDays}/7 days completed this week · {a.monthlyCompletedDays}/30 days this month · {a.activeDays} total active days · {a.consecutiveMonths} consecutive active month{a.consecutiveMonths === 1 ? "" : "s"}
      </div>

      <SectionHeader title="Submissions" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
        <MiniStat label="Approved" value={a.approvedCount} color={C.green} />
        <MiniStat label="Pending" value={a.pendingCount} color={C.amber} />
        <MiniStat label="Rejected" value={a.rejectedCount} color={C.red} />
      </div>

      <SectionHeader title="Reels & rewards" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 10 }}>
        <MiniStat label="Screenshots submitted" value={a.screenshotsSubmitted} />
        <MiniStat label="Reels submitted" value={a.reelsSubmitted} />
        <MiniStat label="Reels promoted" value={a.reelsPromoted} color={C.green} />
        <MiniStat label="Rewards earned" value={`₹${a.rewardsEarned}`} color={C.green} />
      </div>
      {a.rewardsPending > 0 && (
        <div style={{ fontFamily: sans, fontSize: 12, color: C.amber, marginBottom: 18 }}>₹{a.rewardsPending} pending payout</div>
      )}

      <SectionHeader title="Recent activity" />
      {recentSubs.length === 0 && <EmptyNote text="No task submissions yet." />}
      <Card style={{ padding: 0, marginBottom: 18 }}>
        {recentSubs.map((s, i) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: C.textMuted }}>{fmtDateShort(s.submittedAt)}</span>
            <Badge status={s.status} />
          </div>
        ))}
      </Card>

      <SectionHeader title="Account & sessions" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
        <MiniStat label="Total active time" value={formatDuration(sess.totalMs)} />
        <MiniStat label="Last active" value={sess.lastActiveAt ? fmtDateShort(sess.lastActiveAt) : "—"} />
        <MiniStat label="Account created" value={member.joinedAt ? fmtDateShort(member.joinedAt) : "—"} />
      </div>
      <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, margin: "0 0 10px" }}>
        {sess.loginCount} login{sess.loginCount === 1 ? "" : "s"} recorded on CreatorHub
      </div>
      {recentSessions.length === 0 && <EmptyNote text="No login activity recorded yet." />}
      {recentSessions.length > 0 && (
        <Card style={{ padding: 0, marginBottom: 18 }}>
          {recentSessions.map((e, i) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: C.textMuted, textTransform: "capitalize" }}>{e.event}</span>
              <span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>{new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </Card>
      )}

      {member.role === "member" && (
        <Button small variant="ghost" onClick={() => onToggleSuspend(member)}>{member.status === "active" ? "Suspend member" : "Restore member"}</Button>
      )}
    </div>
  );
}

const SEED_USERS = [
  { id: "u_owner", username: "priya_owner", role: "owner", status: "active", instagram: "@priya.creates", joinedAt: "2025-08-31" },
  { id: "u_admin", username: "dev_admin", role: "admin", status: "active", instagram: "@dev.reels", joinedAt: "2025-09-02" },
  { id: "u_1", username: "aisha_k", role: "member", status: "active", instagram: "@aisha.k", joinedAt: "2025-10-14" },
  { id: "u_2", username: "raj_travels", role: "member", status: "active", instagram: "@raj.travels", joinedAt: "2025-11-01" },
];
const SEED_TASKS = [
  { id: "t1", title: "Promote @aisha.k's new Reel", instructions: "Watch fully, like, and leave a genuine comment (5+ words).", reelUrl: "https://instagram.com/reel/example1", requiredActions: ["watch", "like", "comment"], deadline: new Date(Date.now() + 86400000).toISOString(), status: "active", capacity: 40 },
  { id: "t2", title: "Promote @raj.travels' new Reel", instructions: "Watch fully and like — comments optional.", reelUrl: "https://instagram.com/reel/example2", requiredActions: ["watch", "like"], deadline: new Date(Date.now() + 172800000).toISOString(), status: "active", capacity: 40 },
];
const SEED_ANN = [
  { id: "a1", title: "Welcome to the platform", body: "Every promotion here is a real member action — no bots, ever. Complete your daily task and submit proof below.", category: "rules", createdAt: new Date().toISOString(), postedBy: "dev_admin" },
];
const SEED_FINANCE = {
  revenues: [
    { id: "rv1", source: "Reel Promotion orders", amount: 12500, date: todayStr(), confirmed: true, campaign: "Reel Promotion" },
    { id: "rv2", source: "Creator Campaigns retainer", amount: 20000, date: todayStr(), confirmed: true, campaign: "Creator Campaigns" },
  ],
  expenses: [
    { id: "ex1", category: "Tools", label: "Hosting & storage", amount: 1800, date: todayStr(), campaign: "" },
    { id: "ex2", category: "Marketing", label: "Paid promotion", amount: 3000, date: todayStr(), campaign: "Reel Promotion" },
  ],
  salaries: [
    { id: "sl1", name: "dev_admin", role: "Admin", amount: 15000, date: todayStr() },
  ],
  calc: { avgOrderValue: 500, expectedOrders: 10, expectedCampaigns: 2, avgCampaignRevenue: 8000 },
  viewsCalc: { reelsPerDay: 5, avgViewsPerReel: 50000, daysPerWeek: 7, daysPerMonth: 30, paymentPer1M: 40, rewardCostPerWeek: 1000 },
  rewardConfig: { ...DEFAULT_REWARD_CONFIG },
};

// ---------- shared UI ----------
function Badge({ status }) {
  const map = {
    approved: { label: "Approved", fg: C.green, bg: C.greenSoft },
    pending: { label: "Pending", fg: C.amber, bg: C.amberSoft },
    rejected: { label: "Rejected", fg: C.red, bg: C.redSoft },
    completed: { label: "Paid out", fg: C.green, bg: C.greenSoft },
    active: { label: "Active", fg: C.green, bg: C.greenSoft },
    inactive: { label: "Inactive", fg: C.textFaint, bg: C.surfaceAlt },
    suspended: { label: "Suspended", fg: C.red, bg: C.redSoft },
    new: { label: "New", fg: C.accent, bg: C.accentSoft },
    accepted: { label: "Accepted", fg: C.green, bg: C.greenSoft },
    declined: { label: "Declined", fg: C.red, bg: C.redSoft },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: sans, fontSize: 12, fontWeight: 600, color: s.fg, background: s.bg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }} />
      {s.label}
    </span>
  );
}

function Card({ children, style, onClick }) {
  return <div onClick={onClick} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>;
}

function Button({ children, onClick, variant = "primary", small, disabled, full }) {
  const base = { fontFamily: sans, fontSize: small ? 13 : 14, fontWeight: 700, padding: small ? "8px 14px" : "12px 18px", borderRadius: 999, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid transparent", opacity: disabled ? 0.4 : 1, width: full ? "100%" : "auto" };
  const styles = {
    primary: { background: C.accent, color: "#fff" },
    success: { background: C.green, color: "#0A0A0B" },
    ghost: { background: C.surfaceAlt, color: C.text, border: `1px solid ${C.border}` },
    danger: { background: "transparent", color: C.red, border: `1px solid ${C.border}` },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...styles[variant] }}>{children}</button>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "11px 13px", fontFamily: sans, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 12, background: C.surfaceAlt, color: C.text, outline: "none" };

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 }}>
      <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color || C.amber, borderRadius: 999 }} />
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: sans, fontSize: 13, fontWeight: 600, padding: "7px 15px", borderRadius: 999, cursor: "pointer",
      background: active ? C.accentSoft : C.surfaceAlt, color: active ? C.accent : C.textMuted,
      border: `1px solid ${active ? C.accent : C.border}`, whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 14px", minWidth: 100, flex: "1 1 100px", textAlign: "center" }}>
      <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: C.text }}>{value}</div>
      <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textMuted, marginTop: 3, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
      {action}
    </div>
  );
}

function EmptyNote({ text }) {
  return <div style={{ fontFamily: sans, fontSize: 13, color: C.textFaint, padding: "24px 0", textAlign: "center" }}>{text}</div>;
}

function ListRow({ icon, label, value, onClick, danger }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ color: danger ? C.red : C.textMuted }}>{icon}</div>
      <div style={{ flex: 1, fontFamily: sans, fontSize: 14.5, fontWeight: 600, color: danger ? C.red : C.text }}>{label}</div>
      {value && <div style={{ fontFamily: sans, fontSize: 13, color: C.textFaint }}>{value}</div>}
      {onClick && !danger && <ChevronRight size={16} color={C.textFaint} />}
    </div>
  );
}
function RowDivider() { return <div style={{ height: 1, background: C.border, marginLeft: 16 }} />; }

// ================= MAIN APP =================
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("landing");
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskSubs, setTaskSubs] = useState([]);
  const [reels, setReels] = useState([]);
  const [orders, setOrders] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [payments, setPayments] = useState([]);
  const [finance, setFinance] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [sessionLog, setSessionLog] = useState([]);
  const [toast, setToast] = useState(null);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  // Fetches every collection, scoped server-side to whatever role the current session token holds.
  // Called once on mount (pre-login, mostly empty) and again right after a successful sign-in.
  const loadAll = async () => {
    let u = await getJSON(KEYS.users, []);
    let t = await getJSON(KEYS.tasks, []);
    let ann = await getJSON(KEYS.announcements, []);
    let fin = await getJSON(KEYS.finance, null);
    if (fin) fin = { ...SEED_FINANCE, ...fin, viewsCalc: { ...SEED_FINANCE.viewsCalc, ...(fin.viewsCalc || {}) }, rewardConfig: { ...SEED_FINANCE.rewardConfig, ...(fin.rewardConfig || {}) } };
    const ts = await getJSON(KEYS.taskSubs, []);
    const rl = await getJSON(KEYS.reels, []);
    const ord = await getJSON(KEYS.orders, []);
    const camp = await getJSON(KEYS.campaigns, []);
    const pay = await getJSON(KEYS.payments, []);
    const log = await getJSON(KEYS.activityLog, []);
    const slog = await getJSON(KEYS.sessionLog, []);
    setUsers(u); setTasks(t); setAnnouncements(ann); setTaskSubs(ts); setReels(rl); setOrders(ord); setCampaigns(camp); setPayments(pay); setFinance(fin); setActivityLog(log); setSessionLog(slog);
  };

  useEffect(() => { (async () => { await loadAll(); setLoaded(true); })(); }, []);

  // Real login: verifies username+password on the server, which returns a session token.
  // The server — not the browser — decides the account's role.
  const doLogin = async (username, password) => {
    const { token, username: uname, role, payoutMethod } = await apiCall("login", { username, password });
    AUTH_TOKEN = token;
    await loadAll();
    const newSession = { id: uname, username: uname, role, status: "active", payoutMethod };
    setSession(newSession);
    setView(role === "admin" || role === "owner" ? "admin" : "member");
    notify(`Signed in as ${uname}`);
  };

  const doLogout = async () => {
    try { await apiCall("logout", {}); } catch (e) { /* token already invalid — fine */ }
    AUTH_TOKEN = null;
  };

  const persist = {
    users: async (v) => { setUsers(v); await setJSON(KEYS.users, v); },
    tasks: async (v) => { setTasks(v); await setJSON(KEYS.tasks, v); },
    taskSubs: async (v) => { setTaskSubs(v); await setJSON(KEYS.taskSubs, v); },
    reels: async (v) => { setReels(v); await setJSON(KEYS.reels, v); },
    orders: async (v) => { setOrders(v); await setJSON(KEYS.orders, v); },
    announcements: async (v) => { setAnnouncements(v); await setJSON(KEYS.announcements, v); },
    campaigns: async (v) => { setCampaigns(v); await setJSON(KEYS.campaigns, v); },
    payments: async (v) => { setPayments(v); await setJSON(KEYS.payments, v); },
    finance: async (v) => { setFinance(v); await setJSON(KEYS.finance, v); },
    activityLog: async (v) => { setActivityLog(v); await setJSON(KEYS.activityLog, v); },
    sessionLog: async (v) => { setSessionLog(v); await setJSON(KEYS.sessionLog, v); },
  };

  const logActivity = async (actor, action, detail) => {
    const entry = { id: uid(), actor, action, detail: detail || "", at: new Date().toISOString() };
    const next = [entry, ...activityLog].slice(0, 300);
    await persist.activityLog(next);
  };

  // Records only CreatorHub login/logout activity — no device or off-platform data.
  const recordSessionEvent = async (username, event) => {
    if (!username) return;
    const entry = { id: uid(), username, event, at: new Date().toISOString() };
    const next = [entry, ...sessionLog].slice(0, 1000);
    await persist.sessionLog(next);
  };

  if (!loaded) {
    return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, color: C.textMuted, fontSize: 14 }}>Loading…</div>;
  }

  const isStaff = session && (session.role === "admin" || session.role === "owner");

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: sans }}>
      {toast && (
        <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, color: "#fff", padding: "10px 18px", borderRadius: 999, fontSize: 13, zIndex: 100, fontFamily: sans, whiteSpace: "nowrap" }}>{toast}</div>
      )}

      {view === "landing" && <Landing setView={setView} orders={orders} persistOrders={persist.orders} notify={notify} />}
      {view === "login" && <Login setView={setView} notify={notify} onSubmitLogin={doLogin} />}

      {view === "member" && session && (
        <MemberApp
          session={session} setSession={setSession} setView={setView} isStaff={isStaff}
          tasks={tasks} taskSubs={taskSubs} persistTaskSubs={persist.taskSubs}
          reels={reels} persistReels={persist.reels} announcements={announcements} payments={payments} notify={notify}
          orders={orders} persistOrders={persist.orders} users={users} persistUsers={persist.users} finance={finance}
          onLogout={doLogout}
        />
      )}

      {view === "admin" && session && isStaff && (
        <AdminShell session={session} setView={setView} setSession={setSession} onLogout={doLogout}>
          <Admin
            session={session} users={users} persistUsers={persist.users} tasks={tasks} persistTasks={persist.tasks}
            taskSubs={taskSubs} persistTaskSubs={persist.taskSubs} reels={reels} persistReels={persist.reels}
            orders={orders} persistOrders={persist.orders} announcements={announcements} persistAnnouncements={persist.announcements}
            campaigns={campaigns} persistCampaigns={persist.campaigns} payments={payments} persistPayments={persist.payments} setPayments={setPayments} notify={notify}
            finance={finance} persistFinance={persist.finance} activityLog={activityLog} logActivity={logActivity}
            sessionLog={sessionLog}
          />
        </AdminShell>
      )}
    </div>
  );
}

// ---------- MEMBER APP (bottom tab shell) ----------
function MemberApp({ session, setSession, setView, isStaff, tasks, taskSubs, persistTaskSubs, reels, persistReels, announcements, payments, notify, orders, persistOrders, users, persistUsers, finance, onLogout }) {
  const [tab, setTab] = useState("discover");
  const titles = { discover: "Discover", activity: "My Activity", balance: "My Balance", profile: "Profile" };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", position: "relative", paddingBottom: 100 }}>
      <div style={{ padding: "22px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: sans, fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{titles[tab]}</h1>
        {tab === "discover" && (
          <div onClick={() => notify("Rewards go here.")} style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Gift size={18} color="#0A0A0B" />
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px 0" }}>
        {tab === "discover" && <DiscoverTab tasks={tasks} taskSubs={taskSubs} persistTaskSubs={persistTaskSubs} reels={reels} persistReels={persistReels} orders={orders} persistOrders={persistOrders} session={session} notify={notify} />}
        {tab === "activity" && <ActivityTab session={session} tasks={tasks} taskSubs={taskSubs} reels={reels} payments={payments} />}
        {tab === "balance" && <BalanceTab session={session} setSession={setSession} payments={payments} users={users} persistUsers={persistUsers} notify={notify} />}
        {tab === "profile" && <ProfileTab session={session} setSession={setSession} setView={setView} isStaff={isStaff} tasks={tasks} taskSubs={taskSubs} reels={reels} payments={payments} announcements={announcements} notify={notify} finance={finance} onLogout={onLogout} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { k: "discover", icon: Compass },
    { k: "activity", icon: Flag },
    { k: "balance", icon: Wallet },
    { k: "profile", icon: User },
  ];
  return (
    <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 40px)", maxWidth: 420, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 999, display: "flex", justifyContent: "space-around", padding: "10px 8px", zIndex: 50 }}>
      {items.map(({ k, icon: Icon }) => {
        const active = tab === k;
        return (
          <div key={k} onClick={() => setTab(k)} style={{ cursor: "pointer", width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={21} color={active ? C.accent : C.textFaint} strokeWidth={2.2} fill={active ? C.accent : "none"} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- DISCOVER ----------
const BOOST_PACKAGES = [
  { id: "starter", label: "Starter", likes: 50, comments: 10, views: "1K", price: 199 },
  { id: "growth", label: "Growth", likes: 150, comments: 30, views: "5K", price: 499 },
  { id: "pro", label: "Pro", likes: 400, comments: 80, views: "15K", price: 999 },
];
const BOOST_CATEGORIES = ["Comedy", "Music", "Lifestyle", "Business", "Fashion", "Other"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DiscoverTab({ tasks, taskSubs, persistTaskSubs, reels, persistReels, orders, persistOrders, session, notify }) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [boostForm, setBoostForm] = useState({ reelUrl: "", category: BOOST_CATEGORIES[0], caption: "", packageId: "starter" });
  const [submittingBoost, setSubmittingBoost] = useState(false);

  const approvedReels = reels.filter((r) => r.status === "approved");
  const activeTasks = tasks.filter((t) => t.status === "active");

  const items = [
    ...activeTasks.map((t) => ({ kind: "task", id: t.id, title: t.title, sub: t.requiredActions, deadline: t.deadline, capacity: t.capacity || 40, data: t })),
    ...(filter === "All" || filter === "Reel queue" ? approvedReels.map((r) => ({ kind: "reel", id: r.id, title: `${r.username}'s Reel · ${r.category}`, sub: [r.category], deadline: null, capacity: 30, data: r })) : []),
  ].filter((i) => filter === "All" || (filter === "Tasks" && i.kind === "task") || (filter === "Reel queue" && i.kind === "reel"))
   .filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) return notify("That screenshot is too large — please use one under 4.5MB.");
    setUploading(true);
    try {
      const b64 = await fileToBase64(file);
      setProofFile({ name: file.name, data: b64 });
    } catch { notify("Couldn't read that image — try again."); }
    setUploading(false);
  };

  const submit = async (task) => {
    if (!proofFile) return notify("Attach a screenshot first.");
    const sub = { id: uid(), taskId: task.id, username: session.username, screenshotData: proofFile.data, status: "pending", submittedAt: new Date().toISOString() };
    await persistTaskSubs([sub, ...taskSubs]);
    setOpen(null); setProofFile(null);
    notify("Screenshot submitted — pending admin review.");
  };

  const pkg = BOOST_PACKAGES.find((p) => p.id === boostForm.packageId);
  const submitBoost = async () => {
    if (!boostForm.reelUrl) return notify("Add your Reel URL first.");
    setSubmittingBoost(true);
    const order = {
      id: uid(), name: session.username, contact: session.username, instagram: session.instagram || "",
      reelUrl: boostForm.reelUrl, service: `Boost — ${pkg.label} (${pkg.likes} likes, ${pkg.comments} comments, ~${pkg.views} views)`,
      budget: `₹${pkg.price}`, status: "new", createdAt: new Date().toISOString(),
    };
    const reel = {
      id: uid(), username: session.username, url: boostForm.reelUrl, category: boostForm.category,
      caption: boostForm.caption, status: "pending", submittedAt: new Date().toISOString(), boostPackage: pkg.id,
    };
    await persistOrders([order, ...orders]);
    await persistReels([reel, ...reels]);
    setSubmittingBoost(false);
    setShowBoost(false);
    setBoostForm({ reelUrl: "", category: BOOST_CATEGORIES[0], caption: "", packageId: "starter" });
    notify("Boost order placed — your Reel is pending review to join the queue.");
  };

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} color={C.textFaint} style={{ position: "absolute", left: 14, top: 14 }} />
        <input style={{ ...inputStyle, paddingLeft: 38 }} placeholder="Search for a task or Reel…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 6, paddingBottom: 4, alignItems: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
          <SlidersHorizontal size={14} />
        </div>
        {["All", "Tasks", "Reel queue"].map((f) => <Chip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 2px 14px" }}>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint }}>{items.length} of {activeTasks.length + approvedReels.length} campaigns</span>
        <Button small onClick={() => setShowBoost((v) => !v)}>Buy likes & comments</Button>
      </div>

      {showBoost && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Buy engagement for your Reel</div>
          <Field label="Your Reel URL"><input style={inputStyle} value={boostForm.reelUrl} onChange={(e) => setBoostForm({ ...boostForm, reelUrl: e.target.value })} placeholder="https://instagram.com/reel/…" /></Field>
          <Field label="Category">
            <select style={inputStyle} value={boostForm.category} onChange={(e) => setBoostForm({ ...boostForm, category: e.target.value })}>
              {BOOST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Caption / notes (optional)"><input style={inputStyle} value={boostForm.caption} onChange={(e) => setBoostForm({ ...boostForm, caption: e.target.value })} /></Field>
          <Field label="Package">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {BOOST_PACKAGES.map((p) => (
                <label key={p.id} onClick={() => setBoostForm({ ...boostForm, packageId: p.id })} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                  border: `1px solid ${boostForm.packageId === p.id ? C.accent : C.border}`, borderRadius: 12,
                  padding: "10px 14px", background: boostForm.packageId === p.id ? C.accentSoft : C.surfaceAlt,
                }}>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700, color: boostForm.packageId === p.id ? C.accent : C.text }}>{p.label}</div>
                    <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{p.likes} likes · {p.comments} comments · ~{p.views} views</div>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 800 }}>₹{p.price}</div>
                </label>
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <Button small onClick={submitBoost} disabled={submittingBoost}>{submittingBoost ? "Placing…" : `Buy — ₹${pkg.price}`}</Button>
            <Button small variant="ghost" onClick={() => setShowBoost(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {items.length === 0 && <EmptyNote text="Nothing matches right now." />}

      {items.map((it) => {
        const mySub = it.kind === "task" ? taskSubs.find((s) => s.taskId === it.id && s.username === session.username) : null;
        const filledCount = it.kind === "task" ? taskSubs.filter((s) => s.taskId === it.id && s.status !== "rejected").length : Math.floor(Math.random() * 10) + 5;
        const pct = Math.min(100, Math.round((filledCount / it.capacity) * 100));
        return (
          <Card key={it.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: it.kind === "task" ? C.accentSoft : C.greenSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {it.kind === "task" ? <Play size={16} color={C.accent} /> : <Heart size={16} color={C.green} />}
                  <span style={{ fontFamily: sans, fontSize: 8, fontWeight: 800, color: it.kind === "task" ? C.accent : C.green, marginTop: 2, letterSpacing: "-0.01em" }}>{it.kind === "task" ? "TASK" : "REEL"}</span>
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700 }}>{it.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {(it.sub || []).map((s) => (
                      <span key={s} style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, background: C.surfaceAlt, borderRadius: 6, padding: "2px 6px" }}>{s}</span>
                    ))}
                  </div>
                </div>
              </div>
              {mySub && <Badge status={mySub.status} />}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
              <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.text }}>{pct}% <span style={{ color: C.textFaint, fontWeight: 500 }}>/ {it.capacity} spots</span></span>
              {it.deadline && <span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>Due {fmtDateShort(it.deadline)}</span>}
            </div>
            <ProgressBar pct={pct} color={pct > 80 ? C.amber : C.green} />

            {it.kind === "task" && !mySub && (
              open === it.id ? (
                <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <Field label="Screenshot proof">
                    <label style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
                      border: `1px dashed ${C.border}`, borderRadius: 12, padding: "18px 12px", background: C.surfaceAlt,
                    }}>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
                      <span style={{ fontFamily: sans, fontSize: 12.5, color: C.textMuted }}>{uploading ? "Reading image…" : proofFile ? proofFile.name : "Tap to attach a screenshot"}</span>
                    </label>
                    {proofFile && <img src={proofFile.data} alt="proof" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, marginTop: 10 }} />}
                  </Field>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button small onClick={() => submit(it.data)} disabled={uploading}>Submit proof</Button>
                    <Button small variant="ghost" onClick={() => { setOpen(null); setProofFile(null); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}><Button small onClick={() => setOpen(it.id)}>Submit proof</Button></div>
              )
            )}
            {it.kind === "reel" && (
              <div style={{ marginTop: 14, fontFamily: sans, fontSize: 12.5, color: C.textFaint }}>In the promotion queue — support it during your daily tasks.</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------- ACTIVITY ----------
function ActivityTab({ session, tasks, taskSubs, reels, payments }) {
  const [subTab, setSubTab] = useState("tasks");
  const [filter, setFilter] = useState("All");

  const mySubs = taskSubs.filter((s) => s.username === session.username);
  const myReels = reels.filter((r) => r.username === session.username);
  const list = subTab === "tasks" ? mySubs : myReels;
  const filtered = list.filter((x) => filter === "All" || x.status === filter.toLowerCase());

  return (
    <div>
      <div style={{ display: "flex", gap: 22, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        {[["tasks", "My Tasks", mySubs.length], ["reels", "My Reels", myReels.length]].map(([k, l, n]) => (
          <div key={k} onClick={() => setSubTab(k)} style={{ paddingBottom: 10, cursor: "pointer", borderBottom: subTab === k ? `2px solid #fff` : "2px solid transparent", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: subTab === k ? "#fff" : C.textFaint }}>{l}</span>
            <span style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, background: C.surfaceAlt, borderRadius: 999, padding: "1px 7px" }}>{n}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
        {["All", "Pending", "Approved", "Rejected"].map((f) => <Chip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>

      {filtered.length === 0 && <EmptyNote text="Nothing here yet." />}

      {filtered.map((x) => {
        const isTask = subTab === "tasks";
        const task = isTask ? tasks.find((t) => t.id === x.taskId) : null;
        const pay = payments.find((p) => p.username === session.username && p.status === "paid");
        return (
          <Card key={x.id} style={{ marginBottom: 12, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isTask ? <Play size={16} color={C.textMuted} /> : <MessageCircle size={16} color={C.textMuted} />}
              </div>
            </div>
            <div style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, marginBottom: 8 }}>{isTask ? (task?.title || "Task") : `${x.category} Reel`}</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><Badge status={x.status} /></div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>Submitted {fmtDateShort(x.submittedAt)}</div>
            {x.status === "rejected" && x.rejectionReason && (
              <div style={{ fontFamily: sans, fontSize: 12, color: C.red, marginTop: 8 }}>{x.rejectionReason}</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---------- BALANCE ----------
function BalanceTab({ session, setSession, payments, users, persistUsers, notify }) {
  const myPayments = payments.filter((p) => p.username === session.username);
  const paid = myPayments.filter((p) => p.status === "paid");
  const pending = myPayments.filter((p) => p.status === "pending");
  const balance = paid.reduce((a, p) => a + Number(p.amount), 0);
  const lifetime = myPayments.reduce((a, p) => a + Number(p.amount), 0);

  const currentUser = users.find((u) => u.username === session.username);
  const savedMethod = session.payoutMethod || currentUser?.payoutMethod || null;
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutForm, setPayoutForm] = useState(savedMethod || { type: "upi", upiId: "", accountName: "", accountNumber: "", ifsc: "" });

  const savePayout = async () => {
    if (payoutForm.type === "upi" && !payoutForm.upiId) return notify("Add your UPI ID.");
    if (payoutForm.type === "bank" && (!payoutForm.accountName || !payoutForm.accountNumber || !payoutForm.ifsc)) return notify("Fill in all bank details.");
    const updatedUsers = users.map((u) => u.username === session.username ? { ...u, payoutMethod: payoutForm } : u);
    await persistUsers(updatedUsers);
    setSession({ ...session, payoutMethod: payoutForm });
    setEditingPayout(false);
    notify("Payout method saved.");
  };

  return (
    <div>
      <Card style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: sans, fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em" }}>₹{balance}</div>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, marginTop: 4 }}>Minimum withdrawal is ₹100</div>
        <div style={{ marginTop: 16 }}>
          <Button full disabled={balance < 100} onClick={() => notify(savedMethod ? "Withdrawal requested — the owner will process it." : "Add a payout method first.")}>Withdraw</Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Wallet size={18} color={C.textMuted} />
            <div>
              <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>Payout method</div>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.textFaint, marginTop: 2 }}>
                {savedMethod ? (savedMethod.type === "upi" ? `UPI · ${savedMethod.upiId}` : `Bank · ${savedMethod.accountName} (…${String(savedMethod.accountNumber).slice(-4)})`) : "Not set up yet"}
              </div>
            </div>
          </div>
          <Button small variant="ghost" onClick={() => { setPayoutForm(savedMethod || { type: "upi", upiId: "", accountName: "", accountNumber: "", ifsc: "" }); setEditingPayout((v) => !v); }}>{savedMethod ? "Edit" : "Add"}</Button>
        </div>

        {editingPayout && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Chip label="UPI" active={payoutForm.type === "upi"} onClick={() => setPayoutForm({ ...payoutForm, type: "upi" })} />
              <Chip label="Bank transfer" active={payoutForm.type === "bank"} onClick={() => setPayoutForm({ ...payoutForm, type: "bank" })} />
            </div>
            {payoutForm.type === "upi" ? (
              <Field label="UPI ID"><input style={inputStyle} value={payoutForm.upiId} onChange={(e) => setPayoutForm({ ...payoutForm, upiId: e.target.value })} placeholder="yourname@bank" /></Field>
            ) : (
              <>
                <Field label="Account holder name"><input style={inputStyle} value={payoutForm.accountName} onChange={(e) => setPayoutForm({ ...payoutForm, accountName: e.target.value })} /></Field>
                <Field label="Account number"><input style={inputStyle} value={payoutForm.accountNumber} onChange={(e) => setPayoutForm({ ...payoutForm, accountNumber: e.target.value })} /></Field>
                <Field label="IFSC code"><input style={inputStyle} value={payoutForm.ifsc} onChange={(e) => setPayoutForm({ ...payoutForm, ifsc: e.target.value })} /></Field>
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Button small onClick={savePayout}>Save</Button>
              <Button small variant="ghost" onClick={() => setEditingPayout(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, fontWeight: 600 }}>Lifetime earnings</span>
        <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 800 }}>₹{lifetime}</span>
      </Card>

      <Card style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20 }}>
        <Gift size={18} color={C.accent} />
        <div>
          <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>Earn rewards</div>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, marginTop: 3 }}>Complete daily tasks to stay eligible for weekly reward drops.</div>
        </div>
      </Card>

      <SectionHeader title="Transactions" />
      {pending.length > 0 && (
        <Card style={{ marginBottom: 10, background: C.surfaceAlt }}>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textMuted, lineHeight: 1.5 }}>
            Rewarded submissions must stay public for 30 days after payout. Removing or editing them may affect eligibility.
          </div>
        </Card>
      )}
      {myPayments.length === 0 && <EmptyNote text="No transactions yet." />}
      {myPayments.length > 0 && (
        <Card style={{ padding: 0 }}>
          {myPayments.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted }}>
                <DollarSign size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>{p.type.replace(/_/g, " ")}</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{fmtDate(p.createdAt)}</div>
              </div>
              <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: p.status === "paid" ? C.green : C.textFaint }}>
                {p.status === "paid" ? "+" : ""}₹{p.amount}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------- PROFILE ----------
function ProfileTab({ session, setSession, setView, isStaff, tasks, taskSubs, reels, payments, notify, finance, onLogout }) {
  const mySubs = taskSubs.filter((s) => s.username === session.username);
  const myReels = reels.filter((r) => r.username === session.username);
  const myPaidPayments = payments.filter((p) => p.username === session.username && p.status === "paid");
  const earned = myPaidPayments.reduce((a, p) => a + Number(p.amount), 0);
  const cfg = { ...DEFAULT_REWARD_CONFIG, ...((finance && finance.rewardConfig) || {}) };
  const a = computeMemberAnalytics(session.username, taskSubs, reels, payments, cfg);

  // ---- reward history (this member's own weekly/monthly/campaign reward records only) ----
  const myRewardPayments = payments.filter((p) => p.username === session.username && (p.type === "weekly_completion" || p.type === "monthly_completion" || p.campaignId))
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
  const totalRewardsEarned = payments.filter((p) => p.username === session.username && p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRewardsPaidOut = totalRewardsEarned; // alias — same figure, from the member's own perspective
  const currentWeekKey = dayKey(daysAgo(6));
  const currentMonthKey = monthKey(todayStr());
  const myWeeklyThisCycle = payments.find((p) => p.username === session.username && p.type === "weekly_completion" && new Date(p.createdAt) >= daysAgo(6));
  const myMonthlyThisCycle = payments.find((p) => p.username === session.username && p.type === "monthly_completion" && monthKey(p.createdAt) === currentMonthKey);
  const myPendingReview = mySubs.some((s) => s.status === "pending" && dayKey(s.submittedAt) >= currentWeekKey);
  const weeklyStatus = rewardStatus({ eligible: a.weeklyEligible, hasPendingReview: myPendingReview, selectedPayment: myWeeklyThisCycle });
  const monthlyStatus = rewardStatus({ eligible: a.monthlyEligible, hasPendingReview: myPendingReview, selectedPayment: myMonthlyThisCycle });

  return (
    <div>
      <Card style={{ textAlign: "center", marginBottom: 16, position: "relative" }}>
        <div onClick={() => notify("Edit profile goes here.")} style={{ position: "absolute", top: 16, right: 16, cursor: "pointer", color: C.textMuted }}>
          <Pencil size={16} />
        </div>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: C.surfaceAlt, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <span style={{ fontFamily: sans, fontSize: 26, fontWeight: 800, color: C.textMuted }}>{session.username[0]?.toUpperCase()}</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 800 }}>@{session.username}</div>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, marginTop: 4 }}>Member since {session.joinedAt ? fmtDate(session.joinedAt) : "recently"}</div>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800 }}>₹{earned}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Earned</div>
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800 }}>{mySubs.length}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Tasks done</div>
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800 }}>{myReels.length}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Reels submitted</div>
          </div>
        </div>
      </Card>

      <SectionHeader title="Rewards" />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>Weekly reward · Earn ₹{cfg.weeklyAmountPerWinner}</span>
          <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: rewardStatusColor(weeklyStatus), background: weeklyStatus === "Not Eligible" ? C.surfaceAlt : `${rewardStatusColor(weeklyStatus)}22`, borderRadius: 999, padding: "4px 10px" }}>
            {weeklyStatus}
          </span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginBottom: 10 }}>Top {cfg.weeklyWinnersCount} eligible members are selected each week — reaching {cfg.weeklyThresholdPct}% makes you eligible, not automatically paid.</div>
        <ProgressBar pct={a.weeklyPct} color={a.weeklyEligible ? C.green : C.amber} />
        <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>
          {a.weeklyCompletedDays}/7 required tasks completed this week · {a.approvedCount} approved · {a.pendingCount} pending · {a.rejectedCount} rejected
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: sans, fontSize: 11, color: C.textFaint }}>
          <span>Next reward date: {fmtDateShort(daysAgo(-7))}</span>
          <span>{myWeeklyThisCycle ? (myWeeklyThisCycle.status === "paid" ? "Paid" : "Unpaid") : "—"}</span>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>Monthly reward · Earn ₹{cfg.monthlyAmountPerWinner}</span>
          <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: rewardStatusColor(monthlyStatus), background: monthlyStatus === "Not Eligible" ? C.surfaceAlt : `${rewardStatusColor(monthlyStatus)}22`, borderRadius: 999, padding: "4px 10px" }}>
            {monthlyStatus}
          </span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginBottom: 10 }}>{cfg.monthlyWinnersCount} eligible members are selected each month.</div>
        <ProgressBar pct={a.monthlyPct} color={a.monthlyEligible ? C.green : C.amber} />
        <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>
          {a.monthlyPct}% activity this month · {a.consecutiveMonths} consecutive active month{a.consecutiveMonths === 1 ? "" : "s"}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: sans, fontSize: 11, color: C.textFaint }}>
          <span>Current month progress: {a.currentMonthApproved}/{cfg.monthlyMinApproved} approved</span>
          <span>{myMonthlyThisCycle ? (myMonthlyThisCycle.status === "paid" ? "Paid" : "Unpaid") : "—"}</span>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800, color: C.green }}>₹{totalRewardsEarned}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Total rewards paid</div>
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800 }}>₹{a.rewardsPending}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Pending payout</div>
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800 }}>{a.reelsPromoted}</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 2 }}>Reels promoted</div>
          </div>
        </div>
      </Card>

      <SectionHeader title="Reward history" />
      <Card style={{ padding: 0, marginBottom: 14 }}>
        {myRewardPayments.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No reward records yet — stay active to become eligible." /></div>}
        {myRewardPayments.map((p, i) => (
          <div key={p.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700 }}>{p.type === "monthly_completion" ? "Monthly reward" : p.type === "weekly_completion" ? "Weekly reward" : "Reward"}</span>
              <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 800, color: p.status === "paid" ? C.green : C.textFaint }}>₹{p.amount}</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 3 }}>
              {fmtDate(p.createdAt)}{p.weekOf ? ` · Week of ${fmtDateShort(p.weekOf)}` : ""}{p.monthOf ? ` · ${monthLabel(p.monthOf)}` : ""}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <Badge status={p.status === "paid" ? "completed" : "pending"} />
              {p.status === "paid" && p.paymentReference && <span style={{ fontFamily: sans, fontSize: 10.5, color: C.textFaint }}>Ref: {p.paymentReference}</span>}
            </div>
          </div>
        ))}
      </Card>

      <div onClick={() => notify("Instagram connection flow goes here.")} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 999, padding: "15px 18px", marginBottom: 14, cursor: "pointer" }}>
        <Link2 size={18} color="#0A0A0B" />
        <span style={{ flex: 1, fontFamily: sans, fontSize: 15, fontWeight: 700, color: "#0A0A0B" }}>Connected accounts</span>
        <ChevronRight size={17} color="#0A0A0B" />
      </div>

      <Card style={{ padding: 0, marginBottom: 14 }}>
        <ListRow icon={<UserPlus size={18} />} label="Referrals" value="Earn 10%" onClick={() => notify("Referral program details go here.")} />
      </Card>

      <Card style={{ padding: 0, marginBottom: 14 }}>
        <ListRow icon={<Globe size={18} />} label="Language" value="English" onClick={() => {}} />
        <RowDivider />
        <ListRow icon={<Moon size={18} />} label="Theme" value="Dark" onClick={() => {}} />
        <RowDivider />
        <ListRow icon={<Bell size={18} />} label="Notifications" onClick={() => {}} />
      </Card>

      {isStaff && (
        <Card style={{ padding: 0, marginBottom: 14 }}>
          <ListRow icon={<ShieldCheck size={18} />} label="Admin console" onClick={() => setView("admin")} />
        </Card>
      )}

      <Card style={{ padding: 0, marginBottom: 14 }}>
        <ListRow icon={<HelpCircle size={18} />} label="FAQ" onClick={() => {}} />
        <RowDivider />
        <ListRow icon={<BookOpen size={18} />} label="Resources" onClick={() => {}} />
      </Card>

      <Card style={{ padding: 0 }}>
        <ListRow icon={<LogOut size={18} />} label="Sign out" danger onClick={() => { onLogout && onLogout(session.username); setSession(null); setView("landing"); }} />
      </Card>
    </div>
  );
}

// ---------- ADMIN (desktop-style console, same dark tokens) ----------
function AdminTopNav({ setView, setSession, session, onLogout }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.surface, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
      <div onClick={() => setView("landing")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>R</div>
        <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700 }}>ReelHub</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setView("member")} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontFamily: sans, fontSize: 13, cursor: "pointer", color: C.text, fontWeight: 600 }}>Member view</button>
        <button onClick={() => { onLogout && onLogout(session?.username); setSession(null); setView("landing"); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontFamily: sans, fontSize: 13, cursor: "pointer", color: C.text, fontWeight: 600 }}>Sign out</button>
      </div>
    </div>
  );
}

function AdminShell({ session, setView, setSession, children, onLogout }) {
  return (
    <div>
      <AdminTopNav setView={setView} setSession={setSession} session={session} onLogout={onLogout} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 60px" }}>{children}</div>
    </div>
  );
}

// ---------- REWARDS MANAGER (weekly + monthly, shared implementation) ----------
function PaymentProofRow({ payment, isOwner, notify, onMarkPaid }) {
  const [reference, setReference] = useState(payment.paymentReference || "");
  const [proof, setProof] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) return notify("That file is too large — please use one under 4.5MB.");
    setUploading(true);
    try { setProof({ name: file.name, data: await fileToBase64(file) }); }
    catch { notify("Couldn't read that file — try again."); }
    setUploading(false);
  };

  if (payment.status === "paid") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge status="completed" />
        {payment.paymentReference && <span style={{ fontFamily: sans, fontSize: 11, color: C.textFaint }}>Ref: {payment.paymentReference}</span>}
        {payment.proofData && <span style={{ fontFamily: sans, fontSize: 11, color: C.textFaint }}>· Proof on file</span>}
      </div>
    );
  }
  if (!isOwner) return <Badge status="pending" />;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
      <input style={{ ...inputStyle, padding: "6px 9px", fontSize: 11.5, width: 110 }} placeholder="Payment ref" value={reference} onChange={(e) => setReference(e.target.value)} />
      <label style={{ fontFamily: sans, fontSize: 11, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", cursor: "pointer" }}>
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        {uploading ? "Reading…" : proof ? "Proof attached" : "Attach proof"}
      </label>
      <Button small onClick={() => onMarkPaid(payment.id, reference, proof)}>Mark paid</Button>
    </div>
  );
}

function RewardCyclePanel({ cycle, finance, persistFinance, members, taskSubs, reels, payments, persistPayments, isOwner, session, notify, logActivity, announcements, persistAnnouncements }) {
  const cfg = { ...DEFAULT_REWARD_CONFIG, ...(finance.rewardConfig || {}) };
  const winnersKey = cycle === "weekly" ? "weeklyWinnersCount" : "monthlyWinnersCount";
  const amountKey = cycle === "weekly" ? "weeklyAmountPerWinner" : "monthlyAmountPerWinner";
  const thresholdKey = cycle === "weekly" ? "weeklyThresholdPct" : "monthlyThresholdPct";
  const paymentType = cycle === "weekly" ? "weekly_completion" : "monthly_completion";
  const budget = Number(cfg[winnersKey] || 0) * Number(cfg[amountKey] || 0);

  const updateCfg = async (field, value) => { await persistFinance({ ...finance, rewardConfig: { ...cfg, [field]: value } }); };

  const isThisCycle = (p) => cycle === "weekly" ? new Date(p.createdAt) >= daysAgo(6) : monthKey(p.createdAt) === monthKey(todayStr());
  const cycleKeyVal = cycle === "weekly" ? dayKey(daysAgo(6)) : monthKey(todayStr());

  const ranked = members
    .map((m) => ({ ...m, a: computeMemberAnalytics(m.username, taskSubs, reels, payments, cfg) }))
    .sort((x, y) => (cycle === "weekly" ? y.a.weeklyPct - x.a.weeklyPct : y.a.monthlyPct - x.a.monthlyPct));
  const qualifying = ranked.filter((m) => (cycle === "weekly" ? m.a.weeklyEligible : m.a.monthlyEligible));
  const eligibleWinners = qualifying.slice(0, Number(cfg[winnersKey] || 0));
  const alreadyIssued = (username) => payments.some((p) => p.username === username && p.type === paymentType && isThisCycle(p));

  const selectWinners = async () => {
    const toSelect = eligibleWinners.filter((m) => !alreadyIssued(m.username));
    if (toSelect.length === 0) return notify(`No new eligible members to select for this ${cycle} cycle.`);
    const newPayments = toSelect.map((m) => ({
      id: uid(), username: m.username, amount: cfg[amountKey], type: paymentType, status: "pending", createdAt: new Date().toISOString(),
      ...(cycle === "weekly" ? { weekOf: cycleKeyVal } : { monthOf: cycleKeyVal }),
    }));
    await persistPayments([...newPayments, ...payments]);
    await logActivity(session.username, `Selected ${cycle} reward winners`, `${newPayments.length} winner(s) @ ₹${cfg[amountKey]} = ₹${newPayments.length * Number(cfg[amountKey])}`);
    notify(`Selected ${newPayments.length} winner(s) for this ${cycle} cycle.`);
  };

  const markPaid = async (paymentId, reference, proof) => {
    const p0 = payments.find((p) => p.id === paymentId);
    await persistPayments(payments.map((p) => p.id === paymentId ? { ...p, status: "paid", paidAt: new Date().toISOString(), paymentReference: reference || "", proofData: proof ? proof.data : (p.proofData || null) } : p));
    await logActivity(session.username, `Marked ${cycle} reward paid`, `${p0?.username || ""} — ₹${p0?.amount || ""}${reference ? ` (ref: ${reference})` : ""}`);
    notify("Marked as paid.");
  };

  const cycleWinners = payments.filter((p) => p.type === paymentType && isThisCycle(p));
  const publishAnnouncement = async () => {
    if (cycleWinners.length === 0) return notify(`No ${cycle} winners selected yet.`);
    const title = `🎉 ${cycle === "weekly" ? "Weekly" : "Monthly"} CreatorHub Winners`;
    const body = `Congratulations to:\n${cycleWinners.map((w) => `@${w.username}`).join("\n")}\n\n₹${cfg[amountKey]} reward paid to each winner.`;
    await persistAnnouncements([{ id: uid(), title, body, category: "rewards", postedBy: session.username, createdAt: new Date().toISOString() }, ...announcements]);
    await logActivity(session.username, `Published ${cycle} winner announcement`, `${cycleWinners.length} winner(s)`);
    notify("Winner announcement published to Community.");
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionHeader title={`${cycle === "weekly" ? "Weekly" : "Monthly"} reward manager`} />
      <Card style={{ marginBottom: 14 }}>
        {isOwner ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <Field label={`Winners per ${cycle === "weekly" ? "week" : "month"}`}><input style={inputStyle} type="number" value={cfg[winnersKey]} onChange={(e) => updateCfg(winnersKey, e.target.value)} /></Field>
            <Field label="Amount per winner (₹)"><input style={inputStyle} type="number" value={cfg[amountKey]} onChange={(e) => updateCfg(amountKey, e.target.value)} /></Field>
            <Field label="Eligibility threshold (%)"><input style={inputStyle} type="number" value={cfg[thresholdKey]} onChange={(e) => updateCfg(thresholdKey, e.target.value)} /></Field>
          </div>
        ) : (
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textMuted, marginBottom: 14 }}>{cfg[winnersKey]} winners · ₹{cfg[amountKey]} each · {cfg[thresholdKey]}% required to be eligible</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, fontWeight: 600 }}>{cycle === "weekly" ? "Weekly" : "Monthly"} reward budget</span>
          <span style={{ fontFamily: sans, fontSize: 20, fontWeight: 800 }}>₹{budget.toLocaleString()}</span>
        </div>
      </Card>

      <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, marginBottom: 10 }}>
        {qualifying.length} member(s) reached {cfg[thresholdKey]}% completion this {cycle === "weekly" ? "week" : "month"} · top {cfg[winnersKey]} qualify for this cycle. 100% completion makes a member eligible — it does not automatically guarantee the reward.
      </div>

      <Card style={{ padding: 0, marginBottom: 14 }}>
        {ranked.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No members yet." /></div>}
        {ranked.slice(0, 25).map((m, i) => {
          const qualifies = cycle === "weekly" ? m.a.weeklyEligible : m.a.monthlyEligible;
          const willWin = eligibleWinners.some((w) => w.username === m.username);
          const payment = payments.find((p) => p.username === m.username && p.type === paymentType && isThisCycle(p));
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>{m.username}</span>
                <span style={{ fontFamily: sans, fontSize: 12, color: C.textFaint, marginLeft: 8 }}>{cycle === "weekly" ? m.a.weeklyPct : m.a.monthlyPct}% this {cycle === "weekly" ? "week" : "month"}{cycle === "monthly" ? ` · ${m.a.consecutiveMonths} mo streak` : ""}</span>
              </div>
              {payment ? (
                <PaymentProofRow payment={payment} isOwner={isOwner} notify={notify} onMarkPaid={markPaid} />
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!qualifies && <span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>Not qualified</span>}
                  {qualifies && willWin && <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: C.accent }}>Qualifies</span>}
                  {qualifies && !willWin && <span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>Eligible — outside top {cfg[winnersKey]}</span>}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {isOwner && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button small onClick={selectWinners}>Select this {cycle === "weekly" ? "week's" : "month's"} winners ({eligibleWinners.filter((m) => !alreadyIssued(m.username)).length} pending)</Button>
          <Button small variant="ghost" onClick={publishAnnouncement}>Publish winner announcement</Button>
        </div>
      )}
    </div>
  );
}

function RewardsAnalytics({ members, taskSubs, reels, payments, finance }) {
  const [range, setRange] = useState("30");
  const cfg = { ...DEFAULT_REWARD_CONFIG, ...(finance.rewardConfig || {}) };
  const ranges = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["year", "This year"], ["all", "All time"]];
  const rangeStart = range === "all" ? null : range === "year" ? new Date(new Date().getFullYear(), 0, 1) : daysAgo(Number(range) - 1);
  const inRange = (d) => !d ? false : (!rangeStart || new Date(d) >= rangeStart);

  const analytics = members.map((m) => computeMemberAnalytics(m.username, taskSubs, reels, payments, cfg));
  const totalEligible = analytics.filter((a) => a.weeklyEligible || a.monthlyEligible).length;
  const weeklyWinners = payments.filter((p) => p.type === "weekly_completion" && inRange(p.createdAt));
  const monthlyWinners = payments.filter((p) => p.type === "monthly_completion" && inRange(p.createdAt));
  const paidInRange = payments.filter((p) => p.status === "paid" && inRange(p.paidAt || p.createdAt));
  const pendingInRange = payments.filter((p) => p.status === "pending" && inRange(p.createdAt));
  const totalPaid = paidInRange.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPending = pendingInRange.reduce((s, p) => s + Number(p.amount || 0), 0);
  const avgCompletion = analytics.length ? Math.round(analytics.reduce((s, a) => s + a.weeklyPct, 0) / analytics.length) : 0;
  const avgActivity = analytics.length ? Math.round((analytics.reduce((s, a) => s + a.activeDays, 0) / analytics.length) * 10) / 10 : 0;
  const weeklyExpense = paidInRange.filter((p) => p.type === "weekly_completion").reduce((s, p) => s + Number(p.amount || 0), 0);
  const monthlyExpense = paidInRange.filter((p) => p.type === "monthly_completion").reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionHeader title="Reward analytics" />
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
        {ranges.map(([k, l]) => <Chip key={k} label={l} active={range === k} onClick={() => setRange(k)} />)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatCard label="Eligible members" value={totalEligible} />
        <StatCard label="Weekly winners" value={weeklyWinners.length} />
        <StatCard label="Monthly winners" value={monthlyWinners.length} />
        <StatCard label="Total rewards paid" value={`₹${totalPaid.toLocaleString()}`} />
        <StatCard label="Pending rewards" value={`₹${totalPending.toLocaleString()}`} />
        <StatCard label="Avg. completion" value={`${avgCompletion}%`} />
        <StatCard label="Avg. activity" value={`${avgActivity}d`} />
        <StatCard label="Weekly reward expense" value={`₹${weeklyExpense.toLocaleString()}`} />
        <StatCard label="Monthly reward expense" value={`₹${monthlyExpense.toLocaleString()}`} />
      </div>
    </div>
  );
}

function Admin({ session, users, persistUsers, tasks, persistTasks, taskSubs, persistTaskSubs, reels, persistReels, orders, persistOrders, announcements, persistAnnouncements, campaigns, persistCampaigns, payments, persistPayments, setPayments, finance, persistFinance, notify, activityLog, logActivity, sessionLog }) {

  const [tab, setTab] = useState("review");
  const [selectedMember, setSelectedMember] = useState(null);
  const isOwner = session.role === "owner";
  const members = users.filter((u) => u.role === "member");
  const pendingTasks = taskSubs.filter((s) => s.status === "pending");
  const pendingReels = reels.filter((r) => r.status === "pending");

  const decideTask = async (id, status) => {
    let reason = "";
    if (status === "rejected") reason = prompt("Rejection reason?") || "Not specified";
    const s0 = taskSubs.find((s) => s.id === id);
    await persistTaskSubs(taskSubs.map((s) => s.id === id ? { ...s, status, reviewedBy: session.username, reviewedAt: new Date().toISOString(), rejectionReason: reason } : s));
    await logActivity(session.username, `${status === "approved" ? "Approved" : "Rejected"} task submission`, `${s0?.username || "unknown"}${reason ? ` — ${reason}` : ""}`);
    notify(`Submission ${status}.`);
  };
  const decideReel = async (id, status) => {
    let reason = "";
    if (status === "rejected") reason = prompt("Rejection reason?") || "Not specified";
    const r0 = reels.find((r) => r.id === id);
    await persistReels(reels.map((r) => r.id === id ? { ...r, status, reviewedBy: session.username, reviewedAt: new Date().toISOString(), rejectionReason: reason } : r));
    await logActivity(session.username, `${status === "approved" ? "Approved" : "Rejected"} reel submission`, `${r0?.username || "unknown"}${reason ? ` — ${reason}` : ""}`);
    notify(`Reel ${status}.`);
  };
  const decideOrder = async (id, status) => {
    const o0 = orders.find((o) => o.id === id);
    await persistOrders(orders.map((o) => o.id === id ? { ...o, status, handledBy: session.username } : o));
    await logActivity(session.username, `Order ${status}`, o0?.name || "");
    notify(`Order marked ${status}.`);
  };
  const toggleSuspend = async (u) => {
    const willBe = u.status === "active" ? "suspended" : "active";
    await persistUsers(users.map((x) => x.id === u.id ? { ...x, status: willBe } : x));
    await logActivity(session.username, willBe === "suspended" ? "Suspended member" : "Restored member", u.username);
    notify(`${u.username} ${u.status === "active" ? "suspended" : "restored"}.`);
  };

  const [annForm, setAnnForm] = useState({ title: "", body: "", category: "general" });
  const postAnn = async () => {
    if (!annForm.title || !annForm.body) return notify("Add a title and message.");
    await persistAnnouncements([{ id: uid(), ...annForm, postedBy: session.username, createdAt: new Date().toISOString() }, ...announcements]);
    await logActivity(session.username, "Posted announcement", annForm.title);
    setAnnForm({ title: "", body: "", category: "general" });
    notify("Announcement posted.");
  };

  const TASK_ACTIONS = ["watch", "like", "comment"];
  const [taskForm, setTaskForm] = useState({ title: "", instructions: "", reelUrl: "", deadline: "", requiredActions: [...TASK_ACTIONS], capacity: 40 });
  const postTask = async () => {
    if (!isOwner) return notify("Only the owner can create tasks.");
    if (!taskForm.title || !taskForm.instructions) return notify("Add a title and instructions.");
    const capacity = Number(taskForm.capacity) || 40;
    await persistTasks([{ id: uid(), ...taskForm, requiredActions: taskForm.requiredActions.length ? taskForm.requiredActions : ["watch"], status: "active", capacity, createdAt: new Date().toISOString() }, ...tasks]);
    await logActivity(session.username, "Created task", taskForm.title);
    setTaskForm({ title: "", instructions: "", reelUrl: "", deadline: "", requiredActions: [...TASK_ACTIONS], capacity: 40 });
    notify("Task created.");
  };
  const toggleTaskAction = (action) => {
    setTaskForm((f) => ({ ...f, requiredActions: f.requiredActions.includes(action) ? f.requiredActions.filter((a) => a !== action) : [...f.requiredActions, action] }));
  };
  const editTask = async (t) => {
    if (!isOwner) return notify("Only the owner can edit tasks.");
    const title = window.prompt("Task title:", t.title);
    if (title === null) return;
    const instructions = window.prompt("Task description / instructions:", t.instructions || "");
    if (instructions === null) return;
    const deadlineInput = window.prompt("Deadline (YYYY-MM-DD, blank to keep current):", t.deadline ? t.deadline.slice(0, 10) : "");
    const capacityInput = window.prompt("Submissions that count toward completion:", String(t.capacity || 40));
    const updated = {
      ...t,
      title: title || t.title,
      instructions: instructions || t.instructions,
      deadline: deadlineInput ? new Date(deadlineInput).toISOString() : t.deadline,
      capacity: capacityInput && !Number.isNaN(Number(capacityInput)) ? Number(capacityInput) : t.capacity,
    };
    await persistTasks(tasks.map((x) => (x.id === t.id ? updated : x)));
    await logActivity(session.username, "Edited task", updated.title);
    notify("Task updated.");
  };
  const toggleTaskStatus = async (t) => {
    if (!isOwner) return notify("Only the owner can deactivate or reactivate tasks.");
    const willBe = t.status === "active" ? "inactive" : "active";
    await persistTasks(tasks.map((x) => (x.id === t.id ? { ...x, status: willBe } : x)));
    await logActivity(session.username, willBe === "inactive" ? "Deactivated task" : "Reactivated task", t.title);
    notify(`Task ${willBe === "inactive" ? "deactivated" : "reactivated"}.`);
  };
  const deleteTask = async (t) => {
    if (!isOwner) return notify("Only the owner can delete tasks.");
    if (!window.confirm(`Delete task "${t.title}"? This cannot be undone.`)) return;
    await persistTasks(tasks.filter((x) => x.id !== t.id));
    await logActivity(session.username, "Deleted task", t.title);
    notify("Task deleted.");
  };

  const [campForm, setCampForm] = useState({ name: "", amount: "100", type: "weekly_completion" });
  const [selectedWinners, setSelectedWinners] = useState([]);
  const createCampaign = async () => {
    if (!campForm.name || selectedWinners.length === 0) return notify("Name the campaign and select at least one winner.");
    const camp = { id: uid(), name: campForm.name, type: campForm.type, amount: campForm.amount, createdAt: new Date().toISOString(), createdBy: session.username };
    await persistCampaigns([camp, ...campaigns]);
    const newPayments = selectedWinners.map((username) => ({ id: uid(), campaignId: camp.id, username, amount: campForm.amount, type: campForm.type, status: "pending", createdAt: new Date().toISOString() }));
    await persistPayments([...newPayments, ...payments]);
    await logActivity(session.username, "Created reward campaign", `${campForm.name} — ${newPayments.length} winner(s) @ ₹${campForm.amount}`);
    setSelectedWinners([]); setCampForm({ name: "", amount: "100", type: "weekly_completion" });
    notify(`Campaign created with ${newPayments.length} winner(s).`);
  };
  const markPaid = async (id) => {
    if (!isOwner) return notify("Only the owner can mark payments as paid.");
    const ref = prompt("Payment reference (e.g. UPI txn ID)?") || "";
    try {
      const result = await apiCall("markPaymentPaid", { paymentId: id, reference: ref });
      setPayments(result.payments); // server is the source of truth for the payment ledger
      notify("Marked as paid.");
    } catch (e) {
      notify(e.message || "Could not mark as paid.");
    }
  };

  const MIN_PAYOUT = 100;
  const [sendForm, setSendForm] = useState({ username: "", amount: "", method: "UPI", reference: "", note: "" });
  const sendMoney = async (statusToSet) => {
    if (!isOwner) return notify("Only the owner can send or record payments.");
    if (!sendForm.username) return notify("Select a member first.");
    const amt = Number(sendForm.amount);
    if (!amt || amt < MIN_PAYOUT) return notify(`Minimum payout is ₹${MIN_PAYOUT}.`);
    try {
      const result = await apiCall("sendMoney", {
        username: sendForm.username, amount: amt, method: sendForm.method,
        reference: sendForm.reference, note: sendForm.note, status: statusToSet,
      });
      setPayments(result.payments); // server is the source of truth for the payment ledger
      setSendForm({ username: "", amount: "", method: "UPI", reference: "", note: "" });
      notify(statusToSet === "paid" ? "Payment recorded as paid." : "Payment recorded as pending.");
    } catch (e) {
      notify(e.message || "Could not record payment.");
    }
  };

  const tabs = [["review", "Review queue"], ["reels", "Reel promotions"], ["orders", "Orders"], ["tasks", "Tasks"], ["rewards", "Rewards"], ...(isOwner ? [["sendmoney", "Send Money"]] : []), ["users", "Users"], ["announce", "Announcements"], ...(isOwner ? [["finance", "Finance"]] : []), ["activity", "Activity log"]];

  return (
    <div>
      <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Admin console</div>
      <div style={{ fontFamily: sans, fontSize: 13, color: C.textMuted, marginBottom: 22 }}>Signed in as {session.username} · {session.role}</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Members" value={members.length} />
        <StatCard label="Pending tasks" value={pendingTasks.length} />
        <StatCard label="Pending Reels" value={pendingReels.length} />
        <StatCard label="New orders" value={orders.filter((o) => o.status === "new").length} />
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 22, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            background: "none", border: "none", borderBottom: tab === k ? `2px solid ${C.accent}` : "2px solid transparent",
            color: tab === k ? C.accent : C.textMuted, padding: "10px 6px", marginRight: 16, fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>{k === "finance" && <PiggyBank size={14} />}{l}</button>
        ))}
      </div>
      {tab === "review" && (
        <div>
          <SectionHeader title="Task submission review" />
          {pendingTasks.length === 0 && <EmptyNote text="Nothing pending review." />}
          {pendingTasks.map((s) => {
            const task = tasks.find((t) => t.id === s.taskId);
            return (
              <Card key={s.id} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: sans, fontSize: 13.5 }}><b>{s.username}</b> · {task?.title}</div>
                {s.screenshotData ? (
                  <img src={s.screenshotData} alt="proof" style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 10, margin: "8px 0 12px" }} />
                ) : (
                  <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, margin: "5px 0 12px" }}>Proof: {s.screenshotUrl}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button small variant="success" onClick={() => decideTask(s.id, "approved")}>Approve</Button>
                  <Button small variant="danger" onClick={() => decideTask(s.id, "rejected")}>Reject</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "reels" && (
        <div>
          <SectionHeader title="Reel promotion requests" />
          {pendingReels.length === 0 && <EmptyNote text="No pending Reel submissions." />}
          {pendingReels.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 13.5 }}><b>{r.username}</b> · {r.category}</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, margin: "5px 0 8px" }}>{r.url}</div>
              <p style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, marginBottom: 12 }}>{r.caption}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button small variant="success" onClick={() => decideReel(r.id, "approved")}>Approve</Button>
                <Button small variant="danger" onClick={() => decideReel(r.id, "rejected")}>Reject</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div>
          <SectionHeader title="Public service orders" />
          {orders.length === 0 && <EmptyNote text="No orders submitted yet." />}
          {orders.map((o) => (
            <Card key={o.id} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 13.5 }}><b>{o.name}</b> · {o.service}</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: C.textFaint, margin: "5px 0 12px" }}>{o.instagram} · {o.contact}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Badge status={o.status} />
                {o.status === "new" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button small variant="success" onClick={() => decideOrder(o.id, "accepted")}>Accept</Button>
                    <Button small variant="danger" onClick={() => decideOrder(o.id, "declined")}>Decline</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "tasks" && (
        <div>
          <SectionHeader title="Create a daily task" />
          {!isOwner && <div style={{ fontFamily: sans, fontSize: 12, color: C.textFaint, marginBottom: 14 }}>Only the owner can create, edit, deactivate, or delete tasks. Existing tasks are shown below.</div>}
          {isOwner && (
            <Card style={{ marginBottom: 16 }}>
              <Field label="Title"><input style={inputStyle} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></Field>
              <Field label="Description / instructions"><input style={inputStyle} value={taskForm.instructions} onChange={(e) => setTaskForm({ ...taskForm, instructions: e.target.value })} /></Field>
              <Field label="Reel URL"><input style={inputStyle} value={taskForm.reelUrl} onChange={(e) => setTaskForm({ ...taskForm, reelUrl: e.target.value })} /></Field>
              <Field label="Deadline">
                <input type="date" style={inputStyle} value={taskForm.deadline ? taskForm.deadline.slice(0, 10) : ""} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value ? new Date(e.target.value).toISOString() : "" })} />
              </Field>
              <Field label="Requirements">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TASK_ACTIONS.map((act) => (
                    <Chip key={act} label={act} active={taskForm.requiredActions.includes(act)} onClick={() => toggleTaskAction(act)} />
                  ))}
                </div>
              </Field>
              <Field label="Submissions that count toward completion"><input style={inputStyle} value={taskForm.capacity} onChange={(e) => setTaskForm({ ...taskForm, capacity: e.target.value })} /></Field>
              <Button small onClick={postTask}>Publish task</Button>
            </Card>
          )}
          <Card style={{ padding: 0 }}>
            {tasks.map((t, i) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, fontFamily: sans, fontSize: 13.5, gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div>{t.title}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>{(t.requiredActions || []).join(", ")} · {t.capacity || 40} to complete{t.deadline ? ` · Due ${fmtDateShort(t.deadline)}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge status={t.status} />
                  {isOwner && <Button small variant="ghost" onClick={() => editTask(t)}>Edit</Button>}
                  {isOwner && <Button small variant="ghost" onClick={() => toggleTaskStatus(t)}>{t.status === "active" ? "Deactivate" : "Reactivate"}</Button>}
                  {isOwner && <Button small variant="danger" onClick={() => deleteTask(t)}>Delete</Button>}
                </div>
              </div>
            ))}
            {tasks.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No tasks yet." /></div>}
          </Card>
        </div>
      )}

      {tab === "rewards" && (
        <div>
          {finance && (
            <>
              <RewardsAnalytics members={members} taskSubs={taskSubs} reels={reels} payments={payments} finance={finance} />
              <RewardCyclePanel
                cycle="weekly" finance={finance} persistFinance={persistFinance} members={members} taskSubs={taskSubs} reels={reels}
                payments={payments} isOwner={isOwner} session={session} notify={notify} logActivity={logActivity} persistPayments={persistPayments}
                announcements={announcements} persistAnnouncements={persistAnnouncements}
              />
              <RewardCyclePanel
                cycle="monthly" finance={finance} persistFinance={persistFinance} members={members} taskSubs={taskSubs} reels={reels}
                payments={payments} isOwner={isOwner} session={session} notify={notify} logActivity={logActivity} persistPayments={persistPayments}
                announcements={announcements} persistAnnouncements={persistAnnouncements}
              />
            </>
          )}
          <SectionHeader title="Reward campaigns" />
          {!isOwner && <EmptyNote text="Only the owner can create campaigns or mark payments — records shown below." />}
          {isOwner && (
            <Card style={{ marginBottom: 16 }}>
              <Field label="Campaign name"><input style={inputStyle} value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} placeholder="Week 32 100% Completion" /></Field>
              <Field label="Amount per winner (₹)"><input style={inputStyle} value={campForm.amount} onChange={(e) => setCampForm({ ...campForm, amount: e.target.value })} /></Field>
              <Field label="Select winners">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {members.map((m) => (
                    <label key={m.id} style={{ fontFamily: sans, fontSize: 12.5, border: `1px solid ${selectedWinners.includes(m.username) ? C.accent : C.border}`, borderRadius: 8, padding: "6px 11px", cursor: "pointer", background: selectedWinners.includes(m.username) ? C.accentSoft : C.surfaceAlt, color: selectedWinners.includes(m.username) ? C.accent : C.text, fontWeight: 600 }}>
                      <input type="checkbox" style={{ marginRight: 5 }} checked={selectedWinners.includes(m.username)} onChange={(e) => setSelectedWinners(e.target.checked ? [...selectedWinners, m.username] : selectedWinners.filter((x) => x !== m.username))} />
                      {m.username}
                    </label>
                  ))}
                </div>
              </Field>
              <Button small onClick={createCampaign}>Create campaign & record rewards</Button>
            </Card>
          )}
          <Card style={{ padding: 0 }}>
            {payments.map((p, i) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, fontFamily: sans, fontSize: 13.5 }}>
                <span>{p.username} · ₹{p.amount} · {p.type.replace(/_/g, " ")}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge status={p.status === "paid" ? "completed" : "pending"} />
                  {isOwner && p.status === "pending" && <Button small onClick={() => markPaid(p.id)}>Mark paid</Button>}
                </div>
              </div>
            ))}
            {payments.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No reward records yet." /></div>}
          </Card>
        </div>
      )}

      {tab === "sendmoney" && isOwner && (
        <div>
          <SectionHeader title="Send money to a member" />
          <Card style={{ marginBottom: 16 }}>
            <Field label="Member">
              <select style={inputStyle} value={sendForm.username} onChange={(e) => setSendForm({ ...sendForm, username: e.target.value })}>
                <option value="">Select a member…</option>
                {members.map((m) => <option key={m.id} value={m.username}>{m.username}</option>)}
              </select>
            </Field>
            <Field label={`Amount (₹) — minimum ₹${MIN_PAYOUT}`}><input style={inputStyle} value={sendForm.amount} onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })} placeholder="e.g. 500" /></Field>
            <Field label="Payment method">
              <select style={inputStyle} value={sendForm.method} onChange={(e) => setSendForm({ ...sendForm, method: e.target.value })}>
                {["UPI", "Bank transfer", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference / transaction ID (optional)"><input style={inputStyle} value={sendForm.reference} onChange={(e) => setSendForm({ ...sendForm, reference: e.target.value })} /></Field>
            <Field label="Payment note (optional)"><input style={inputStyle} value={sendForm.note} onChange={(e) => setSendForm({ ...sendForm, note: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Button small variant="ghost" onClick={() => sendMoney("pending")}>Record as pending</Button>
              <Button small onClick={() => sendMoney("paid")}>Record as paid</Button>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 12, lineHeight: 1.5 }}>
              This records the payment on CreatorHub. It does not automatically transfer money unless a real payout service is connected.
            </div>
          </Card>
          <SectionHeader title="Payment history" />
          <Card style={{ padding: 0 }}>
            {payments.filter((p) => p.type === "manual_payment").length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No manual payments recorded yet." /></div>}
            {payments.filter((p) => p.type === "manual_payment").map((p, i) => (
              <div key={p.id} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>{p.username} · ₹{p.amount}</span>
                  <Badge status={p.status === "paid" ? "completed" : "pending"} />
                </div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 3 }}>
                  {p.method || "—"}{p.paymentReference ? ` · Ref: ${p.paymentReference}` : ""}{p.note ? ` · ${p.note}` : ""}
                </div>
                <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 3 }}>
                  Processed by {p.processedBy || "—"} · {new Date(p.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                {p.status === "pending" && <div style={{ marginTop: 8 }}><Button small onClick={() => markPaid(p.id)}>Mark paid</Button></div>}
              </div>
            ))}
          </Card>
        </div>
      )}
      {tab === "sendmoney" && !isOwner && (
        <EmptyNote text="Sending and recording payments is available to the owner only." />
      )}

      {tab === "users" && (
        <div>
          {selectedMember ? (
            <MemberAnalyticsPanel
              member={selectedMember} taskSubs={taskSubs} reels={reels} payments={payments} rewardConfig={finance && finance.rewardConfig}
              sessionLog={sessionLog}
              onBack={() => setSelectedMember(null)}
              onToggleSuspend={(u) => { toggleSuspend(u); setSelectedMember({ ...u, status: u.status === "active" ? "suspended" : "active" }); }}
            />
          ) : (
            <>
              <SectionHeader title="User management" />
              {!isOwner && <div style={{ fontFamily: sans, fontSize: 12, color: C.textFaint, marginBottom: 12 }}>Detailed member activity (sessions, login history, account details) is visible to the owner only.</div>}
              <Card style={{ padding: 0 }}>
                {users.map((u, i) => {
                  const a = u.role === "member" ? computeMemberAnalytics(u.username, taskSubs, reels, payments, finance && finance.rewardConfig) : null;
                  const canOpen = isOwner && u.role === "member";
                  return (
                    <div key={u.id} onClick={() => canOpen && setSelectedMember(u)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, fontFamily: sans, fontSize: 13.5, cursor: canOpen ? "pointer" : "default" }}>
                      <div>
                        <div>{u.username} <span style={{ color: C.textFaint, fontSize: 12 }}>· {u.role}</span></div>
                        {a && <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 2 }}>Weekly {a.weeklyPct}% · {a.reelsPromoted} reels promoted · ₹{a.rewardsEarned} earned</div>}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                        <Badge status={u.status} />
                        {u.role === "member" && <Button small variant="ghost" onClick={() => toggleSuspend(u)}>{u.status === "active" ? "Suspend" : "Restore"}</Button>}
                        {canOpen && <ChevronRight size={16} color={C.textFaint} onClick={() => setSelectedMember(u)} style={{ cursor: "pointer" }} />}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "announce" && (
        <div>
          <SectionHeader title="Post an announcement" />
          <Card style={{ marginBottom: 16 }}>
            <Field label="Title"><input style={inputStyle} value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} /></Field>
            <Field label="Message"><input style={inputStyle} value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} /></Field>
            <Button small onClick={postAnn}>Post</Button>
          </Card>
          <Card style={{ padding: 0 }}>
            {announcements.map((a, i) => (
              <div key={a.id} style={{ padding: "12px 18px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, fontFamily: sans, fontSize: 13.5 }}>
                <b>{a.title}</b> — <span style={{ color: C.textMuted }}>{a.body}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === "finance" && isOwner && finance && (
        <FinanceTab finance={finance} persistFinance={persistFinance} payments={payments} campaigns={campaigns} notify={notify} session={session} logActivity={logActivity} />
      )}
      {tab === "finance" && !isOwner && (
        <EmptyNote text="Finance is visible to the owner only." />
      )}

      {tab === "activity" && (
        <div>
          <SectionHeader title="Admin activity log" />
          <div style={{ fontFamily: sans, fontSize: 12, color: C.textFaint, marginBottom: 14 }}>Every approval, rejection, reward change, and member action, newest first.</div>
          <Card style={{ padding: 0 }}>
            {activityLog.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No admin actions logged yet." /></div>}
            {activityLog.map((e, i) => (
              <div key={e.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700 }}>{e.action}</span>
                  <span style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: C.textMuted, marginTop: 3 }}>by {e.actor}{e.detail ? ` · ${e.detail}` : ""}</div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- FINANCE (owner-only) ----------
const EXPENSE_CATEGORIES = ["Member rewards", "Admin salary", "Marketing", "Tools", "Other"];


function MiniBarChart({ months }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.revenue, m.expense]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 140, padding: "6px 4px 0" }}>
      {months.map((m) => (
        <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110 }}>
            <div title={`Revenue ₹${m.revenue}`} style={{ width: 10, height: `${Math.max(3, (m.revenue / max) * 100)}%`, background: C.green, borderRadius: 3 }} />
            <div title={`Expenses ₹${m.expense}`} style={{ width: 10, height: `${Math.max(3, (m.expense / max) * 100)}%`, background: C.red, borderRadius: 3 }} />
          </div>
          <div style={{ fontFamily: sans, fontSize: 10, color: C.textFaint, marginTop: 6 }}>{monthLabel(m.key)}</div>
        </div>
      ))}
    </div>
  );
}

function FinanceTab({ finance, persistFinance, payments, campaigns, notify, session, logActivity }) {
  const { revenues, expenses, salaries, calc } = finance;
  const viewsCalc = finance.viewsCalc || SEED_FINANCE.viewsCalc;

  const memberRewardCosts = payments.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount), 0);
  const weeklyRewardsPaid = payments.filter((p) => p.status === "paid" && p.type === "weekly_completion").reduce((a, p) => a + Number(p.amount), 0);
  const monthlyRewardsPaid = payments.filter((p) => p.status === "paid" && p.type === "monthly_completion").reduce((a, p) => a + Number(p.amount), 0);
  const pendingRewards = payments.filter((p) => p.status === "pending").reduce((a, p) => a + Number(p.amount), 0);
  const confirmedRevenue = revenues.filter((r) => r.confirmed).reduce((a, r) => a + Number(r.amount || 0), 0);
  const estimatedRevenue = revenues.filter((r) => !r.confirmed).reduce((a, r) => a + Number(r.amount || 0), 0);
  const ledgerExpenses = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const salaryTotal = salaries.reduce((a, s) => a + Number(s.amount || 0), 0);
  const totalExpenses = ledgerExpenses + salaryTotal + memberRewardCosts;
  const netProfit = confirmedRevenue - totalExpenses;
  const profitMargin = confirmedRevenue > 0 ? (netProfit / confirmedRevenue) * 100 : 0;

  const calcEstimate = Number(calc.avgOrderValue || 0) * Number(calc.expectedOrders || 0) + Number(calc.avgCampaignRevenue || 0) * Number(calc.expectedCampaigns || 0);

  const update = async (patch) => { await persistFinance({ ...finance, ...patch }); };

  // ---- revenue ledger ----
  const updateRevenue = (id, field, value) => update({ revenues: revenues.map((r) => r.id === id ? { ...r, [field]: value } : r) });
  const deleteRevenue = (id) => { const r0 = revenues.find((r) => r.id === id); update({ revenues: revenues.filter((r) => r.id !== id) }); logActivity(session.username, "Removed revenue entry", r0 ? `${r0.source} — ₹${r0.amount}` : ""); };
  const addRevenue = () => { update({ revenues: [{ id: uid(), source: "New revenue", amount: 0, date: todayStr(), confirmed: true, campaign: "" }, ...revenues] }); logActivity(session.username, "Added revenue entry", ""); };

  // ---- expense ledger ----
  const updateExpense = (id, field, value) => update({ expenses: expenses.map((e) => e.id === id ? { ...e, [field]: value } : e) });
  const deleteExpense = (id) => { const e0 = expenses.find((e) => e.id === id); update({ expenses: expenses.filter((e) => e.id !== id) }); logActivity(session.username, "Removed expense entry", e0 ? `${e0.label} — ₹${e0.amount}` : ""); };
  const addExpense = () => { update({ expenses: [{ id: uid(), category: "Other", label: "New expense", amount: 0, date: todayStr(), campaign: "" }, ...expenses] }); logActivity(session.username, "Added expense entry", ""); };

  // ---- salaries ----
  const updateSalary = (id, field, value) => update({ salaries: salaries.map((s) => s.id === id ? { ...s, [field]: value } : s) });
  const deleteSalary = (id) => { const s0 = salaries.find((s) => s.id === id); update({ salaries: salaries.filter((s) => s.id !== id) }); logActivity(session.username, "Removed salary entry", s0 ? `${s0.name} — ₹${s0.amount}` : ""); };
  const addSalary = () => { update({ salaries: [{ id: uid(), name: "New admin", role: "Admin", amount: 0, date: todayStr() }, ...salaries] }); logActivity(session.username, "Added salary entry", ""); };

  // ---- calculator ----
  const updateCalc = (field, value) => update({ calc: { ...calc, [field]: value } });

  // ---- views earnings calculator ----
  const updateViewsCalc = (field, value) => update({ viewsCalc: { ...viewsCalc, [field]: value } });
  const vc = {
    reelsPerDay: Number(viewsCalc.reelsPerDay || 0),
    avgViewsPerReel: Number(viewsCalc.avgViewsPerReel || 0),
    daysPerWeek: Number(viewsCalc.daysPerWeek || 0),
    daysPerMonth: Number(viewsCalc.daysPerMonth || 0),
    paymentPer1M: Number(viewsCalc.paymentPer1M || 0),
    rewardCostPerWeek: Number(viewsCalc.rewardCostPerWeek || 0),
  };
  const viewsPerDay = vc.reelsPerDay * vc.avgViewsPerReel;
  const weeklyViews = viewsPerDay * vc.daysPerWeek;
  const monthlyViews = viewsPerDay * vc.daysPerMonth;
  const weeklyEarnings = (weeklyViews / 1000000) * vc.paymentPer1M;
  const monthlyEarnings = (monthlyViews / 1000000) * vc.paymentPer1M;
  const weeklyNet = weeklyEarnings - vc.rewardCostPerWeek;
  const monthlyNet = monthlyEarnings - vc.rewardCostPerWeek * (vc.daysPerMonth / (vc.daysPerWeek || 7));

  // ---- campaign profitability ----
  const campaignNames = Array.from(new Set([
    ...revenues.filter((r) => r.campaign).map((r) => r.campaign),
    ...expenses.filter((e) => e.campaign).map((e) => e.campaign),
  ]));
  const campaignRows = campaignNames.map((name) => {
    const rev = revenues.filter((r) => r.campaign === name && r.confirmed).reduce((a, r) => a + Number(r.amount || 0), 0);
    const cost = expenses.filter((e) => e.campaign === name).reduce((a, e) => a + Number(e.amount || 0), 0);
    const profit = rev - cost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    return { name, rev, cost, profit, margin };
  });

  // ---- monthly chart (last 6 months present in data) ----
  const monthSet = new Set([...revenues.filter((r) => r.confirmed).map((r) => monthKey(r.date)), ...expenses.map((e) => monthKey(e.date)), ...salaries.map((s) => monthKey(s.date))]);
  const monthKeys = Array.from(monthSet).sort().slice(-6);
  const months = (monthKeys.length ? monthKeys : [monthKey(todayStr())]).map((key) => ({
    key,
    revenue: revenues.filter((r) => r.confirmed && monthKey(r.date) === key).reduce((a, r) => a + Number(r.amount || 0), 0),
    expense: expenses.filter((e) => monthKey(e.date) === key).reduce((a, e) => a + Number(e.amount || 0), 0)
      + salaries.filter((s) => monthKey(s.date) === key).reduce((a, s) => a + Number(s.amount || 0), 0),
  }));

  const smallInput = { ...inputStyle, padding: "7px 9px", fontSize: 12.5 };

  return (
    <div>
      <SectionHeader title="Overview" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Confirmed revenue" value={`₹${confirmedRevenue.toLocaleString()}`} />
        <StatCard label="Estimated revenue" value={`₹${estimatedRevenue.toLocaleString()}`} />
        <StatCard label="Total expenses" value={`₹${totalExpenses.toLocaleString()}`} />
        <StatCard label="Member reward costs" value={`₹${memberRewardCosts.toLocaleString()}`} />
        <StatCard label="Net profit" value={`₹${netProfit.toLocaleString()}`} />
        <StatCard label="Profit margin" value={`${profitMargin.toFixed(1)}%`} />
      </div>
      <SectionHeader title="Member rewards breakdown" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <StatCard label="Weekly rewards paid" value={`₹${weeklyRewardsPaid.toLocaleString()}`} />
        <StatCard label="Monthly rewards paid" value={`₹${monthlyRewardsPaid.toLocaleString()}`} />
        <StatCard label="Total rewards paid" value={`₹${memberRewardCosts.toLocaleString()}`} />
        <StatCard label="Pending rewards" value={`₹${pendingRewards.toLocaleString()}`} />
      </div>
      <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: -4, marginBottom: 20 }}>
        Rewards only count as an expense once marked Paid in the Rewards Manager — pending selections are tracked separately and excluded from Net Profit.
        <br />Net profit and margin are calculated from confirmed revenue only — estimated revenue is tracked separately below and never counted here.
      </div>

      <SectionHeader title="Revenue vs. expenses" />
      <Card style={{ marginBottom: 24 }}>
        {months.every((m) => m.revenue === 0 && m.expense === 0) ? <EmptyNote text="Add revenue or expense entries to see the chart." /> : <MiniBarChart months={months} />}
        <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: C.green }} /><span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>Revenue</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: C.red }} /><span style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint }}>Expenses</span></div>
        </div>
      </Card>

      <SectionHeader title="Campaign profitability" />
      <Card style={{ padding: 0, marginBottom: 24 }}>
        {campaignRows.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="Tag revenue or expense entries with a campaign name to see profitability per campaign." /></div>}
        {campaignRows.map((c, i) => (
          <div key={c.name} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 700 }}>{c.name}</span>
              <span style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 800, color: c.profit >= 0 ? C.green : C.red }}>₹{c.profit.toLocaleString()}</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 3 }}>
              Revenue ₹{c.rev.toLocaleString()} · Costs ₹{c.cost.toLocaleString()} · Margin {c.margin.toFixed(1)}%
            </div>
          </div>
        ))}
      </Card>

      <SectionHeader title="Revenue" action={<Button small onClick={addRevenue}>Add entry</Button>} />
      <Card style={{ padding: 0, marginBottom: 24 }}>
        {revenues.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No revenue entries yet." /></div>}
        {revenues.map((r, i) => (
          <div key={r.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input style={{ ...smallInput, flex: "2 1 140px" }} value={r.source} onChange={(e) => updateRevenue(r.id, "source", e.target.value)} placeholder="Source" />
            <input style={{ ...smallInput, flex: "1 1 90px" }} value={r.campaign} onChange={(e) => updateRevenue(r.id, "campaign", e.target.value)} placeholder="Campaign tag" />
            <input style={{ ...smallInput, flex: "1 1 70px" }} type="date" value={r.date} onChange={(e) => updateRevenue(r.id, "date", e.target.value)} />
            <input style={{ ...smallInput, width: 90 }} type="number" value={r.amount} onChange={(e) => updateRevenue(r.id, "amount", e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: sans, fontSize: 11.5, color: r.confirmed ? C.green : C.amber, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={r.confirmed} onChange={(e) => updateRevenue(r.id, "confirmed", e.target.checked)} />
              {r.confirmed ? "Confirmed" : "Estimated"}
            </label>
            <div onClick={() => deleteRevenue(r.id)} style={{ cursor: "pointer", color: C.textFaint }}><Trash2 size={15} /></div>
          </div>
        ))}
      </Card>

      <SectionHeader title="Expenses" action={<Button small onClick={addExpense}>Add entry</Button>} />
      <Card style={{ padding: 0, marginBottom: 24 }}>
        {expenses.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No expense entries yet." /></div>}
        {expenses.map((e, i) => (
          <div key={e.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select style={{ ...smallInput, flex: "1 1 120px" }} value={e.category} onChange={(ev) => updateExpense(e.id, "category", ev.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input style={{ ...smallInput, flex: "2 1 140px" }} value={e.label} onChange={(ev) => updateExpense(e.id, "label", ev.target.value)} placeholder="Label" />
            <input style={{ ...smallInput, flex: "1 1 90px" }} value={e.campaign} onChange={(ev) => updateExpense(e.id, "campaign", ev.target.value)} placeholder="Campaign tag" />
            <input style={{ ...smallInput, flex: "1 1 70px" }} type="date" value={e.date} onChange={(ev) => updateExpense(e.id, "date", ev.target.value)} />
            <input style={{ ...smallInput, width: 90 }} type="number" value={e.amount} onChange={(ev) => updateExpense(e.id, "amount", ev.target.value)} />
            <div onClick={() => deleteExpense(e.id)} style={{ cursor: "pointer", color: C.textFaint }}><Trash2 size={15} /></div>
          </div>
        ))}
      </Card>

      <SectionHeader title="Admin salaries" action={<Button small onClick={addSalary}>Add entry</Button>} />
      <Card style={{ padding: 0, marginBottom: 24 }}>
        {salaries.length === 0 && <div style={{ padding: 18 }}><EmptyNote text="No salary entries yet." /></div>}
        {salaries.map((s, i) => (
          <div key={s.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input style={{ ...smallInput, flex: "1 1 120px" }} value={s.name} onChange={(e) => updateSalary(s.id, "name", e.target.value)} placeholder="Name" />
            <input style={{ ...smallInput, flex: "1 1 100px" }} value={s.role} onChange={(e) => updateSalary(s.id, "role", e.target.value)} placeholder="Role" />
            <input style={{ ...smallInput, flex: "1 1 70px" }} type="date" value={s.date} onChange={(e) => updateSalary(s.id, "date", e.target.value)} />
            <input style={{ ...smallInput, width: 90 }} type="number" value={s.amount} onChange={(e) => updateSalary(s.id, "amount", e.target.value)} />
            <div onClick={() => deleteSalary(s.id)} style={{ cursor: "pointer", color: C.textFaint }}><Trash2 size={15} /></div>
          </div>
        ))}
      </Card>

      <SectionHeader title="Estimated earnings calculator" />
      <Card style={{ marginBottom: 12, border: `1px dashed ${C.amber}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <Calculator size={16} color={C.amber} />
          <span style={{ fontFamily: sans, fontSize: 13, color: C.amber, fontWeight: 700 }}>Projection only — not included in Net Profit</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="Avg. order value (₹)"><input style={inputStyle} type="number" value={calc.avgOrderValue} onChange={(e) => updateCalc("avgOrderValue", e.target.value)} /></Field>
          <Field label="Expected orders / mo"><input style={inputStyle} type="number" value={calc.expectedOrders} onChange={(e) => updateCalc("expectedOrders", e.target.value)} /></Field>
          <Field label="Avg. campaign revenue (₹)"><input style={inputStyle} type="number" value={calc.avgCampaignRevenue} onChange={(e) => updateCalc("avgCampaignRevenue", e.target.value)} /></Field>
          <Field label="Expected campaigns / mo"><input style={inputStyle} type="number" value={calc.expectedCampaigns} onChange={(e) => updateCalc("expectedCampaigns", e.target.value)} /></Field>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, fontWeight: 600 }}>Estimated monthly revenue</span>
          <span style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: C.amber }}>₹{calcEstimate.toLocaleString()}</span>
        </div>
      </Card>

      <SectionHeader title="Views earnings calculator" />
      <Card style={{ marginBottom: 24, border: `1px dashed ${C.green}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <TrendingUp size={16} color={C.green} />
          <span style={{ fontFamily: sans, fontSize: 13, color: C.green, fontWeight: 700 }}>Based on your views model — separate from confirmed revenue</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Field label="Reels per day"><input style={inputStyle} type="number" value={viewsCalc.reelsPerDay} onChange={(e) => updateViewsCalc("reelsPerDay", e.target.value)} /></Field>
          <Field label="Avg. views per reel"><input style={inputStyle} type="number" value={viewsCalc.avgViewsPerReel} onChange={(e) => updateViewsCalc("avgViewsPerReel", e.target.value)} /></Field>
          <Field label="Days per week"><input style={inputStyle} type="number" value={viewsCalc.daysPerWeek} onChange={(e) => updateViewsCalc("daysPerWeek", e.target.value)} /></Field>
          <Field label="Days per month"><input style={inputStyle} type="number" value={viewsCalc.daysPerMonth} onChange={(e) => updateViewsCalc("daysPerMonth", e.target.value)} /></Field>
          <Field label="Payment per 1M eligible views (₹)"><input style={inputStyle} type="number" value={viewsCalc.paymentPer1M} onChange={(e) => updateViewsCalc("paymentPer1M", e.target.value)} /></Field>
          <Field label="Member/reward costs per week (₹)"><input style={inputStyle} type="number" value={viewsCalc.rewardCostPerWeek} onChange={(e) => updateViewsCalc("rewardCostPerWeek", e.target.value)} /></Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 10 }}>
          <MiniStat label="Views / week" value={weeklyViews.toLocaleString()} />
          <MiniStat label="Views / month" value={monthlyViews.toLocaleString()} />
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, fontWeight: 600 }}>Estimated weekly earnings</span>
          <span style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: C.green }}>₹{weeklyEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 4, marginBottom: 10 }}>After member/reward costs: ₹{weeklyNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, fontWeight: 600 }}>Estimated monthly earnings</span>
          <span style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: C.green }}>₹{monthlyEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 11.5, color: C.textFaint, marginTop: 4 }}>After member/reward costs: ₹{monthlyNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>

        <div style={{ fontFamily: sans, fontSize: 11, color: C.textFaint, marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          Example: {viewsCalc.reelsPerDay} reels × {Number(viewsCalc.avgViewsPerReel).toLocaleString()} views × {viewsCalc.daysPerWeek} days = {weeklyViews.toLocaleString()} views/week → ₹{viewsCalc.paymentPer1M}/M = ₹{weeklyEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })} estimated/week
        </div>
      </Card>
    </div>
  );
}


function Landing({ setView, orders, persistOrders, notify }) {
  const [form, setForm] = useState({ name: "", contact: "", instagram: "", reelUrl: "", service: "Reel Promotion", budget: "" });

  const submitOrder = async () => {
    if (!form.name || !form.contact || !form.instagram) return notify("Please fill in your name, contact, and Instagram handle.");
    const order = { id: uid(), ...form, status: "new", createdAt: new Date().toISOString() };
    await persistOrders([order, ...orders]);
    setForm({ name: "", contact: "", instagram: "", reelUrl: "", service: "Reel Promotion", budget: "" });
    notify("Request received — our team will review it shortly.");
  };

  const services = [
    { name: "Reel Promotion", desc: "Your Reel enters our member queue and gets genuine watches, likes, and comments from real community members completing daily tasks.", price: "From ₹499 / campaign" },
    { name: "Community Engagement", desc: "Join a private group of creators who promote each other's content on a rotating daily schedule.", price: "₹299 / month" },
    { name: "Creator Campaigns", desc: "Multi-day coordinated promotion across our member base for a launch, series, or product Reel.", price: "Custom quote" },
  ];

  return (
    <div>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: C.bg, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>R</div>
          <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700 }}>ReelHub</span>
        </div>
        <Button small onClick={() => setView("login")}>Member login</Button>
      </div>

      <div style={{ padding: "76px 24px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-block", fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.accent, background: C.accentSoft, borderRadius: 999, padding: "6px 15px", marginBottom: 20 }}>
          Real members · Real proof · No fake engagement
        </div>
        <h1 style={{ fontFamily: sans, fontSize: 42, lineHeight: 1.12, margin: "0 auto", fontWeight: 800, letterSpacing: "-0.03em", maxWidth: 600 }}>
          Grow your Reels with a community that actually shows up.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 16, color: C.textMuted, lineHeight: 1.6, maxWidth: 460, margin: "16px auto 0" }}>
          Members complete daily promotion tasks for each other — every submission reviewed, every reward tracked.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center" }}>
          <Button onClick={() => setView("login")}>Join the community</Button>
          <Button variant="ghost" onClick={() => document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth" })}>Request promotion</Button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 56px" }}>
        <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, marginBottom: 18, letterSpacing: "-0.01em" }}>Services</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {services.map((s) => (
            <Card key={s.name}>
              <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700 }}>{s.name}</div>
              <p style={{ fontFamily: sans, fontSize: 13.5, color: C.textMuted, lineHeight: 1.55, margin: "8px 0 14px" }}>{s.desc}</p>
              <div style={{ fontFamily: sans, fontSize: 13, color: C.accent, fontWeight: 700 }}>{s.price}</div>
            </Card>
          ))}
        </div>
      </div>

      <div id="order-form" style={{ maxWidth: 480, margin: "0 auto", padding: "0 24px 72px" }}>
        <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, marginBottom: 18, letterSpacing: "-0.01em" }}>Request a service</div>
        <Card>
          <Field label="Your name"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Contact (email or phone)"><input style={inputStyle} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
          <Field label="Instagram username"><input style={inputStyle} value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@yourhandle" /></Field>
          <Field label="Reel URL (optional)"><input style={inputStyle} value={form.reelUrl} onChange={(e) => setForm({ ...form, reelUrl: e.target.value })} /></Field>
          <Field label="Service">
            <select style={inputStyle} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
              {services.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Budget / quantity"><input style={inputStyle} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
          <Button onClick={submitOrder}>Submit request</Button>
        </Card>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: "24px", textAlign: "center", fontFamily: sans, fontSize: 12, color: C.textFaint }}>
        ReelHub — a real-member promotion community. No bots, no guaranteed numbers.
      </div>
    </div>
  );
}

// ---------- LOGIN ----------
function Login({ setView, notify, onSubmitLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return notify("Enter your username and password.");
    setBusy(true);
    try {
      await onSubmitLogin(username, password);
    } catch (e) {
      notify(e.message || "Invalid username or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "72px auto", padding: "0 24px" }}>
      <div style={{ fontFamily: sans, fontSize: 24, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.01em" }}>Sign in</div>
      <p style={{ fontFamily: sans, fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
        Enter your CreatorHub username and password. Your account's role (member, admin, or owner) is determined by the server.
      </p>
      <Card>
        <Field label="Username">
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. aisha_k" autoComplete="username" />
        </Field>
        <Field label="Password">
          <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </Field>
        <Button full disabled={busy} onClick={submit}>{busy ? "Signing in…" : "Sign in"}</Button>
      </Card>
    </div>
  );
}
