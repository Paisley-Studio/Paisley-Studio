/**
 * Faithful rebuilds of the real Paisley Studio portals, measured from the supplied
 * screenshots (PAISLEY-PHOTOS) and using the labels found in the project source
 * (student/, tutor/, tuition/, parent/, js/classroom, functions/work.js).
 * Rebuilt rather than screenshotted so states can change on cue, and so no real
 * student or tutor names appear: all people and values here are demo data.
 *
 * Every component is laid out on a 1900 x 880 "page", the size of the screenshots.
 */
import React from "react";
import { Img, staticFile } from "remotion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBell, faBookOpen, faBook, faBullhorn, faCalendarDays, faCalendarWeek, faChalkboard, faChartLine,
  faChartPie, faComments, faEnvelope, faFilePen, faFolderOpen, faGamepad, faGraduationCap, faHeadset,
  faHouse, faIdCard, faLaptop, faRightFromBracket, faSquarePollVertical, faUserShield, faUsers,
  faWandMagicSparkles, faListCheck, faArrowRightArrowLeft, faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { C, QUICKSAND } from "./lib";

export const PAGE_W = 1900;
export const PAGE_H = 880;

/** Demo cast for the product scenes. Fictional; not real accounts. */
export const DEMO = {
  student: "Amani Njoroge",
  initials: "AN",
  tutor: "Ms Wanjiru",
  tutorInitials: "MW",
  parent: "Grace Njoroge",
  work: "Simultaneous Equations — Practice",
  subject: "Mathematics",
};

export const Icon: React.FC<{ i: IconDefinition; size?: number; color?: string; style?: React.CSSProperties }> = ({
  i, size = 22, color = "currentColor", style,
}) => <FontAwesomeIcon icon={i} style={{ width: size, height: size, color, ...style }} />;

type NavItem = { icon: IconDefinition; label: string; badge?: number | string; active?: boolean };

export const NAV = {
  student: [
    { icon: faChartPie, label: "Overview" },
    { icon: faSquarePollVertical, label: "My Results" },
    { icon: faChalkboard, label: "Classroom" },
    { icon: faBook, label: "Homework" },
    { icon: faFilePen, label: "Exams" },
    { icon: faBullhorn, label: "Notices" },
    { icon: faCalendarDays, label: "Timetable" },
    { icon: faHeadset, label: "Contact Tutor" },
    { icon: faIdCard, label: "My Profile" },
  ] as NavItem[],
  tutor: [
    { icon: faFolderOpen, label: "Resources" },
    { icon: faBookOpen, label: "Homework Management" },
    { icon: faFilePen, label: "Exam Management" },
    { icon: faUserShield, label: "Granted to Me", badge: 0 },
    { icon: faCalendarDays, label: "Timetable & Notices" },
    { icon: faCalendarWeek, label: "My Timetable" },
    { icon: faGraduationCap, label: "CBC Tuition" },
    { icon: faHeadset, label: "Student Tickets", badge: 0 },
  ] as NavItem[],
  tuition: [
    { icon: faChalkboard, label: "My Classroom" },
    { icon: faBookOpen, label: "My Homework" },
    { icon: faFilePen, label: "My Exams" },
    { icon: faChartLine, label: "My Results" },
    { icon: faCalendarWeek, label: "Timetable" },
    { icon: faListCheck, label: "My Subjects" },
    { icon: faHeadset, label: "Support Tickets" },
    { icon: faIdCard, label: "My Profile" },
  ] as NavItem[],
  parent: [
    { icon: faHouse, label: "Overview" },
    { icon: faChartLine, label: "Growth" },
    { icon: faCalendarDays, label: "Classes & Timetable" },
    { icon: faLaptop, label: "Classroom" },
    { icon: faBook, label: "Homework" },
    { icon: faFilePen, label: "Exams" },
    { icon: faGamepad, label: "Activities" },
    { icon: faBullhorn, label: "Announcements" },
    { icon: faComments, label: "Chats" },
    { icon: faEnvelope, label: "Messages" },
    { icon: faWandMagicSparkles, label: "Paisley TECH" },
  ] as NavItem[],
};

