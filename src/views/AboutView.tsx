import { ArrowUpRight, Boxes, Database, Github, Shuffle } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../components/Feedback";
import type { CompiledPack } from "../packs/types";
import type { LocalDataSummary } from "../storage/db";

interface Props {
  pack: CompiledPack;
  summary: LocalDataSummary;
  sessionHistoryCount: number;
  onClearAllHistory: () => void | Promise<void>;
  onResetSettings: () => void | Promise<void>;
  onExportBackup: () => void | Promise<void>;
  onClearAllLocalData: () => void | Promise<void>;
}

export default function AboutView({
  pack,
  summary,
  sessionHistoryCount,
  onClearAllHistory,
  onResetSettings,
  onExportBackup,
  onClearAllLocalData,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState("");
  const promptCount = pack.data.promptDecks.reduce(
    (count, deck) => count + deck.prompts.length,
    0,
  );
  const run = async (action: () => void | Promise<void>) => {
    setActionError("");
    try {
      await action();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "本地数据操作失败。",
      );
    }
  };
  return (
    <main className="view-shell about-view">
      <header className="view-hero">
        <span className="eyebrow">ABOUT / DATA PACK ENGINE</span>
        <h1>数据属于用户，生成留在浏览器。</h1>
        <p>
          TagForge 是部署在 GitHub Pages 的纯静态灵感生成器。官方包和用户包走同一套
          Schema、校验、Recipe 与 Seed 引擎，用户文件不会上传到服务器。
        </p>
      </header>
      <section className="about-grid">
        <article className="panel">
          <Shuffle size={22} />
          <span className="eyebrow">01 / RECIPE</span>
          <h2>配方定义组合方式</h2>
          <p>Category 决定槽位池，Family 与 Composite 防止明显重复。</p>
        </article>
        <article className="panel">
          <Boxes size={22} />
          <span className="eyebrow">02 / LOCAL PACKS</span>
          <h2>导入自己的数据</h2>
          <p>JSON 或 ZIP/CSV 在本地校验，可临时打开或安装到 IndexedDB。</p>
        </article>
        <article className="panel">
          <Database size={22} />
          <span className="eyebrow">03 / NO RELATION</span>
          <h2>生成不判断“正确搭配”</h2>
          <p>Facet 只负责发现和官方分析，陌生碰撞由用户继续想象。</p>
        </article>
      </section>
      <section className="dataset-card panel">
        <div>
          <span className="eyebrow">ACTIVE PACK</span>
          <h2>{pack.data.manifest.name.zh}</h2>
          <p>{pack.ref.checksum}</p>
        </div>
        <div className="dataset-stats">
          <span>
            <strong>{pack.data.entries.length}</strong> Entry
          </span>
          <span>
            <strong>{promptCount}</strong> Prompt
          </span>
          <span>
            <strong>{pack.data.recipes.length}</strong> Recipe
          </span>
          <span>
            <strong>0</strong> 运行时 API
          </span>
        </div>
        <div className="source-links">
          <a
            href="https://partner.steamgames.com/doc/store/tags"
            target="_blank"
            rel="noreferrer"
          >
            Steamworks Tags <ArrowUpRight size={14} />
          </a>
          <a
            href="https://globalgamejam.org/history"
            target="_blank"
            rel="noreferrer"
          >
            Global Game Jam <ArrowUpRight size={14} />
          </a>
          <a
            href="https://github.com/2333qbyqby/tag-forge"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={14} /> GitHub
          </a>
        </div>
      </section>
      <section className="panel local-data-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LOCAL DATA MANAGEMENT</span>
            <h2>当前浏览器中的 TagForge 数据</h2>
          </div>
          <Database size={22} />
        </div>
        <div className="local-data-stats">
          <span>
            <strong>{summary.installedPacks}</strong> 已安装包
          </span>
          <span>
            <strong>{summary.history}</strong> 持久历史
          </span>
          <span>
            <strong>{sessionHistoryCount}</strong> 会话历史
          </span>
          <span>
            <strong>{summary.favorites}</strong> 收藏
          </span>
          <span>
            <strong>{summary.settings}</strong> 设置项
          </span>
        </div>
        <p>
          临时数据包及其会话历史不会写入 IndexedDB，也不会进入备份文件。
        </p>
        {actionError ? (
          <p className="import-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="local-data-actions">
          <button className="secondary-button" onClick={() => void run(onExportBackup)}>
            导出本地备份
          </button>
          <button className="secondary-button" onClick={() => void run(onResetSettings)}>
            重置当前包设置
          </button>
          <button className="secondary-button" onClick={() => setHistoryOpen(true)}>
            清空全部历史
          </button>
          <button className="danger-button" onClick={() => setClearOpen(true)}>
            清除全部本地生成数据
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={historyOpen}
        title="清空全部历史？"
        description={`将删除 ${summary.history} 条持久历史和 ${sessionHistoryCount} 条会话历史。收藏不会受到影响。`}
        confirmLabel="清空全部历史"
        destructive
        onCancel={() => setHistoryOpen(false)}
        onConfirm={async () => {
          await onClearAllHistory();
          setHistoryOpen(false);
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        title="清除全部本地生成数据？"
        description="将删除安装包、设置、历史、收藏和旧迁移数据。主题偏好会保留。此操作无法撤销。"
        confirmLabel="永久清除"
        confirmDisabled={confirmation !== "清除"}
        destructive
        onCancel={() => {
          setClearOpen(false);
          setConfirmation("");
        }}
        onConfirm={async () => {
          if (confirmation !== "清除") return;
          await onClearAllLocalData();
          setConfirmation("");
          setClearOpen(false);
        }}
      >
        <button className="secondary-button" onClick={() => void run(onExportBackup)}>
          先导出备份
        </button>
        <label className="destructive-confirm-field">
          输入“清除”以确认
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        {confirmation && confirmation !== "清除" ? (
          <small className="import-error">确认文字不匹配。</small>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}
