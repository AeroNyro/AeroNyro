// Builds the aviation profile SVGs from live GitHub data.
// Run by .github/workflows/profile.yml every day. Locally:  GITHUB_TOKEN=xxx node scripts/build.mjs <username>
// Offline test with fake data:                             node scripts/build.mjs --mock

import { writeFileSync, mkdirSync } from "node:fs";

// ───────────── settings you can change ─────────────
const CONFIG = {
  aircraft: "developer / avgeek",   // line under the callsign in the header
  featuredRepos: [],                // e.g. ["agent-lab", "flight-tracker"]; empty = your pinned repos, then most-starred
  passes: 2,                        // how many boarding-pass cards to build (README shows pass-1, pass-2 …)
  hideRepos: [],                    // repos never shown on a boarding pass (the profile repo is always hidden)
};
// ────────────────────────────────────────────────────

const OUT = new URL("../assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const save = (name, svg) => writeFileSync(new URL(name, OUT), svg);

const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const fmt = n => Number(n).toLocaleString("en-US");
// plane icon, nose pointing +x, centred on 0,0
const PLANE = `M15 0 L1 -2 L-7 -10 L-10 -10 L-6 -1 L-15 0 L-6 1 L-10 10 L-7 10 L1 2 Z`;
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function chrome(w, h, title, { bg = "#0b0b0b", bar = "#151208", line = "#3a2f12", ink = "#7a6430" } = {}) {
  return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="10" fill="${bg}" stroke="${line}"/>
  <path d="M11 1 H${w - 11} a10 10 0 0 1 10 10 V31 H1 V11 a10 10 0 0 1 10 -10 Z" fill="${bar}"/>
  <circle cx="20" cy="16" r="5" fill="#ff5f56"/><circle cx="38" cy="16" r="5" fill="#ffbd2e"/><circle cx="56" cy="16" r="5" fill="#27c93f"/>
  <text x="${w / 2}" y="20" font-family='${MONO}' font-size="12" fill="${ink}" text-anchor="middle">${esc(title)}</text>`;
}

// ───────────── data ─────────────
async function fetchData(login, token) {
  const query = `query($login:String!){
    user(login:$login){
      login name createdAt
      followers{totalCount}
      pinnedItems(first:6, types:REPOSITORY){nodes{... on Repository{name}}}
      repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:STARGAZERS,direction:DESC}){
        totalCount
        nodes{ name description stargazerCount forkCount isPrivate
          primaryLanguage{name color}
          languages(first:10, orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}} }
      }
      contributionsCollection{
        totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
        contributionCalendar{ totalContributions weeks{contributionDays{date contributionCount}} }
      }
    }}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "aviation-profile" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data.user;
}

function mockData() {
  const days = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i);
    const c = hash(String(i)) > 0.86 ? 1 + Math.floor(hash("c" + i) * 6) : 0;
    days.push({ date: d.toISOString().slice(0, 10), contributionCount: i < 3 ? 2 : c });
  }
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push({ contributionDays: days.slice(i, i + 7) });
  const L = (n, c, s) => ({ size: s, node: { name: n, color: c } });
  return {
    login: "pilot-dev", name: "Pilot Dev", createdAt: "2025-03-01T00:00:00Z", followers: { totalCount: 12 },
    pinnedItems: { nodes: [{ name: "flight-tracker" }] },
    repositories: { totalCount: 4, nodes: [
      { name: "flight-tracker", description: "Live ADS-B flight tracker that plots aircraft on a map in real time.", stargazerCount: 14, forkCount: 3, primaryLanguage: { name: "TypeScript", color: "#3178c6" }, languages: { edges: [L("TypeScript", "#3178c6", 90000), L("CSS", "#663399", 9000)] } },
      { name: "metar-bot", description: "Decodes METAR and TAF reports into plain English.", stargazerCount: 5, forkCount: 1, primaryLanguage: { name: "Python", color: "#3572A5" }, languages: { edges: [L("Python", "#3572A5", 40000)] } },
      { name: "pilot-dev", description: "My profile", stargazerCount: 0, forkCount: 0, primaryLanguage: { name: "JavaScript", color: "#f1e05a" }, languages: { edges: [L("JavaScript", "#f1e05a", 12000)] } },
    ] },
    contributionsCollection: { totalCommitContributions: 214, totalPullRequestContributions: 17, totalIssueContributions: 9, totalPullRequestReviewContributions: 4,
      contributionCalendar: { totalContributions: days.reduce((a, d) => a + d.contributionCount, 0), weeks } },
  };
}

