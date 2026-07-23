import { ArrowUpRight, Binary, Database, Github, Shuffle } from "lucide-react";
import { DATA_VERSION, compiledData } from "../data";

export default function AboutView() {
  return (
    <main className="view-shell about-view">
      <header className="view-hero">
        <span className="eyebrow">ABOUT / ENGINE 1</span>
        <h1>它制造意外，不替你判断好坏。</h1>
        <p>
          TagForge 是一个由轻量关系图辅助的类型化组合生成器。它完全在浏览器运行，
          不接入 LLM，也不向服务器发送你的生成历史。
        </p>
      </header>

      <section className="about-grid">
        <article className="panel">
          <Shuffle size={22} />
          <span className="eyebrow">01 / SAMPLE</span>
          <h2>类型化加权采样</h2>
          <p>每个模式先确定槽位，再根据已选 Tag 动态调整下一个词的概率。</p>
        </article>
        <article className="panel">
          <Binary size={22} />
          <span className="eyebrow">02 / GRAPH</span>
          <h2>关系图调权</h2>
          <p>强关联提高连贯性，创意反差随惊喜程度增加，硬冲突永远过滤。</p>
        </article>
        <article className="panel">
          <Database size={22} />
          <span className="eyebrow">03 / RANK</span>
          <h2>多候选随机选优</h2>
          <p>每次生成 96 个候选，从前 12 名中按温度随机挑选，避免答案固化。</p>
        </article>
      </section>

      <section className="algorithm-card panel">
        <div>
          <span className="eyebrow">ALGORITHM PIPELINE</span>
          <h2>一次点击发生了什么</h2>
        </div>
        <ol>
          <li><span>01</span><div><strong>选择模板</strong><p>Quick、Jam、Prototype 或 Wild 确定 Tag 槽位。</p></div></li>
          <li><span>02</span><div><strong>构建 96 个候选</strong><p>使用确定性种子、上下文权重和关系边完成采样。</p></div></li>
          <li><span>03</span><div><strong>过滤与评分</strong><p>检查硬冲突、语义重复、近期相似度和项目规模。</p></div></li>
          <li><span>04</span><div><strong>随机选优</strong><p>从高分候选池再次抽样，保留可复现的不确定性。</p></div></li>
        </ol>
      </section>

      <section className="dataset-card panel">
        <div>
          <span className="eyebrow">DATA SNAPSHOT</span>
          <h2>{DATA_VERSION}</h2>
        </div>
        <div className="dataset-stats">
          <span><strong>{compiledData.tags.length}</strong> Tag 节点</span>
          <span><strong>{compiledData.relations.length}</strong> 显式关系</span>
          <span><strong>0</strong> 运行时请求</span>
        </div>
        <div className="source-links">
          <a href="https://partner.steamgames.com/doc/store/tags" target="_blank" rel="noreferrer">
            Steamworks Tags <ArrowUpRight size={14} />
          </a>
          <a href="https://globalgamejam.org/history" target="_blank" rel="noreferrer">
            Global Game Jam History <ArrowUpRight size={14} />
          </a>
          <a href="https://github.com/2333qbyqby/tag-forge" target="_blank" rel="noreferrer">
            <Github size={14} /> GitHub
          </a>
        </div>
      </section>
    </main>
  );
}

