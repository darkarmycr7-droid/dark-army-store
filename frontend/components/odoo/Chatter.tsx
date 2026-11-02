'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send, History } from 'lucide-react';

export interface ChatterMessage {
  id: number;
  type: string;
  body: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
}

/**
 * Odoo's chatter: the message + activity log pinned to a record.
 * COMMENT rows are notes someone wrote; LOG rows are automatic system entries.
 * The parent supplies load/post so this works for any model.
 */
export default function Chatter({
  load, post,
}: {
  load: () => Promise<ChatterMessage[]>;
  post: (body: string) => Promise<unknown>;
}) {
  const [messages, setMessages] = useState<ChatterMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => load().then(setMessages).catch(() => setMessages([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await post(draft.trim());
      setDraft('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-odoo-line bg-odoo-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-odoo-dim">
        <MessageSquare size={15} /> Messages &amp; Log
      </h3>

      <form onSubmit={send} className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Log an internal note…"
          className="input flex-1"
        />
        <button disabled={busy || !draft.trim()} className="btn-primary px-3 py-1.5 disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>

      {!messages ? (
        <div className="py-6 text-center text-odoo-faint"><Loader2 className="mx-auto animate-spin" size={18} /></div>
      ) : messages.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-odoo-faint">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-3">
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${m.type === 'LOG' ? 'bg-odoo-raised text-odoo-faint' : 'bg-odoo-primary/30 text-odoo-lift'}`}>
                {m.type === 'LOG' ? <History size={13} /> : (m.authorName || m.authorEmail || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-odoo-faint">
                  <span className="font-semibold text-odoo-dim">{m.authorName || m.authorEmail || 'System'}</span>
                  {' · '}{new Date(m.createdAt).toLocaleString()}
                </div>
                <div className={`text-sm ${m.type === 'LOG' ? 'italic text-odoo-faint' : ''}`}>{m.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