function summarise(u) {
  const repos = u.repositories.nodes.filter(r => !r.isPrivate);
  const days = u.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays);
  // streaks (today with 0 doesn't break the current streak yet)
  let cur = 0, best = 0, run = 0;
  days.forEach(d => { run = d.contributionCount ? run + 1 : 0; best = Math.max(best, run); });
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount) cur++;
    else if (i === days.length - 1) continue;
    else break;
  }
  const perMonth = {};
  days.forEach(d => { const m = MONTHS[+d.date.slice(5, 7) - 1]; perMonth[m] = (perMonth[m] || 0) + d.contributionCount; });
  const busiest = Object.entries(perMonth).sort((a, b) => b[1] - a[1])[0];

  const langs = {};
  repos.forEach(r => r.languages.edges.forEach(e => {
    langs[e.node.name] ??= { name: e.node.name, color: e.node.color || "#8b949e", size: 0 };
    langs[e.node.name].size += e.size;
  }));
  const totalBytes = Object.values(langs).reduce((a, l) => a + l.size, 0) || 1;
  const topLangs = Object.values(langs).sort((a, b) => b.size - a.size).slice(0, 3)
    .map(l => ({ ...l, pct: Math.round((l.size / totalBytes) * 100) }));

  const hidden = new Set([u.login.toLowerCase(), ...CONFIG.hideRepos.map(s => s.toLowerCase())]);
  const byName = new Map(repos.map(r => [r.name.toLowerCase(), r]));
  const order = [...CONFIG.featuredRepos, ...u.pinnedItems.nodes.map(n => n.name), ...repos.map(r => r.name)];
  const featured = [];
  for (const n of order) {
    const r = byName.get(n.toLowerCase());
    if (r && !hidden.has(r.name.toLowerCase()) && !featured.includes(r)) featured.push(r);
    if (featured.length === CONFIG.passes) break;
  }
  const cc = u.contributionsCollection;
  return {
    login: u.login, name: u.name || u.login, since: u.createdAt.slice(0, 4), followers: u.followers.totalCount,
    repoCount: u.repositories.totalCount, stars: repos.reduce((a, r) => a + r.stargazerCount, 0),
    commits: cc.totalCommitContributions, prs: cc.totalPullRequestContributions, issues: cc.totalIssueContributions,
    reviews: cc.totalPullRequestReviewContributions, total: cc.contributionCalendar.totalContributions,
    days, cur, best, busiest: busiest && busiest[1] ? busiest[0] : "—", topLangs, featured,
  };
}