/** The dark-teal sidebar used by the student, tutor and CBC tuition portals. */
export const Sidebar: React.FC<{
  portal: string;
  items: NavItem[];
  active: string;
  user: string;
  initials: string;
  meta: string;
  badges?: Record<string, number>;
}> = ({ portal, items, active, user, initials, meta, badges = {} }) => (
  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 360, background: C.brandDeep, color: "#fff",
    fontFamily: QUICKSAND }}>
    <div style={{ height: 122, display: "flex", alignItems: "center", gap: 14, paddingLeft: 22,
      borderBottom: "1px solid rgba(255,255,255,.08)" }}>
      <Img src={staticFile("img/logo@3x.png")} style={{ width: 64, filter: "brightness(0) invert(1)", opacity: 0.92 }} />
      <div>
        <div style={{ fontSize: 25, fontWeight: 700 }}>Paisley Studio</div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", color: C.brandSoft }}>{portal}</div>
      </div>
    </div>
    <div style={{ padding: "24px 18px" }}>
      {items.map((it) => {
        const on = it.label === active;
        const badge = badges[it.label] ?? it.badge;
        return (
          <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 18, height: 58, padding: "0 20px",
            marginBottom: 4.5, borderRadius: 14, background: on ? "rgba(255,255,255,.1)" : "transparent",
            fontWeight: 700, fontSize: 20, opacity: on ? 1 : 0.92 }}>
            <Icon i={it.icon} size={21} color="rgba(255,255,255,.9)" />
            <span style={{ flex: 1, lineHeight: 1.15 }}>{it.label}</span>
            {badge !== undefined && (
              <span style={{ minWidth: 32, height: 26, borderRadius: 13, background: C.brand, fontSize: 14,
                display: "grid", placeItems: "center", color: C.brandDeep, fontWeight: 700 }}>{badge}</span>
            )}
          </div>
        );
      })}
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 165, background: "rgba(0,0,0,.08)",
      borderTop: "1px solid rgba(255,255,255,.08)", padding: "22px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: C.brand, display: "grid", placeItems: "center",
          fontWeight: 700, fontSize: 18, color: C.brandDeep }}>{initials}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 19 }}>{user}</div>
          <div style={{ fontSize: 15, color: C.brandSoft, fontWeight: 600 }}>{meta}</div>
        </div>
      </div>
      <div style={{ marginTop: 18, height: 50, borderRadius: 14, border: "1px solid rgba(255,255,255,.2)", display: "flex",
        alignItems: "center", justifyContent: "center", gap: 10, fontWeight: 700, fontSize: 19 }}>
        <Icon i={faRightFromBracket} size={17} /> Sign out
      </div>
    </div>
  </div>
);

/** Notification bell with its red count badge; `pop` (0..1) animates a count change. */
export const Bell: React.FC<{ count: number; pop?: number; style?: React.CSSProperties; ring?: number }> = ({
  count, pop = 0, style, ring = 0,
}) => (
  <div style={{ position: "absolute", width: 56, height: 62, borderRadius: 14, border: "1px solid #dfe9e6",
    background: "#fff", display: "grid", placeItems: "center", ...style }}>
    <div style={{ rotate: `${Math.sin(ring * Math.PI * 6) * 18 * (1 - ring)}deg`, transformOrigin: "50% 10%" }}>
      <Icon i={faBell} size={24} color={C.brandDeep} />
    </div>
    {count > 0 && (
      <div style={{ position: "absolute", top: -12, right: -10, minWidth: 28, height: 28, padding: "0 7px", borderRadius: 14,
        background: C.error, color: "#fff", fontFamily: QUICKSAND, fontWeight: 700, fontSize: 15, display: "grid",
        placeItems: "center", border: "2px solid #fff", scale: 1 + Math.sin(pop * Math.PI) * 0.45 }}>{count}</div>
    )}
  </div>
);

