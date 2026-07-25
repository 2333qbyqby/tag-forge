import {
  CheckCircle2,
  Download,
  FileArchive,
  PackageCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../components/Feedback";
import { canonicalPackJson } from "../packs/canonical";
import { importPackFile, type ImportedPack } from "../packs/importer";
import { officialAssetUrl } from "../packs/official";
import type { CompiledPack } from "../packs/types";
import {
  packStorageKey,
  type InstalledPackMeta,
} from "../storage/db";

interface Props {
  activePack: CompiledPack;
  installed: InstalledPackMeta[];
  onOpenTemporary: (imported: ImportedPack) => void | Promise<void>;
  onInstall: (imported: ImportedPack) => void | Promise<void>;
  onActivateOfficial: () => void | Promise<void>;
  onActivateInstalled: (key: string) => void | Promise<void>;
  onDeleteInstalled: (
    key: string,
    checksum: string,
    deleteHistory: boolean,
  ) => void | Promise<void>;
  onExportInstalled: (key: string) => void | Promise<void>;
  historyCountByChecksum: Record<string, number>;
  favoriteCountByChecksum: Record<string, number>;
}

function downloadPack(pack: CompiledPack) {
  const blob = new Blob(
    [`${JSON.stringify(JSON.parse(canonicalPackJson(pack.data)), null, 2)}\n`],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.data.manifest.packId}-${pack.data.manifest.dataVersion}.tagforge.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function PackManagerView({
  activePack,
  installed,
  onOpenTemporary,
  onInstall,
  onActivateOfficial,
  onActivateInstalled,
  onDeleteInstalled,
  onExportInstalled,
  historyCountByChecksum,
  favoriteCountByChecksum,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importRequestRef = useRef(0);
  const [imported, setImported] = useState<ImportedPack | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [expandedIssues, setExpandedIssues] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstalledPackMeta | null>(
    null,
  );
  const [deleteHistory, setDeleteHistory] = useState(false);

  const importedKey = imported
    ? packStorageKey({
      packId: imported.pack.manifest.packId,
      })
    : "";
  const conflict = installed.find((item) => item.key === importedKey);
  const exactInstalled = conflict?.ref.checksum === imported?.checksum;
  const activeKey =
    activePack.origin === "installed" ? packStorageKey(activePack.ref) : "";

  const readFile = async (file: File | undefined) => {
    if (!file || busy) return;
    const requestId = importRequestRef.current + 1;
    importRequestRef.current = requestId;
    setBusy(true);
    setError("");
    setExpandedIssues(false);
    try {
      const next = await importPackFile(file);
      if (requestId === importRequestRef.current) setImported(next);
    } catch (reason) {
      if (requestId === importRequestRef.current) {
        setImported(null);
        setError(reason instanceof Error ? reason.message : "无法读取数据包。");
      }
    } finally {
      if (requestId === importRequestRef.current) setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const runAction = async (key: string, action: () => void | Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(key);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "本地操作失败。");
    } finally {
      setActionBusy("");
    }
  };

  const install = async () => {
    if (!imported) return;
    await runAction("install", () => onInstall(imported));
    setOverwriteOpen(false);
  };

  const errorCount =
    imported?.report.issues.filter((issue) => issue.level === "error").length ??
    0;
  const warningCount =
    imported?.report.issues.filter((issue) => issue.level === "warning")
      .length ?? 0;

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">DATA PACKS / LOCAL FIRST</span>
        <h1>把自己的词库带进来。</h1>
        <p>文件只在当前浏览器解析，不会上传到 GitHub 或其他服务器。</p>
      </header>

      <section className="pack-manager-grid">
        <article
          className={`panel pack-dropzone ${busy ? "is-busy" : ""}`}
          onDragOver={(event) => {
            if (!busy) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) void readFile(event.dataTransfer.files[0]);
          }}
        >
          <Upload size={28} />
          <h2>{busy ? "正在校验…" : "导入本地数据包"}</h2>
          <p>支持 .tagforge.json、JSON 或 ZIP/CSV。</p>
          <button
            className="primary-compact"
            onClick={() => inputRef.current?.click()}
            disabled={busy || Boolean(actionBusy)}
          >
            选择文件
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.zip,.tagforge.json"
            hidden
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </article>

        <article className="panel active-pack-card">
          <span className="eyebrow">ACTIVE PACK</span>
          <h2>{activePack.data.manifest.name.zh}</h2>
          <p>{activePack.data.manifest.description?.zh}</p>
          <dl>
            <div>
              <dt>Entry</dt>
              <dd>{activePack.data.entries.length}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>
                {activePack.data.promptDecks.reduce(
                  (count, deck) => count + deck.prompts.length,
                  0,
                )}
              </dd>
            </div>
            <div>
              <dt>Recipe</dt>
              <dd>{activePack.data.recipes.length}</dd>
            </div>
          </dl>
          <button
            className="secondary-button"
            onClick={() => downloadPack(activePack)}
          >
            <Download size={15} /> 导出当前包
          </button>
        </article>
      </section>

      {error ? (
        <p className="panel import-error action-error" role="alert">
          {error}
        </p>
      ) : null}

      {imported ? (
        <section className="panel import-preview">
          <div>
            <PackageCheck size={23} />
            <span className="eyebrow">
              {imported.report.valid ? "VALID PACK" : "VALIDATION FAILED"}
            </span>
            <h2>{imported.pack.manifest.name.zh}</h2>
            <p>{imported.checksum}</p>
            {exactInstalled ? (
              <span className="import-status status-same">
                <CheckCircle2 size={14} /> 已安装相同内容
              </span>
            ) : conflict ? (
              <span className="import-status status-replace">
                将覆盖同 ID 的数据包
              </span>
            ) : (
              <span className="import-status">新的本地数据包</span>
            )}
          </div>
          <dl>
            {Object.entries(imported.report.summary).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="validation-summary">
            {errorCount} 个错误 · {warningCount} 个警告
          </p>
          {imported.report.issues.length > 0 ? (
            <>
              <ul className="validation-list">
                {imported.report.issues
                  .slice(0, expandedIssues ? undefined : 20)
                  .map((item, index) => (
                    <li key={`${item.code}:${index}`} className={item.level}>
                      <strong>{item.path}</strong> {item.message}
                    </li>
                  ))}
              </ul>
              {imported.report.issues.length > 20 ? (
                <button
                  className="text-button"
                  onClick={() => setExpandedIssues((current) => !current)}
                >
                  {expandedIssues
                    ? "收起"
                    : `展开其余 ${imported.report.issues.length - 20} 条`}
                </button>
              ) : null}
            </>
          ) : null}
          {imported.report.valid ? (
            <div className="pack-preview-actions">
              <button
                className="secondary-button"
                disabled={Boolean(actionBusy)}
                onClick={() =>
                  void runAction("temporary", () => onOpenTemporary(imported))
                }
              >
                临时打开
              </button>
              <button
                className="primary-compact"
                disabled={Boolean(actionBusy)}
                onClick={() =>
                  conflict && !exactInstalled
                    ? setOverwriteOpen(true)
                    : void install()
                }
              >
                {actionBusy === "install"
                  ? "正在安装…"
                  : exactInstalled
                    ? "重新打开已安装包"
                    : conflict
                      ? "确认覆盖"
                      : "安装到浏览器"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel installed-packs">
        <div className="section-heading">
          <div>
            <span className="eyebrow">INSTALLED</span>
            <h2>可用数据包</h2>
          </div>
          <button
            className="secondary-button"
            disabled={activePack.origin === "official" || Boolean(actionBusy)}
            onClick={() =>
              void runAction("official", () => onActivateOfficial())
            }
          >
            {activePack.origin === "official" ? "正在使用官方数据集" : "切换到官方数据集"}
          </button>
        </div>
        <div className="installed-pack-list">
          {installed.map((item) => {
            const active =
              activeKey === item.key &&
              activePack.ref.checksum === item.ref.checksum;
            return (
              <article key={item.key} className={active ? "is-active" : ""}>
                <button
                  disabled={active || Boolean(actionBusy)}
                  onClick={() =>
                    void runAction(item.key, () =>
                      onActivateInstalled(item.key),
                    )
                  }
                >
                  <FileArchive size={18} />
                  <span>
                    <strong>
                      {item.name.zh} {active ? "· 当前" : ""}
                    </strong>
                    <small>
                      数据更新 {item.ref.dataVersion} · {item.ref.checksum.slice(0, 10)} ·{" "}
                      {new Date(item.installedAt).toLocaleDateString("zh-CN")}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  disabled={Boolean(actionBusy)}
                  onClick={() =>
                    void runAction(`export:${item.key}`, () =>
                      onExportInstalled(item.key),
                    )
                  }
                  aria-label={`导出数据包 ${item.name.zh}`}
                >
                  <Download size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={Boolean(actionBusy)}
                  onClick={() => {
                    setDeleteHistory(false);
                    setDeleteTarget(item);
                  }}
                  aria-label={`删除数据包 ${item.name.zh}`}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            );
          })}
          {installed.length === 0 ? <p>还没有安装用户数据包。</p> : null}
        </div>
      </section>

      <section className="template-links">
        <span>下载模板：</span>
        <a href={officialAssetUrl("templates/minimal-collision.tagforge.json")}>
          极简 JSON
        </a>
        <a href={officialAssetUrl("templates/minimal-collision.zip")}>
          ZIP / CSV
        </a>
        <a href={officialAssetUrl("templates/game-jam.tagforge.json")}>
          Game Jam
        </a>
        <a href={officialAssetUrl("templates/multi-deck.tagforge.json")}>
          多卡组
        </a>
      </section>

      <ConfirmDialog
        open={overwriteOpen}
        title="覆盖已安装的数据包？"
        description={`同一个 ${importedKey} 已存在，但 checksum 不同。旧历史和收藏会按原 checksum 保留，旧生成设置会被重置。`}
        confirmLabel="覆盖并打开"
        destructive
        onCancel={() => setOverwriteOpen(false)}
        onConfirm={install}
      >
        <dl className="checksum-compare">
          <div>
            <dt>当前</dt>
            <dd>{conflict?.ref.checksum}</dd>
          </div>
          <div>
            <dt>导入</dt>
            <dd>{imported?.checksum}</dd>
          </div>
        </dl>
        <dl className="pack-summary-compare">
          <div>
            <dt>当前内容</dt>
            <dd>
              {conflict?.summary
                ? `${conflict.summary.entries} Entry · ${conflict.summary.prompts} Prompt · ${conflict.summary.recipes} Recipe`
                : "旧记录未包含内容统计"}
            </dd>
          </div>
          <div>
            <dt>导入内容</dt>
            <dd>
              {imported
                ? `${imported.report.summary.entries} Entry · ${imported.report.summary.prompts} Prompt · ${imported.report.summary.recipes} Recipe`
                : "—"}
            </dd>
          </div>
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除 ${deleteTarget?.name.zh ?? "数据包"}？`}
        description={`数据包文件和生成设置将被删除。${favoriteCountByChecksum[deleteTarget?.ref.checksum ?? ""] ?? 0} 条收藏快照始终保留。`}
        confirmLabel="删除数据包"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await runAction(`delete:${deleteTarget.key}`, () =>
            onDeleteInstalled(
              deleteTarget.key,
              deleteTarget.ref.checksum,
              deleteHistory,
            ),
          );
          setDeleteTarget(null);
        }}
      >
        <label className="dialog-checkbox">
          <input
            type="checkbox"
            checked={deleteHistory}
            onChange={(event) => setDeleteHistory(event.target.checked)}
          />
          同时删除这个 checksum 的历史记录
          （{historyCountByChecksum[deleteTarget?.ref.checksum ?? ""] ?? 0} 条）
        </label>
      </ConfirmDialog>
    </main>
  );
}
