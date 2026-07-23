import type { GeneratorMode, GeneratorTemplate } from "./types";

export const TEMPLATES: Record<GeneratorMode, GeneratorTemplate> = {
  quick: {
    id: "quick",
    label: "快速混合",
    description: "类型、机制、主题与限制，一次得到清晰的设计起点。",
    slots: [
      { id: "mechanic", kind: "mechanic", label: "核心机制" },
      { id: "theme", kind: "theme", label: "主题" },
      { id: "genre", kind: "genre", label: "类型" },
      { id: "constraint", kind: "constraint", label: "限制" },
    ],
    selectionOrder: ["theme", "mechanic", "genre", "constraint"],
  },
  jam: {
    id: "jam",
    label: "Game Jam",
    description: "主题先行，用限制和情绪快速收敛到可做的点子。",
    slots: [
      { id: "mechanic", kind: "mechanic", label: "核心机制" },
      { id: "jamPrompt", kind: "jamPrompt", label: "Jam 主题" },
      { id: "setting", kind: "setting", label: "场景" },
      { id: "constraint", kind: "constraint", label: "限制" },
      { id: "mood", kind: "mood", label: "情绪" },
    ],
    selectionOrder: ["jamPrompt", "mechanic", "constraint", "setting", "mood"],
  },
  prototype: {
    id: "prototype",
    label: "独立原型",
    description: "双机制驱动，强调玩家目标和开发边界。",
    slots: [
      { id: "mechanic-primary", kind: "mechanic", label: "主机制" },
      { id: "mechanic-secondary", kind: "mechanic", label: "副机制" },
      { id: "genre", kind: "genre", label: "类型" },
      { id: "goal", kind: "goal", label: "玩家目标" },
      { id: "constraint", kind: "constraint", label: "限制" },
    ],
    selectionOrder: [
      "mechanic-primary",
      "goal",
      "mechanic-secondary",
      "genre",
      "constraint",
    ],
  },
  wild: {
    id: "wild",
    label: "实验混合",
    description: "提高反差与稀有组合，但仍避开真正的硬冲突。",
    slots: [
      { id: "mechanic-primary", kind: "mechanic", label: "主机制" },
      { id: "mechanic-secondary", kind: "mechanic", label: "副机制" },
      { id: "theme", kind: "theme", label: "主题" },
      { id: "setting", kind: "setting", label: "场景" },
      { id: "constraint", kind: "constraint", label: "限制" },
      { id: "presentation", kind: "presentation", label: "表现" },
    ],
    selectionOrder: [
      "theme",
      "mechanic-primary",
      "constraint",
      "mechanic-secondary",
      "setting",
      "presentation",
    ],
  },
};
