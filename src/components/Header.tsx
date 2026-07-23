import {
  Github,
  LibraryBig,
  Moon,
  Orbit,
  Sparkles,
  Sun,
} from "lucide-react";

export type AppView = "generate" | "explore" | "library" | "favorites" | "about";

interface HeaderProps {
  view: AppView;
  theme: "dark" | "light";
  favoriteCount: number;
  onViewChange: (view: AppView) => void;
  onThemeToggle: () => void;
}

const navItems: { id: AppView; label: string; icon: typeof Sparkles }[] = [
  { id: "generate", label: "生成", icon: Sparkles },
  { id: "explore", label: "图谱", icon: Orbit },
  { id: "library", label: "词库", icon: LibraryBig },
  { id: "favorites", label: "收藏", icon: Sparkles },
];

export function Header({
  view,
  theme,
  favoriteCount,
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
          <small>游戏灵感工作台</small>
        </span>
      </button>

      <nav className="main-nav" aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => onViewChange(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            {id === "favorites" && favoriteCount > 0 ? (
              <em>{favoriteCount}</em>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="header-actions">
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

