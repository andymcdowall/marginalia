import { useState } from "react";
import { computeDisplayNumbers, findMilestones, MILESTONE_RE, type Thread } from "@marginalia/core";
import { useStore } from "../store.js";
import { usePlatform } from "../platformContext.js";
import { removeCommentTags, reAnchorThread } from "../editor/comments.js";
import { activeEditorView } from "./EditorPane.js";

function excerpt(docText: string, threadId: string): string {
  const milestones = findMilestones(docText);
  const start = milestones.find((m) => m.kind === "start" && m.id === threadId);
  const end = milestones.find((m) => m.kind === "end" && m.id === threadId);
  if (!start || !end || end.from <= start.to) return "";
  const clean = docText.slice(start.to, end.from).replace(MILESTONE_RE, "");
  return clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((Date.now() - then) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
  ];
  let value = diffSec;
  let label = "s";
  for (const [size, unit] of units) {
    if (Math.abs(value) < size) {
      label = unit;
      break;
    }
    value = Math.round(value / size);
    label = unit;
  }
  return value <= 0 ? "just now" : `${value}${label} ago`;
}

function renderBody(text: string): { __html: string } {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
  return { __html: html };
}

export function CommentsPanel() {
  const openFile = useStore((s) => s.openFile);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const setActiveThreadId = useStore((s) => s.setActiveThreadId);
  const setThreadsStore = useStore((s) => s.setThreads);
  const commentFilter = useStore((s) => s.commentFilter);
  const setCommentFilter = useStore((s) => s.setCommentFilter);
  const draftThreadId = useStore((s) => s.draftThreadId);
  const setDraftThreadId = useStore((s) => s.setDraftThreadId);
  const addToast = useStore((s) => s.addToast);
  const platform = usePlatform();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [draftBody, setDraftBody] = useState("");

  if (!openFile) return <div className="comments-panel-empty">No file open.</div>;

  const docText = openFile.docText;
  const displayNumbers = computeDisplayNumbers(docText, openFile.threads);
  const open = openFile.threads.filter((t) => t.status !== "orphaned" && (commentFilter === "all" || t.status === "open"));
  const orphaned = openFile.threads.filter((t) => t.status === "orphaned");

  function updateThread(id: string, fn: (t: Thread) => Thread): void {
    setThreadsStore(openFile!.threads.map((t) => (t.id === id ? fn(t) : t)));
  }

  function handleResolveToggle(t: Thread): void {
    updateThread(t.id, (th) => ({ ...th, status: th.status === "resolved" ? "open" : "resolved", updated: new Date().toISOString() }));
  }

  async function handleDeleteThread(t: Thread): Promise<void> {
    const ok = await platform.dialogs.confirm("Delete this comment thread?", { danger: true });
    if (!ok) return;
    if (activeEditorView.current) removeCommentTags(activeEditorView.current, t.id);
    setThreadsStore(openFile!.threads.filter((th) => th.id !== t.id));
    if (activeThreadId === t.id) setActiveThreadId(null);
  }

  function handleReplySubmit(t: Thread): void {
    const text = replyDrafts[t.id]?.trim();
    if (!text) return;
    const now = new Date().toISOString();
    updateThread(t.id, (th) => ({
      ...th,
      updated: now,
      comments: [...th.comments, { id: `${t.id}-${th.comments.length + 1}`, created: now, body: text }],
    }));
    setReplyDrafts((d) => ({ ...d, [t.id]: "" }));
  }

  function handleDeleteComment(t: Thread, commentId: string): void {
    if (t.comments.length <= 1) {
      void handleDeleteThread(t);
      return;
    }
    updateThread(t.id, (th) => ({ ...th, comments: th.comments.filter((c) => c.id !== commentId) }));
  }

  function handleDraftCancel(t: Thread): void {
    if (activeEditorView.current) removeCommentTags(activeEditorView.current, t.id);
    setThreadsStore(openFile!.threads.filter((th) => th.id !== t.id));
    setDraftThreadId(null);
    setDraftBody("");
    if (activeThreadId === t.id) setActiveThreadId(null);
  }

  function handleDraftSubmit(t: Thread): void {
    const text = draftBody.trim();
    if (!text) {
      handleDraftCancel(t);
      return;
    }
    const now = new Date().toISOString();
    updateThread(t.id, (th) => ({ ...th, updated: now, comments: [{ id: `${t.id}-c1`, created: now, body: text }] }));
    setDraftThreadId(null);
    setDraftBody("");
  }

  function handleReAnchor(t: Thread): void {
    if (!activeEditorView.current) return;
    const ok = reAnchorThread(activeEditorView.current, t.id);
    if (!ok) addToast("Select a range in the editor first.");
  }

  function renderCard(t: Thread) {
    const number = displayNumbers.get(t.id);
    if (t.id === draftThreadId) {
      return (
        <div key={t.id} className="comment-card active">
          <div className="comment-card-header">
            {number !== undefined && <span className="comment-card-number">{number}</span>}
            <span className="comment-card-excerpt">{excerpt(docText, t.id) || "(no range)"}</span>
          </div>
          <div className="comment-reply">
            <textarea
              autoFocus
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleDraftSubmit(t);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  handleDraftCancel(t);
                }
              }}
              placeholder="Comment… (Cmd+Enter to submit, Esc to cancel)"
            />
          </div>
        </div>
      );
    }
    return (
      <div
        key={t.id}
        className={`comment-card${t.id === activeThreadId ? " active" : ""}`}
        onClick={() => setActiveThreadId(t.id)}
      >
        <div className="comment-card-header">
          {number !== undefined && <span className="comment-card-number">{number}</span>}
          <span className="comment-card-excerpt">{excerpt(docText, t.id) || "(no range)"}</span>
        </div>
        {t.comments.map((c) => (
          <div key={c.id} className="comment-item">
            <div className="comment-item-meta">{relativeTime(c.created)}</div>
            <div className="comment-item-body" dangerouslySetInnerHTML={renderBody(c.body)} />
            <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteComment(t, c.id); }}>
              Delete
            </button>
          </div>
        ))}
        <div className="comment-card-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => handleResolveToggle(t)}>
            {t.status === "resolved" ? "Reopen" : "Resolve"}
          </button>
          <button type="button" onClick={() => void handleDeleteThread(t)}>
            Delete thread
          </button>
        </div>
        <div className="comment-reply" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={replyDrafts[t.id] ?? ""}
            onChange={(e) => setReplyDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleReplySubmit(t);
            }}
            placeholder="Reply… (Cmd+Enter to submit)"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="comments-panel">
      <div className="comments-panel-filter">
        <button type="button" className={commentFilter === "open" ? "active" : ""} onClick={() => setCommentFilter("open")}>
          Open
        </button>
        <button type="button" className={commentFilter === "all" ? "active" : ""} onClick={() => setCommentFilter("all")}>
          All
        </button>
      </div>
      {open.length === 0 && <div className="comments-panel-empty">No comments.</div>}
      {open.map(renderCard)}
      {orphaned.length > 0 && (
        <div className="comments-panel-orphaned">
          <div className="comments-panel-orphaned-title">Detached comments</div>
          {orphaned.map((t) => (
            <div key={t.id} className="comment-card orphaned">
              {t.comments.map((c) => (
                <div key={c.id} className="comment-item">
                  <div className="comment-item-body" dangerouslySetInnerHTML={renderBody(c.body)} />
                </div>
              ))}
              <div className="comment-card-actions">
                <button type="button" onClick={() => handleReAnchor(t)}>
                  Re-anchor
                </button>
                <button type="button" onClick={() => void handleDeleteThread(t)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
