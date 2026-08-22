"use client";
import { TITLES } from "@/lib/nav";

// Shown for views not yet ported to real React. Keeps the shell whole and
// the nav working while the migration proceeds view-by-view.
export default function Placeholder({ view }) {
  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Migración en curso</div>
          <h1>{TITLES[view] || view}</h1>
          <p>
            This view is being ported from the prototype into real React
            components. The shell, navigation and design system are live — this
            screen is next in the queue.
          </p>
        </div>
      </div>
      <div className="empty" style={{ marginTop: 24 }}>
        <div className="ic">○</div>
        <h4>Being built in React</h4>
        <p>“{TITLES[view] || view}” is next in the migration queue.</p>
      </div>
    </section>
  );
}
