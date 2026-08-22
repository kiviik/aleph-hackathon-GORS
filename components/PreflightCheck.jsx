"use client";

/**
 * Pre-flight brief check — paste a tech pack, see what a factory will ask.
 *
 * Standalone on purpose (build handoff Part 1): no sidebar, no brand switcher,
 * no login, no saved history. It is one URL a designer can open, use and send
 * on, and it shares nothing with the studio app but the design tokens.
 *
 * It is in ENGLISH while the rest of the app is Spanish, because the two have
 * different readers. The studio app is used by a brand's own team; this is a
 * document a designer or a sourcing agent prepares to send to a factory, and
 * the factory-facing half of the vocabulary (GSM, POM, ligne, Incoterm) has no
 * settled Spanish anyway. The Chinese line on each flag is the phrasing the
 * factory will use — a hint, not a translation layer.
 *
 * Nothing on this screen judges anything. Every word about a field comes from
 * the engine's rule set; this file arranges it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  asPlainText,
  groupByTier,
  headline,
  readingCaveat,
  STATUS_LABEL,
} from "@/lib/preflight.mjs";
import { checkFile, checkText } from "@/lib/preflightApi";

const SAMPLE = `BOXY TEE — AW27
Style no. AW27-TEE-01     Rev 2

FABRIC       cotton blend, midweight
COLOURWAYS   Ecru / Black / Olive (3 colours)
SIZES        XS S M L XL
NECK         crew neck
HEM          2cm
QTY          900 pcs total
DELIVERY     ASAP - we need it for the March drop
PRICE        we're aiming around 12.50
SAMPLING     TBC`;

export default function PreflightCheck() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  const fileInput = useRef(null);

  const run = useCallback(async (promise) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setCopyFallback(false);
    try {
      setResult(await promise);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const onCheck = () => {
    if (!text.trim() || busy) return;
    run(checkText(text.trim()));
  };

  const onFile = (file) => {
    if (!file || busy) return;
    setText("");
    run(checkFile(file));
  };

  const onDrop = (e) => {
    e.preventDefault();
    onFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  };

  // A failed copy must NOT be reported through `error` — that banner says
  // "Nothing was checked", and the check plainly ran. It also must not be a
  // dead end: the pasted text IS how this output travels, so when the clipboard
  // is unavailable (Safari without a user gesture, an http origin, a locked-down
  // browser) the text is put on screen to be selected by hand instead.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asPlainText(result));
      setCopied(true);
      setCopyFallback(false);
    } catch {
      setCopyFallback(true);
    }
  };

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="pfl">
      <header className="pfl-head">
        <div className="eyebrow">Atelier · pre-flight</div>
        <h1>
          Everything a factory will come back and ask about,
          <em> before you send it.</em>
        </h1>
        <p className="pfl-sub">
          Paste a tech pack or drop a PDF or a photo of one. Nothing is saved,
          there is no account, and the checker tells you when it does not know.
        </p>
      </header>

      <section className="pfl-input" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the tech pack here — messy and partial is expected."
          spellCheck={false}
          rows={12}
        />
        <div className="pfl-actions">
          <button className="pfl-go" onClick={onCheck} disabled={busy || !text.trim()}>
            {busy ? "Reading…" : "Check it"}
          </button>
          <button className="pfl-alt" onClick={() => fileInput.current?.click()} disabled={busy}>
            Upload a PDF or image
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,image/*"
            hidden
            onChange={(e) => onFile(e.target.files && e.target.files[0])}
          />
          {!text && !result && (
            <button className="pfl-link" onClick={() => setText(SAMPLE)} disabled={busy}>
              or try a real messy one
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="pfl-error">
          <strong>Nothing was checked.</strong> {error}
        </div>
      )}

      {result && result.unreadable && (
        <div className="pfl-error pfl-unread">
          <strong>This document could not be read.</strong>
          <p>{result.reading?.note}</p>
        </div>
      )}

      {result && !result.unreadable && (
        <Report
          result={result}
          onCopy={copy}
          copied={copied}
          copyFallback={copyFallback}
          showPassed={showPassed}
          onTogglePassed={() => setShowPassed((v) => !v)}
        />
      )}
    </div>
  );
}

function Report({ result, onCopy, copied, copyFallback, showPassed, onTogglePassed }) {
  const caveat = readingCaveat(result);
  const groups = groupByTier(result);
  const passed = result.passed || [];

  return (
    <section className="pfl-report">
      <div className="pfl-summary">
        <div>
          <div className="eyebrow">
            {result.summary.checks_run} checks · read from {result.source}
          </div>
          <h2>{headline(result)}</h2>
          <p className={result.summary.can_be_quoted ? "pfl-verdict ok" : "pfl-verdict stop"}>
            {result.summary.can_be_quoted
              ? "Nothing blocking. A factory can put a number on this — the rest is what comes back wrong or moves later."
              : "A factory cannot quote this yet. The blocking list is what to write first."}
          </p>
        </div>
        <button className="pfl-copy" onClick={onCopy}>
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>

      {copyFallback && (
        <div className="pfl-fallback">
          <p>
            This browser would not give the page the clipboard. The whole report
            is below — select it and copy it by hand.
          </p>
          <textarea readOnly rows={10} value={asPlainText(result)} onFocus={(e) => e.target.select()} />
        </div>
      )}

      <div className={`pfl-caveat ${caveat.tone}`}>{caveat.text}</div>

      {groups.map((group) => (
        <div className="pfl-tier" key={group.tier}>
          <div className="pfl-tier-head">
            <h3>{group.label}</h3>
            <span className="pfl-count">{group.flags.length}</span>
            <p>{group.meaning}</p>
          </div>
          {group.flags.map((flag) => (
            <Flag key={flag.key} flag={flag} />
          ))}
        </div>
      ))}

      {passed.length > 0 && (
        <div className="pfl-passed">
          <button onClick={onTogglePassed}>
            {showPassed ? "Hide" : "Show"} the {passed.length} check
            {passed.length === 1 ? "" : "s"} this tech pack already answers
          </button>
          {showPassed && (
            <ul>
              {passed.map((flag) => (
                <li key={flag.key}>
                  <strong>{flag.field}</strong>
                  {flag.note && <span> — {flag.note}</span>}
                  {Object.values(flag.found || {}).map((f, i) => (
                    <em key={i}>{f.value}</em>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Flag({ flag }) {
  const found = Object.values(flag.found || {});
  return (
    <article className={`pfl-flag ${flag.status}`}>
      <div className="pfl-flag-head">
        <span className={`pfl-status ${flag.status}`}>{STATUS_LABEL[flag.status]}</span>
        <h4>{flag.field}</h4>
      </div>

      {found.length > 0 && (
        <div className="pfl-found">
          {found.map((f, i) => (
            <div key={i}>
              <span className="pfl-found-value">{f.value}</span>
              {f.evidence && <span className="pfl-found-ev">from “{f.evidence}”</span>}
              {f.verified === false && (
                <span className="pfl-unverified">not found in your document</span>
              )}
            </div>
          ))}
        </div>
      )}

      {flag.note && <p className="pfl-note">{flag.note}</p>}
      <p className="pfl-why">{flag.why}</p>

      <div className="pfl-ask">
        <span className="eyebrow">They&rsquo;ll ask</span>
        <span className="pfl-zh">{flag.they_will_ask.zh}</span>
        <span className="pfl-en">{flag.they_will_ask.en}</span>
      </div>
      <div className="pfl-suggest">
        <span className="eyebrow">Write</span>
        <span>{flag.suggest}</span>
      </div>
    </article>
  );
}