/** Page header: title, subtitle and right-hand slot. */
export const Header: React.FC<{ title: string; sub: string; children?: React.ReactNode; left?: number }> = ({
  title, sub, children, left = 360,
}) => (
  <div style={{ position: "absolute", left, right: 0, top: 0, height: 116, background: "#fff",
    borderBottom: "1px solid #e3eeeb", fontFamily: QUICKSAND }}>
    <div style={{ position: "absolute", left: 44, top: 28 }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: C.brandDeep }}>{title}</div>
      <div style={{ fontSize: 19, color: C.muted, fontWeight: 500, marginTop: 2 }}>{sub}</div>
    </div>
    {children}
  </div>
);

export const SubjectCard: React.FC<{ name: string; sub: string; badge?: number; style?: React.CSSProperties;
  highlight?: number }> = ({ name, sub, badge, style, highlight = 0 }) => (
  <div style={{ position: "absolute", width: 350, height: 186, borderRadius: 22, background: "#fff",
    border: `1px solid ${highlight > 0 ? C.brand : "#e2ece9"}`, fontFamily: QUICKSAND,
    boxShadow: `0 ${4 + highlight * 20}px ${10 + highlight * 40}px rgba(36,95,90,${0.05 + highlight * 0.18})`, ...style }}>
    <div style={{ position: "absolute", left: 29, top: 27, width: 60, height: 60, borderRadius: 14, background: "#e7f6f4",
      display: "grid", placeItems: "center" }}>
      <Icon i={faLaptop} size={22} color={C.brandDeep} />
    </div>
    <div style={{ position: "absolute", left: 29, top: 104, fontSize: 23, fontWeight: 700, color: C.brandDeep }}>{name}</div>
    <div style={{ position: "absolute", left: 29, top: 138, fontSize: 18, color: C.muted, fontWeight: 500 }}>{sub}</div>
    {badge ? (
      <div style={{ position: "absolute", right: -14, top: -14, width: 34, height: 34, borderRadius: 17, background: C.error,
        color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16, border: "3px solid #fff",
        boxShadow: "0 2px 6px rgba(0,0,0,.15)" }}>{badge}</div>
    ) : null}
  </div>
);

/** Status pills, using the real portal wording. */
export const Pill: React.FC<{ kind: "pending" | "graded" | "ok" | "warn" | "neutral"; children: React.ReactNode;
  style?: React.CSSProperties; size?: number }> = ({ kind, children, style, size = 17 }) => {
  const col = {
    pending: ["#FFF4DE", "#9A6A12"],
    graded: ["#E2F6EC", "#1C7A4A"],
    ok: ["#E2F6EC", "#1C7A4A"],
    warn: ["#FFF4DE", "#9A6A12"],
    neutral: [C.sage, C.brandDeep],
  }[kind];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 999,
      background: col[0], color: col[1], fontFamily: QUICKSAND, fontWeight: 700, fontSize: size, whiteSpace: "nowrap",
      ...style }}>{children}</span>
  );
};

/** The drop-down notifications panel under the bell. */
export const NotifyPanel: React.FC<{ items: { title: string; message: string; when: string; fresh?: boolean }[];
  style?: React.CSSProperties; reveal?: number }> = ({ items, style, reveal = 1 }) => (
  <div style={{ position: "absolute", width: 520, borderRadius: 18, background: "#fff", fontFamily: QUICKSAND,
    boxShadow: "0 30px 70px rgba(15,26,20,.25), 0 0 0 1px #e2ece9", overflow: "hidden", transformOrigin: "90% 0",
    scale: 0.92 + reveal * 0.08, opacity: reveal, translate: `0 ${(1 - reveal) * -16}px`, ...style }}>
    <div style={{ padding: "18px 24px", fontWeight: 700, fontSize: 20, color: C.brandDeep, borderBottom: "1px solid #eef3f2" }}>
      Notifications
    </div>
    {items.map((n, i) => (
      <div key={i} style={{ padding: "16px 24px", borderBottom: "1px solid #eef3f2", background: n.fresh ? "#F1F9F7" : "#fff",
        display: "flex", gap: 14 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, marginTop: 8, background: n.fresh ? C.brand : "transparent",
          flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.ink }}>{n.title}</div>
          <div style={{ fontSize: 16, color: C.muted, marginTop: 3, lineHeight: 1.35 }}>{n.message}</div>
          <div style={{ fontSize: 13, color: "#8FA8A2", marginTop: 6, fontWeight: 600 }}>{n.when}</div>
        </div>
      </div>
    ))}
  </div>
);

