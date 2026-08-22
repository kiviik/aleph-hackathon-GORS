"use client";
// "Decisión humana" — the persistent bottom bar from every reference design.
//
// It is in the chrome rather than in each screen for one reason: the product's
// rule is that a PERSON approves, and a rule that lives in a different place on
// every screen is not a rule. Here, the commitment is always in the same
// position, it never scrolls away, and it always states what will be recorded
// BEFORE it is pressed — so nobody discovers the consequence afterwards.
//
// `note` is not decoration. If a screen cannot say what its action records,
// the action probably should not be there yet.
import Icon from "./Icon";

export default function DecisionBar({ title = "Decisión humana", note, actions = [] }) {
  if (!actions.length) return null;
  return (
    <div className="ax-act">
      <div className="ax-act-who">
        <Icon name="user" />
        <span>
          <b>{title}</b>
          {note && <span>{note}</span>}
        </span>
      </div>
      <div className="ax-btns">
        {actions.map((a, i) => (
          <button
            key={i}
            className={`ax-btn${a.primary ? " primary" : ""}`}
            onClick={a.onClick}
            disabled={a.disabled}
            title={a.title}
          >
            {a.icon && !a.primary && <Icon name={a.icon} />}
            {a.label}
            {a.primary && <Icon name={a.iconRight || "arrow"} />}
          </button>
        ))}
      </div>
    </div>
  );
}
