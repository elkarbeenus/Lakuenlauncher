// Eingebaute Themes und das Einbinden externer Themes (JSON).
import { state } from "./store.js";

export const THEME_KEYS = ["bg", "bg2", "surface", "surface2", "border", "text", "muted", "accent", "accent2"];

export const BUILTIN_THEMES = [
  { id: "nachtgarten", name: "Nachtgarten", type: "dark", colors: { bg: "#15112a", bg2: "#110d22", surface: "#1f1838", surface2: "#2a2148", border: "#352a58", text: "#f3eefc", muted: "#a79fc4", accent: "#ff6fa8", accent2: "#9b7bff" } },
  { id: "amethyst-oled", name: "Amethyst OLED", type: "dark", colors: { bg: "#000000", bg2: "#000000", surface: "#0e0b14", surface2: "#18131f", border: "#251e31", text: "#f5f0ff", muted: "#998fb0", accent: "#c28bff", accent2: "#ff7ab8" } },
  { id: "obsidian", name: "Obsidian", type: "dark", colors: { bg: "#131316", bg2: "#0f0f11", surface: "#1c1c21", surface2: "#27272e", border: "#32323a", text: "#f2f2f5", muted: "#9d9da8", accent: "#86a8ff", accent2: "#b48cff" } },
  { id: "tiefsee", name: "Tiefsee", type: "dark", colors: { bg: "#0c1a22", bg2: "#08141b", surface: "#12262f", surface2: "#1a323d", border: "#24414d", text: "#e8f6f8", muted: "#8fb3bb", accent: "#46d3cb", accent2: "#6aa8ff" } },
  { id: "glut", name: "Glut", type: "dark", colors: { bg: "#1a1310", bg2: "#140e0c", surface: "#251b16", surface2: "#31241d", border: "#3e2e25", text: "#fbefe6", muted: "#bfa596", accent: "#ff9a4d", accent2: "#ff6f7d" } },
  { id: "waldlicht", name: "Waldlicht", type: "dark", colors: { bg: "#111712", bg2: "#0d120e", surface: "#19211a", surface2: "#222d24", border: "#2d3b2f", text: "#eef5ee", muted: "#9fb3a1", accent: "#a3d47f", accent2: "#e6c25a" } },
  { id: "morgentau", name: "Morgentau", type: "light", colors: { bg: "#f6f3fb", bg2: "#ece6f6", surface: "#ffffff", surface2: "#efe9f8", border: "#ddd3ec", text: "#1e1830", muted: "#6b6385", accent: "#d6417f", accent2: "#6c4dff" } },
  { id: "kirschbluete", name: "Kirschblüte", type: "light", colors: { bg: "#fdf4f7", bg2: "#f7e5ed", surface: "#ffffff", surface2: "#fbeef3", border: "#f0d3df", text: "#2a1520", muted: "#82606f", accent: "#d14a83", accent2: "#9b59d0" } },
  { id: "nebel", name: "Nebel", type: "light", colors: { bg: "#f2f4f7", bg2: "#e6eaf0", surface: "#ffffff", surface2: "#edf0f4", border: "#d5dbe3", text: "#161b22", muted: "#5d6876", accent: "#2f6fe4", accent2: "#0f9f9f" } },
];

export const ACCENTS = ["#ff6fa8", "#c28bff", "#86a8ff", "#46d3cb", "#a3d47f", "#ffd36b", "#ff9a4d", "#ff5d6c"];

/** Wandelt eine externe Theme-Datei in das interne Format. */
export function parseExternal(file, content) {
  try {
    const t = JSON.parse(content);
    if (!t || typeof t.name !== "string" || typeof t.colors !== "object") return null;
    const type = t.type === "light" ? "light" : "dark";
    const base = BUILTIN_THEMES.find((b) => b.id === (type === "light" ? "morgentau" : "nachtgarten"));
    const colors = { ...base.colors };
    for (const k of THEME_KEYS) if (isColor(t.colors[k])) colors[k] = t.colors[k];
    return { id: "ext:" + file, name: t.name, author: t.author || "", type, colors, external: true, file };
  } catch {
    return null;
  }
}

function isColor(v) {
  return typeof v === "string" && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(v.trim());
}

export function allThemes() {
  return [...BUILTIN_THEMES, ...state.externalThemes];
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function applyTheme() {
  const s = state.settings;
  const theme = allThemes().find((t) => t.id === s.theme) || BUILTIN_THEMES[0];
  const root = document.documentElement;
  const colors = { ...theme.colors };
  if (s.accent) colors.accent = s.accent;
  for (const k of THEME_KEYS) root.style.setProperty("--" + k, colors[k]);
  root.style.setProperty("--accent-text", luminance(colors.accent) > 0.45 ? "#160f1c" : "#ffffff");
  root.dataset.mode = theme.type;
  root.dataset.motion = s.reduceMotion ? "reduced" : "full";
  root.style.setProperty("--card", (s.cardSize || 176) + "px");
}
