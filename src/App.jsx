import React, { useState, useEffect } from "react";
import { Compass, Flag, Wallet, User, Search, Gift, ChevronRight, Bell, HelpCircle, BookOpen, Link2, UserPlus, Moon, Globe, Play, Heart, MessageCircle, LogOut, ShieldCheck, Pencil, SlidersHorizontal, DollarSign, TrendingUp, TrendingDown, Trash2, Calculator, PiggyBank } from "lucide-react";

// ---------- backend API ----------
// Paste your deployed Apps Script Web App URL (ends in /exec) here:
const API_URL = "https://script.google.com/macros/s/AKfycbyxMocd9OtsVYgna_DRTk2T5U9LH3tsCjMMdBeidsOYFIZB-c9kBoDhlzIZ3llMKFN1/exec";
let AUTH_TOKEN = null; // set on login, cleared on logout â€” never persisted to storage
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
// Tracks only CreatorHub login/logout events (username + event + timestamp) â€” no device data.
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

// default reward eligibility thresholds â€” can be overridden by finance.rewardConfig
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
        <Button small variant="ghost" onClick={onBack}>â† Back</Button>
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
        {a.weeklyCompletedDays}/7 days completed this week Â· {a.monthlyCompletedDays}/30 days this month Â· {a.activeDays} total active days Â· {a.consecutiveMonths} consecutive active month{a.consecutiveMonths === 1 ? "" : "s"}
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
        <MiniStat label="Rewards earned" value={`â‚¹${a.rewardsEarned}`} color={C.green} />
      </div>
      {a.rewardsPending > 0 && (
        <div style={{ fontFamily: sans, fontSize: 12, color: C.amber, marginBottom: 18 }}>â‚¹{a.rewardsPending} pending payout</div>
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
        <MiniStat label="Last active" value={sess.lastActiveAt ? fmtDateShort(sess.lastActiveAt) : "â€”"} />
        <MiniStat label="Account created" value={member.joinedAt ? fmtDateShort(member.joinedAt) : "â€”"} />
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
  { id: "t2", title: "Promote @raj.travels' new Reel", instructions: "Watch fully and like â€” comments optional.", reelUrl: "https://instagram.com/reel/example2", requiredActions: ["watch", "like"], deadline: new Date(Date.now() + 172800000).toISOString(), status: "active", capacity: 40 },
];
const SEED_ANN = [
  { id: "a1", title: "Welcome to the platform", body: "Every promotion here is a real member action â€” no bots, ever. Complete your daily task and submit proof below.", category: "rules", createdAt: new Date().toISOString(), postedBy: "dev_admin" },
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

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "11px 13px", fontFamily: sans, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 12, background: C.surfaceAlt, color: C.text, outline: "none" 
};
