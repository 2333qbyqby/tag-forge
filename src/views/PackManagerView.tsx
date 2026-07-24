import { Download, FileArchive, PackageCheck, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { canonicalPackJson } from "../packs/canonical";
import { importPackFile, type ImportedPack } from "../packs/importer";
import { officialAssetUrl } from "../packs/official";
import type { CompiledPack } from "../packs/types";
import type { InstalledPackMeta } from "../storage/db";

interface Props {
  activePack: CompiledPack;
  installed: InstalledPackMeta[];
  onOpenTemporary: (imported: ImportedPack) => void;
  onInstall: (imported: ImportedPack) => void;
  onActivateOfficial: () => void;
  onActivateInstalled: (key: string) => void;
  onDeleteInstalled: (key: string) => void;
}

export default function PackManagerView({
  activePack,
  installed,
  onOpenTemporary,
  onInstall,
  onActivateOfficial,
  onActivateInstalled,
  onDeleteInstalled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportedPack | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setImported(await importPackFile(file));
    } catch (reason) {
      setImported(null);
      setError(reason instanceof Error ? reason.message : "无法读取数据包。");
    } finally {
      setBusy(false);
    }
  };

  const exportActive = () => {
    const blob = new Blob(
      [`${JSON.stringify(JSON.parse(canonicalPackJson(activePack.data)), null, 2)}\n`],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activePack.data.manifest.packId}-${activePack.data.manifest.version}.tagforge.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="view-shell">
      <header className="view-hero">
        <span className="eyebrow">DATA PACKS / LOCAL FIRST</span>
        <h1>把自己的词库带进来。</h1>
        <p>文件只在当前浏览器解析，不会上传到 GitHub 或其他服务器。</p>
      </header>

      <section className="pack-manager-grid">
        <article
          className="panel pack-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readFile(event.dataTransfer.files[0]);
          }}
        >
          <Upload size={28} />
          <h2>{busy ? "正在校验…" : "导入本地数据包"}</h2>
          <p>支持 .tagforge.json、JSON 或 ZIP/CSV。</p>
          <button
            className="primary-compact"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
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
          {error ? <p className="import-error">{error}</p> : null}
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
          <button className="secondary-button" onClick={exportActive}>
            <Download size={15} /> 导出当前包
          </button>
        </article>
      </section>

      {imported ? (
        <section className="panel import-preview">
          <div>
            <PackageCheck size={23} />
            <span className="eyebrow">
              {imported.report.valid ? "VALID PACK" : "VALIDATION FAILED"}
            </span>
            <h2>{imported.pack.manifest.name.zh}</h2>
            <p>{imported.checksum}</p>
          </div>
          <dl>
            {Object.entries(imported.report.summary).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {imported.report.issues.length > 0 ? (
            <ul className="validation-list">
              {imported.report.issues.slice(0, 20).map((item, index) => (
                <li key={`${item.code}:${index}`} className={item.level}>
                  <strong>{item.path}</strong> {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          {imported.report.valid ? (
            <div className="pack-preview-actions">
              <button
                className="secondary-button"
                onClick={() => onOpenTemporary(imported)}
              >
                临时打开
              </button>
              <button
                className="primary-compact"
                onClick={() => onInstall(imported)}
              >
                安装到浏览器
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
          <button className="secondary-button" onClick={onActivateOfficial}>
            恢复官方 V2
          </button>
        </div>
        <div className="installed-pack-list">
          {installed.map((item) => (
            <article key={item.key}>
              <button onClick={() => onActivateInstalled(item.key)}>
                <FileArchive size={18} />
                <span>
                  <strong>{item.name.zh}</strong>
                  <small>{item.ref.version}</small>
                </span>
              </button>
              <button
                className="icon-button"
                onClick={() => onDeleteInstalled(item.key)}
                aria-label="删除数据包"
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
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
    </main>
  );
}