/** White content card with a title, as used across the portals. */
export const Panel: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", borderRadius: 24, background: "#fff", border: "1px solid #e2ece9",
    fontFamily: QUICKSAND, ...style }}>{children}</div>
);

export const Button: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; variant?: "deep" | "brand" | "ghost";
  press?: number }> = ({ children, style, variant = "deep", press = 0 }) => (
  <div style={{ position: "absolute", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
    height: 52, padding: "0 26px", borderRadius: 14, fontFamily: QUICKSAND, fontWeight: 700, fontSize: 19,
    background: variant === "deep" ? C.brandDeep : variant === "brand" ? C.brand : "#fff",
    color: variant === "ghost" ? C.brandDeep : "#fff", border: variant === "ghost" ? `1px solid #d5e4e0` : "none",
    scale: 1 - press * 0.06, whiteSpace: "nowrap", ...style }}>{children}</div>
);

/** Parent portal (from the supplied parent overview screenshot). */
export const ParentChrome: React.FC<{ children?: React.ReactNode; bell: number; bellPop?: number; bellRing?: number }> = ({
  children, bell, bellPop = 0, bellRing = 0,
}) => (
  <div style={{ position: "absolute", inset: 0, background: C.paper, fontFamily: QUICKSAND }}>
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 342, background: "#fff",
      borderRight: "1px solid #e2ece9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "40px 30px 26px", fontSize: 26, fontWeight: 700,
        color: C.brandDeep }}>
        <Icon i={faUsers} size={26} color={C.brandDeep} /> Parent Portal
      </div>
      <div style={{ padding: "0 16px" }}>
        {NAV.parent.map((it, k) => (
          <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 18, height: 56, padding: "0 20px",
            marginBottom: 5, borderRadius: 12, background: k === 0 ? C.brand : "transparent", color: k === 0 ? "#fff" : C.ink,
            fontSize: 20, fontWeight: k === 0 ? 700 : 500 }}>
            <Icon i={it.icon} size={20} color={k === 0 ? "#fff" : C.ink} /> {it.label}
          </div>
        ))}
      </div>
    </div>
    <Panel style={{ left: 386, right: 50, top: 40, height: 124 }}>
      <div style={{ position: "absolute", left: 26, top: 31, width: 64, height: 64, borderRadius: 32, background: C.brand,
        color: "#fff", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700 }}>{DEMO.initials}</div>
      <div style={{ position: "absolute", left: 112, top: 24 }}>
        <div style={{ fontSize: 15, letterSpacing: "0.12em", fontWeight: 700, color: C.muted }}>VIEWING</div>
        <div style={{ fontSize: 27, fontWeight: 700, color: C.brandDeep }}>{DEMO.student}</div>
        <div style={{ fontSize: 17, color: C.muted, fontWeight: 500 }}>Key Stage 4 (Years 10-11) — IGCSE · Year 11</div>
      </div>
      <div style={{ position: "absolute", right: 106, top: 28, height: 66, borderRadius: 33, border: `3px solid ${C.brandSoft}`,
        background: "#eef8f6", display: "flex", alignItems: "center", paddingLeft: 20, gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.brandDeep, letterSpacing: "0.06em" }}>
          <Icon i={faArrowRightArrowLeft} size={15} /> SWITCH</span>
        <div style={{ height: 54, borderRadius: 27, background: "#fff", display: "flex", alignItems: "center", padding: "0 22px",
          gap: 30, marginRight: 3, fontSize: 19, fontWeight: 600, color: C.brandDeep }}>
          {DEMO.student} — Key Stage 4 <Icon i={faChevronDown} size={14} />
        </div>
      </div>
      <Bell count={bell} pop={bellPop} ring={bellRing} style={{ right: 26, top: 31 }} />
    </Panel>
    {children}
  </div>
);

export { faWandMagicSparkles, faBell, faChalkboard, faBookOpen, faFilePen, faFolderOpen };
