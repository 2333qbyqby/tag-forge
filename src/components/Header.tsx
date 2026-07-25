import {
  Boxes,
  Database,
  FlaskConical,
  Github,
  Info,
  LibraryBig,
  Moon,
  Sparkles,
  Star,
  Sun,
} from "lucide-react";
import type { PackOrigin } from "../packs/types";

export type AppView =
  | "generate"
  | "library"
  | "favorites"
  | "packs"
  | "lab"
  | "about";

interface HeaderProps {
  view: AppView;
  theme: "dark" | "light";
  favoriteCount: number;
  packName: string;
  packOrigin: PackOrigin;
  analysisEnabled: boolean;
  onViewChange: (view: AppView) => void;
  onThemeToggle: () => void;
}

const navItems: Array<{
  id: AppView;
  label: string;
  mobileLabel?: string;
  icon: typeof Sparkles;
}> = [
  { id: "generate", label: "生成", icon: Sparkles },
  { id: "library", label: "词库", icon: LibraryBig },
  { id: "favorites", label: "收藏", icon: Star },
  { id: "packs", label: "数据包", icon: Boxes },
  { id: "lab", label: "数据实验室", mobileLabel: "实验室", icon: FlaskConical },
  { id: "about", label: "关于", icon: Info },
];

const originLabels: Record<PackOrigin, string> = {
  official: "官方",
  installed: "本地",
  temporary: "临时",
};

export function Header({
  view,
  theme,
  favoriteCount,
  packName,
  packOrigin,
  analysisEnabled,
  onViewChange,
  onThemeToggle,
}: HeaderProps) {
  return (
    <header className="app-header">
      <button className="brand" onClick={() => onViewChange("generate")}>
        <span className="brand-mark" aria-hidden="true">
          TF
        </span>
        <span>
          <strong>TagForge</strong>
          <small>
            {originLabels[packOrigin]} · {packName}
          </small>
        </span>
      </button>

      <nav className="main-nav" aria-label="主导航">
        {navItems
          .filter((item) => item.id !== "lab" || analysisEnabled)
          .map(({ id, label, mobileLabel, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => onViewChange(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span data-mobile-label={mobileLabel ?? label}>{label}</span>
              {id === "favorites" && favoriteCount > 0 ? (
                <em>{favoriteCount}</em>
              ) : null}
            </button>
          ))}
      </nav>

      <div className="header-actions">
        <span className={`pack-origin-badge origin-${packOrigin}`}>
          <Database size={13} /> {originLabels[packOrigin]}
        </span>
        <button
          className="icon-button"
          onClick={onThemeToggle}
          aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <a
          className="icon-button"
          href="https://github.com/2333qbyqby/tag-forge"
          target="_blank"
          rel="noreferrer"
          aria-label="查看 GitHub 仓库"
        >
          <Github size={18} />
        </a>
      </div>
    </header>
  );
}
