import { ArrowUpRight, Boxes, Database, Github, Shuffle } from "lucide-react";
import type { CompiledPack } from "../packs/types";

export default function AboutView({ pack }: { pack: CompiledPack }) {
  const promptCount = pack.data.promptDecks.reduce(
    (count, deck) => count + deck.prompts.length,
    0,
  );
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
    </main>
  );
}