// ───────────── header: departure board + flight path ─────────────
function header(s) {
  const dest = s.name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 14).trim() || s.login.toUpperCase().slice(0, 14);
  const flight = "GH" + String(s.repoCount).padStart(2, "0");
  const flap = (ch, x, i) => `<g class="roll" style="animation-delay:${(0.05 + i * 0.07).toFixed(2)}s"><rect class="flap" x="${x}" y="72" width="26" height="40" rx="3"/><text class="ch" x="${x + 13}" y="103">${esc(ch)}</text></g>`;
  const flightFlaps = [...flight].map((c, i) => flap(c, 30 + i * 28, i)).join("");
  const destFlaps = [...dest].map((c, i) => flap(c === " " ? "" : c, 178 + i * 28, i + 4)).join("");
  const route = "M470 262 Q 625 140 805 196";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="300" viewBox="0 0 860 300">
  <style>
    .mono { font-family: ${MONO}; }
    .dim { fill: #7a6430; } .amb { fill: #ffb000; } .cyan { fill: #39d0ff; }
    .flap { fill: #141414; stroke: #2a2a2a; }
    .ch { font-family: ${MONO}; font-size: 30px; font-weight: 700; fill: #ffb000; text-anchor: middle; }
    .roll { animation: roll .9s steps(6) both; }
    @keyframes roll { 0% { opacity: 0; transform: translateY(-14px); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
    .blink { animation: blink 1.1s steps(1) infinite; } @keyframes blink { 50% { opacity: 0; } }
    .cross { animation: cross 12s linear infinite; } @keyframes cross { from { transform: translateX(-40px); } to { transform: translateX(900px); } }
    .pulse { transform-box: fill-box; transform-origin: center; animation: pulse 2s ease-out infinite; }
    @keyframes pulse { from { transform: scale(1); opacity: .8; } to { transform: scale(3.2); opacity: 0; } }
  </style>
  ${chrome(860, 300, "departures · terminal 1 · gate 404")}
  <g class="mono dim" font-size="11" letter-spacing="1.5">
    <text x="32" y="62">FLIGHT</text><text x="180" y="62">DESTINATION</text><text x="600" y="62">STATUS</text>
  </g>
  ${flightFlaps}${destFlaps}
  <rect x="598" y="72" width="232" height="40" rx="3" fill="#0f1a0f" stroke="#1f3a1f"/>
  <circle class="blink" cx="616" cy="92" r="5" fill="#3cff7a"/>
  <text x="630" y="98" class="mono" font-size="17" font-weight="700" fill="#3cff7a">BOARDING · ON TIME</text>

  <line x1="30" y1="134" x2="830" y2="134" stroke="#3a2f12" stroke-dasharray="4 4"/>
  <g class="cross"><path d="${PLANE}" transform="translate(0,134) scale(.7)" fill="#ffb000" opacity=".6"/></g>

  <g class="mono">
    <text x="32" y="168" font-size="14" class="dim">$ <tspan class="amb">atc</tspan> --identify</text>
    <text x="32" y="200" font-size="15" fill="#e8e0c8" xml:space="preserve">callsign   <tspan class="amb">${esc(s.login)}</tspan></text>
    <text x="32" y="224" font-size="15" fill="#e8e0c8" xml:space="preserve">aircraft   <tspan class="cyan">${esc(CONFIG.aircraft)}</tspan></text>
    <text x="32" y="248" font-size="15" fill="#e8e0c8" xml:space="preserve">in service <tspan class="cyan">since ${s.since}</tspan></text>
    <text x="32" y="272" font-size="15" fill="#e8e0c8" xml:space="preserve">squawk     <tspan class="amb">7000</tspan><tspan class="amb blink"> █</tspan></text>
  </g>

  <!-- IDEA → SHIPPED: a plane flies the route, drawing its track behind it -->
  <path d="${route}" fill="none" stroke="#39d0ff" stroke-width="1.5" stroke-dasharray="3 5" opacity=".35"/>
  <path d="${route}" fill="none" stroke="#39d0ff" stroke-width="2" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1">
    <animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.8;1" dur="7s" repeatCount="indefinite"/>
  </path>
  <circle cx="470" cy="262" r="4" fill="#ffb000"/>
  <circle class="pulse" cx="805" cy="196" r="4" fill="none" stroke="#3cff7a"/>
  <circle cx="805" cy="196" r="4" fill="#3cff7a"/>
  <g>
    <path d="${PLANE}" fill="#ffb000"/>
    <animateMotion path="${route}" rotate="auto" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear" dur="7s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.8;.86;1" dur="7s" repeatCount="indefinite"/>
  </g>
  <text x="470" y="286" class="mono dim" font-size="11" text-anchor="middle">IDEA</text>
  <text x="805" y="222" class="mono" font-size="11" fill="#3cff7a" text-anchor="middle">SHIPPED</text>
  <text x="640" y="160" class="mono dim" font-size="11" text-anchor="middle">FL350 · ${fmt(s.commits)} commits flown</text>
</svg>`;
}

// ───────────── logbook (stats) ─────────────
function logbook(s) {
  const rows = [["flights (commits)", s.commits], ["landings (PRs)", s.prs], ["squawks (issues)", s.issues],
    ["inspections (reviews)", s.reviews], ["hangars (repos)", s.repoCount], ["stars earned", s.stars], ["passengers (followers)", s.followers]];
  const lines = rows.map(([l, v], i) => {
    v = fmt(v); const dots = ".".repeat(Math.max(2, 44 - l.length - v.length - 2));
    return `<text class="row" style="animation-delay:${(0.1 * (i + 1)).toFixed(1)}s" x="22" y="${88 + 22 * i}" xml:space="preserve">${esc(l)} <tspan fill="#4a3d1c">${dots}</tspan> <tspan class="val">${v}</tspan></text>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="250" viewBox="0 0 420 250">
  <style>
    text { font-family: ${MONO}; }
    .row { fill: #e8e0c8; font-size: 13px; animation: in .5s ease-out both; }
    .val { fill: #ffb000; font-weight: 700; }
    @keyframes in { from { opacity: 0; transform: translateX(-8px); } }
    .blink { animation: blink 1.1s steps(1) infinite; } @keyframes blink { 50% { opacity: 0; } }
  </style>
  ${chrome(420, 250, "pilot logbook · last 12 months")}
  <text x="22" y="58" font-size="13" fill="#7a6430">$ <tspan fill="#ffb000">logbook</tspan> --summary<tspan class="blink" fill="#ffb000"> █</tspan></text>
  ${lines}
</svg>`;
}

// ───────────── fuel gauges (languages) ─────────────
function fuel(s) {
  const langs = s.topLangs.length ? s.topLangs : [{ name: "no data yet", color: "#555", pct: 0 }];
  const xs = langs.length === 1 ? [210] : langs.length === 2 ? [130, 290] : [78, 210, 342];
  const gauges = langs.map((l, i) => {
    const a = -90 + l.pct * 1.8, rad = a * Math.PI / 180;
    const ex = (44 * Math.sin(rad)).toFixed(1), ey = (-44 * Math.cos(rad)).toFixed(1);
    const name = l.name.length > 12 ? l.name.slice(0, 11) + "…" : l.name;
    return `<g transform="translate(${xs[i]},150)">
    <use href="#dial"/>
    ${l.pct > 0 ? `<path d="M-44 0 A44 44 0 0 1 ${ex} ${ey}" fill="none" stroke="${l.color}" stroke-width="8" stroke-linecap="round"/>` : ""}
    <g transform="rotate(${a.toFixed(1)})"><line class="needle" style="--from:${(-90 - a).toFixed(1)}deg;animation-delay:${i * 0.25}s, ${1.6 + i * 0.25}s" x1="0" y1="0" x2="0" y2="-38" stroke="#ffb000" stroke-width="2.5" stroke-linecap="round"/></g>
    <circle r="5" fill="#ffb000"/>
    <text y="40" class="pct" fill="${l.color}">${l.pct}%</text>
    <text y="60" class="lbl">${esc(name)}</text>
  </g>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="250" viewBox="0 0 420 250">
  <style>
    text { font-family: ${MONO}; }
    .lbl { fill: #e8e0c8; font-size: 12px; text-anchor: middle; }
    .pct { font-size: 15px; font-weight: 700; text-anchor: middle; }
    .needle { transform-box: fill-box; transform-origin: 50% 100%;
      animation: sweep 1.6s cubic-bezier(.3,1.4,.5,1) both, idle 3.2s ease-in-out infinite; }
    @keyframes sweep { from { transform: rotate(var(--from)); } }
    @keyframes idle { 0%,100% { transform: rotate(0); } 30% { transform: rotate(2.5deg); } 65% { transform: rotate(-1.5deg); } }
    .low { animation: low 1.4s ease-in-out infinite; } @keyframes low { 50% { opacity: .25; } }
  </style>
  ${chrome(420, 250, "fuel · languages by bytes")}
  <text x="22" y="58" font-size="13" fill="#7a6430">$ <tspan fill="#ffb000">fuel</tspan> --tanks</text>
  <defs>
    <g id="dial">
      <path d="M-44 0 A44 44 0 0 1 44 0" fill="none" stroke="#222" stroke-width="8" stroke-linecap="round"/>
      <path class="low" d="M-44 0 A44 44 0 0 1 -38 -22" fill="none" stroke="#ff5f56" stroke-width="8" stroke-linecap="round" opacity=".7"/>
      <g stroke="#555" stroke-width="1.5">
        <line x1="-36" y1="0" x2="-30" y2="0"/><line x1="0" y1="-36" x2="0" y2="-30"/><line x1="36" y1="0" x2="30" y2="0"/>
        <line x1="-25.5" y1="-25.5" x2="-21" y2="-21"/><line x1="25.5" y1="-25.5" x2="21" y2="-21"/>
      </g>
      <text x="-40" y="16" font-size="10" fill="#7a6430" text-anchor="middle">E</text>
      <text x="40" y="16" font-size="10" fill="#7a6430" text-anchor="middle">F</text>
    </g>
  </defs>
  ${gauges}
</svg>`;
}

// ───────────── radar (contributions) ─────────────
function radar(s) {
  const cx = 210, cy = 235, R = 165, T = 4; // T = seconds per sweep
  const n = s.days.length;
  const polar = (deg, r) => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
  // month ticks: angle where each month starts (clockwise from 12 o'clock = 12 months ago)
  const ticks = []; let lastM = -1;
  s.days.forEach((d, i) => {
    const m = +d.date.slice(5, 7) - 1;
    if (m !== lastM) {
      lastM = m; const deg = (i / n) * 360;
      if (deg > 345) return;
      const [x1, y1] = polar(deg, R - 6), [x2, y2] = polar(deg, R), [tx, ty] = polar(deg + 4, R + 18);
      ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2f7a4a"/><text x="${tx.toFixed(0)}" y="${(ty + 4).toFixed(0)}" class="m">${MONTHS[m]}</text>`);
    }
  });
  const max = Math.max(1, ...s.days.map(d => d.contributionCount));
  const blips = s.days.map((d, i) => {
    if (!d.contributionCount) return "";
    const deg = (i / n) * 360, r = 28 + hash(d.date) * (R - 44);
    const [x, y] = polar(deg, r), size = 2.5 + (d.contributionCount / max) * 4.5;
    const delay = ((deg / 360) * T).toFixed(2);
    return `<g class="blip" style="animation-delay:${delay}s"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="#3cff7a"/><circle class="ring" style="animation-delay:${delay}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="none" stroke="#3cff7a"/></g>`;
  }).join("");
  // beam: wedge whose leading edge points to 12 o'clock, trailing 45° behind
  const [ax, ay] = polar(0, R), [bx, by] = polar(-45, R);
  const tag = s.login.toUpperCase().slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="430" viewBox="0 0 860 430">
  <style>
    text { font-family: ${MONO}; }
    .m { font-size: 10px; fill: #2f7a4a; text-anchor: middle; }
    .sweep { transform-origin: ${cx}px ${cy}px; animation: spin ${T}s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .blip { opacity: .2; animation: flash ${T}s linear infinite; }
    @keyframes flash { 0% { opacity: 1; } 10% { opacity: 1; } 100% { opacity: .2; } }
    .ring { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ring ${T}s ease-out infinite; }
    @keyframes ring { 0% { transform: scale(1); opacity: .9; } 25% { transform: scale(3.5); opacity: 0; } 100% { opacity: 0; } }
    .k { fill: #9fc9a8; font-size: 13px; } .v { fill: #3cff7a; font-weight: 700; }
    .blink { animation: blink 1.1s steps(1) infinite; } @keyframes blink { 50% { opacity: 0; } }
  </style>
  <defs>
    <radialGradient id="scope"><stop offset="0" stop-color="#0d2414"/><stop offset="1" stop-color="#07110a"/></radialGradient>
    <linearGradient id="beam" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#3cff7a" stop-opacity=".5"/><stop offset="1" stop-color="#3cff7a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${chrome(860, 430, "approach radar · contributions, last 12 months", { bg: "#070b08", bar: "#0b140d", line: "#163a22", ink: "#2f7a4a" })}
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#scope)" stroke="#1d5a32"/>
  ${[1, 2, 3].map(k => `<circle cx="${cx}" cy="${cy}" r="${(R * k / 4).toFixed(0)}" fill="none" stroke="#163f25"/>`).join("")}
  <line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#163f25"/><line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#163f25"/>
  ${ticks.join("")}
  ${blips}

  <!-- a traffic contact drifting across the scope -->
  <g>
    <path d="${PLANE}" transform="scale(.45)" fill="#39d0ff"/>
    <animateMotion path="M${cx - R + 20} ${cy + 70} L${cx + R - 30} ${cy - 90}" rotate="auto" dur="26s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="26s" repeatCount="indefinite"/>
  </g>
  <g>
    <text x="10" y="-8" font-size="9" fill="#39d0ff">${esc(tag)} FL350</text>
    <animateMotion path="M${cx - R + 20} ${cy + 70} L${cx + R - 30} ${cy - 90}" dur="26s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="26s" repeatCount="indefinite"/>
  </g>

  <g class="sweep">
    <path d="M${cx} ${cy} L${bx.toFixed(1)} ${by.toFixed(1)} A${R} ${R} 0 0 1 ${ax.toFixed(1)} ${ay.toFixed(1)} Z" fill="url(#beam)"/>
    <line x1="${cx}" y1="${cy}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#3cff7a" stroke-width="1.5"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="3" fill="#3cff7a"/>

  <g transform="translate(450,110)">
    <text class="k" fill="#2f7a4a" style="fill:#2f7a4a">$ <tspan class="v">radar</tspan> --contacts<tspan class="v blink"> █</tspan></text>
    ${[["contributions", fmt(s.total)], ["current streak", s.cur + "d"], ["longest streak", s.best + "d"], ["busiest month", s.busiest]]
      .map(([k, v], i) => `<text y="${40 + i * 26}" class="k" xml:space="preserve">${k} ${".".repeat(19 - k.length)} <tspan class="v">${v}</tspan></text>`).join("\n    ")}
    <text y="160" font-size="11" fill="#2f7a4a">one blip = one day you contributed</text>
    <text y="178" font-size="11" fill="#2f7a4a">bigger blip = busier day · 12 o'clock = a year ago</text>
    <text y="222" class="k">tower: <tspan class="v">"${s.cur ? "cleared for takeoff" : "hold short, awaiting commits"}"</tspan></text>
  </g>
</svg>`;
}

// ───────────── boarding passes (repos) ─────────────
function wrap(text, width) {
  const out = []; let line = "";
  for (const w of (text || "No description yet.").split(/\s+/)) {
    if ((line + " " + w).trim().length > width) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  out.push(line);
  if (out.length > 2) { out.length = 2; out[1] = out[1].slice(0, width - 1) + "…"; }
  return out;
}
function pass(r, i, login) {
  const code = (r.name.replace(/[^a-z0-9]/gi, "").toUpperCase() + "XXX").slice(0, 3);
  const [d1, d2 = ""] = wrap(r.description, 44);
  const lang = r.primaryLanguage || { name: "—", color: "#555" };
  let x = 326, bars = "";
  for (let k = 0; x < 404; k++) { const w = 1 + Math.floor(hash(r.name + k) * 3); bars += `<rect x="${x.toFixed(1)}" y="128" width="${w}" height="40"/>`; x += w + 1.6; }
  const name = r.name.length > 26 ? r.name.slice(0, 25) + "…" : r.name;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="190" viewBox="0 0 420 190">
  <style>
    text { font-family: ${MONO}; }
    .k { fill: #7a6430; font-size: 9px; letter-spacing: 1.5px; }
    .v { fill: #e8e0c8; font-size: 13px; font-weight: 700; }
    .card { animation: slide .7s ${i * 0.15}s ease-out both; } @keyframes slide { from { opacity: 0; transform: translateY(8px); } }
    .fly { animation: fly 3.5s ease-in-out infinite; } @keyframes fly { 0% { transform: translateX(0); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(66px); opacity: 0; } }
    .scan { animation: scan 2.6s ease-in-out infinite; } @keyframes scan { 0%,100% { transform: translateY(0); } 50% { transform: translateY(38px); } }
  </style>
  <g class="card">
    <rect x="1" y="1" width="418" height="188" rx="10" fill="#0b0b0b" stroke="#3a2f12"/>
    <path d="M11 1 H409 a10 10 0 0 1 10 10 V29 H1 V11 a10 10 0 0 1 10 -10 Z" fill="#ffb000"/>
    <text x="16" y="20" font-size="11" font-weight="700" fill="#0b0b0b" letter-spacing="2">BOARDING PASS</text>
    <text x="404" y="20" font-size="11" font-weight="700" fill="#0b0b0b" text-anchor="end">GH AIR · ${esc(login.toUpperCase().slice(0, 14))}</text>
    <line x1="312" y1="34" x2="312" y2="184" stroke="#3a2f12" stroke-dasharray="3 4"/>
    <circle cx="312" cy="29" r="6" fill="#0d1117"/><circle cx="312" cy="190" r="6" fill="#0d1117"/>

    <text x="16" y="58" font-size="22" font-weight="700" fill="#ffb000">DEV</text>
    <line x1="80" y1="50" x2="164" y2="50" stroke="#7a6430" stroke-dasharray="3 3"/>
    <g class="fly"><path d="${PLANE}" transform="translate(88,50) scale(.6)" fill="#ffb000"/></g>
    <text x="172" y="58" font-size="22" font-weight="700" fill="#ffb000">${code}</text>

    <text x="16" y="84" class="k">REPOSITORY</text>
    <text x="16" y="100" font-size="13" font-weight="700" fill="#39d0ff">${esc(name)}</text>
    <text x="16" y="122" font-size="11" fill="#b8ad90">${esc(d1)}</text>
    <text x="16" y="137" font-size="11" fill="#b8ad90">${esc(d2)}</text>
    <circle cx="21" cy="164" r="5" fill="${lang.color || "#555"}"/>
    <text x="32" y="168" font-size="11" fill="#e8e0c8">${esc(lang.name)}</text>

    <text x="326" y="54" class="k">STARS</text><text x="326" y="70" class="v">${fmt(r.stargazerCount)}</text>
    <text x="372" y="54" class="k">FORKS</text><text x="372" y="70" class="v">${fmt(r.forkCount)}</text>
    <text x="326" y="94" class="k">GATE</text><text x="326" y="110" class="v">${String.fromCharCode(65 + i)}${i + 1}</text>
    <g fill="#e8e0c8">${bars}</g>
    <rect class="scan" x="322" y="127" width="86" height="2" fill="#ff5f56" opacity=".8"/>
  </g>
</svg>`;
}
function emptyPass(i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="190" viewBox="0 0 420 190">
  <rect x="1" y="1" width="418" height="188" rx="10" fill="#0b0b0b" stroke="#3a2f12" stroke-dasharray="4 4"/>
  <text x="210" y="100" font-family='${MONO}' font-size="13" fill="#7a6430" text-anchor="middle">gate ${String.fromCharCode(65 + i)}${i + 1} · awaiting next departure</text>
</svg>`;
}

// ───────────── footer: METAR ticker ─────────────
function footer(s) {
  const now = new Date();
  const z = `${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}Z`;
  const msg = `METAR ZZZZ ${z} CAVOK · commits ${fmt(s.commits)} · stars ${fmt(s.stars)} · streak ${s.cur}d · updated ${now.toISOString().slice(0, 10)} · NOSIG ·   `;
  const w = Math.round(msg.length * 7.25);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="56" viewBox="0 0 860 56">
  <style>
    text { font-family: ${MONO}; }
    .blink { animation: b 1.1s steps(1) infinite; } @keyframes b { 50% { opacity: 0; } }
    .scroll { animation: s ${Math.round(w / 40)}s linear infinite; } @keyframes s { to { transform: translateX(-${w}px); } }
  </style>
  <defs><clipPath id="c"><rect x="190" y="0" width="650" height="56"/></clipPath></defs>
  <rect x="1" y="1" width="858" height="54" rx="10" fill="#0b0b0b" stroke="#3a2f12"/>
  <text x="22" y="33" font-size="14" fill="#ffb000">$ shutdown <tspan class="blink">█</tspan></text>
  <g clip-path="url(#c)"><g class="scroll" font-size="12" fill="#7a6430">
    <text x="200" y="33" xml:space="preserve">${esc(msg)}</text><text x="${200 + w}" y="33" xml:space="preserve">${esc(msg)}</text>
  </g></g>
</svg>`;
}

// ───────────── run ─────────────
const mock = process.argv.includes("--mock");
const login = process.argv.slice(2).find(a => !a.startsWith("--")) || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
if (!mock && (!login || !token)) { console.error("usage: GITHUB_TOKEN=… node scripts/build.mjs <username>   (or --mock)"); process.exit(1); }

const s = summarise(mock ? mockData() : await fetchData(login, token));
save("header.svg", header(s));
save("logbook.svg", logbook(s));
save("fuel.svg", fuel(s));
save("radar.svg", radar(s));
for (let i = 0; i < CONFIG.passes; i++) save(`pass-${i + 1}.svg`, s.featured[i] ? pass(s.featured[i], i, s.login) : emptyPass(i));
save("footer.svg", footer(s));
console.log(`built for ${s.login}: ${s.total} contributions, ${s.repoCount} repos, langs ${s.topLangs.map(l => l.name).join("/")}`);
