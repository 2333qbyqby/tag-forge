import type { TagKind } from "../engine/types";

export const KIND_LABELS: Record<TagKind, string> = {
  genre: "类型",
  mechanic: "机制",
  theme: "主题",
  setting: "场景",
  mood: "情绪",
  goal: "目标",
  constraint: "限制",
  presentation: "表现",
  perspective: "视角",
  jamPrompt: "JAM 主题",
};

export const KIND_COLORS: Record<TagKind, string> = {
  genre: "amber",
  mechanic: "acid",
  theme: "violet",
  setting: "cyan",
  mood: "violet",
  goal: "amber",
  constraint: "coral",
  presentation: "cyan",
  perspective: "amber",
  jamPrompt: "amber",
};

export function metricLevel(value: number): string {
  if (value < 0.25) return "低";
  if (value < 0.5) return "偏低";
  if (value < 0.72) return "适中";
  if (value < 0.88) return "较高";
  return "高";
}

