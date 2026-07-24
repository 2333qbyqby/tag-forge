import { ArrowUpRight, Binary, Database, Github, Shuffle } from "lucide-react";
import { DATA_VERSION, compiledData, prompts } from "../data";

export default function AboutView() {
  return (
    <main className="view-shell about-view">
      <header className="view-hero">
        <span className="eyebrow">ABOUT / ENGINE 2</span>
        <h1>它只点燃第一簇火花，把最有价值的联想留给你。</h1>
        <p>
          TagForge 面向独立开发者和 Game Jam 团队，通过两个基础方向与一个独立开放命题，
          给出可以继续想象的创意起点。它完全在浏览器中运行，不上传生成历史。
        </p>
      </header>

      <section className="about-grid">
        <article className="panel">
          <Shuffle size={22} />
          <span className="eyebrow">01 / TWO MODES</span>
          <h2>逐词或直接接受挑战</h2>
          <p>
            逐词模式让两个基础方向分别抽取与锁定；挑战模式一次给出两个方向和一个开放命题。
          </p>
        </article>
        <article className="panel">
          <Binary size={22} />
          <span className="eyebrow">02 / INDEPENDENT</span>
          <h2>命题与方向互不迎合</h2>
          <p>
            基础方向会过滤同义、冗余与硬冲突；命题使用独立随机流，不参与方向评分。
          </p>
        </article>
        <article className="panel">
          <Database size={22} />
          <span className="eyebrow">03 / OPEN</span>
          <h2>只展示关键词</h2>
          <p>
            产品不补写角色、世界观或玩法答案。如何连接这些词，正是创作过程的一部分。
          </p>
        </article>
      </section>

      <section className="algorithm-card panel">
        <div>
          <span className="eyebrow">ALGORITHM PIPELINE</span>
          <h2>一次生成如何发生</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>选择基础配方</strong>
              <p>按固定比例选取“类型 × 机制”等五组基础方向配方。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>过滤与加权</strong>
              <p>拒绝同家族、冗余和硬冲突，并降低近期重复与软冲突的权重。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>独立抽取命题</strong>
              <p>命题只考虑自身权重、近期冷却及类型与家族平衡。</p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <strong>保留你的选择</strong>
              <p>锁定的部分不变，单独重抽也不会扰动无关随机分支。</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="dataset-card panel">
        <div>
          <span className="eyebrow">DATA SNAPSHOT</span>
          <h2>{DATA_VERSION}</h2>
        </div>
        <div className="dataset-stats">
          <span>
            <strong>{compiledData.tags.length}</strong> Tag 节点
          </span>
          <span>
            <strong>{prompts.length}</strong> 开放命题
          </span>
          <span>
            <strong>{compiledData.relations.length}</strong> 显式关系
          </span>
          <span>
            <strong>0</strong> 运行时请求
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
            Global Game Jam History <ArrowUpRight size={14} />
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
