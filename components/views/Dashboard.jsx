"use client";

import TeamBrief from "@/components/TeamBrief";
import WeeklyPlan from "@/components/WeeklyPlan";

export default function Dashboard({ onNavigate }) {
  return (
    <div id="homeBody">
      <TeamBrief onNavigate={onNavigate} />

      <details className="brief-deep">
        <summary>
          <span><b>Plan comercial semanal</b><small>ventas, stock y acciones sugeridas por el engine</small></span>
          <i>↓</i>
        </summary>
        <div className="brief-deep-body"><WeeklyPlan /></div>
      </details>

      <style dangerouslySetInnerHTML={{ __html: `
        .brief-deep{margin-top:10px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.45);overflow:hidden}
        .brief-deep>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 16px;cursor:pointer}
        .brief-deep>summary::-webkit-details-marker{display:none}
        .brief-deep>summary span{display:flex;align-items:baseline;gap:9px}.brief-deep>summary b{font-size:11px}.brief-deep>summary small{font-size:11px;color:var(--ink-3)}
        .brief-deep>summary i{font-size:11px;color:var(--ink-3);font-style:normal;transition:transform .18s}.brief-deep[open]>summary i{transform:rotate(180deg)}
        .brief-deep-body{padding:14px;border-top:1px solid var(--line)}
        @media(max-width:620px){.brief-deep>summary span{align-items:flex-start;flex-direction:column;gap:2px}}
      ` }} />
    </div>
  );
}
