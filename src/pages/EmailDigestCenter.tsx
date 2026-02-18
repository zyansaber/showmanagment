import { useMemo, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { Mail, History, RefreshCw, Send } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ShowOrder = {
  id?: string;
  showId?: string;
  salesperson?: string;
  customerName?: string;
  model?: string;
  status?: string;
  emailconfirmation?: string | boolean;
};

type TeamMember = {
  memberName?: string;
  email?: string;
  showDays?: unknown;
  showDaysSent?: Record<string, number>;
};

type ShowDayEntry = { showId: string; showName?: string; days: number };
type WorkDayDelta = { showId: string; showName: string; addedDays: number; totalDays: number; sentBefore: number };
type EmailOrder = { orderKey: string; orderId: string; showId: string; customerName: string; model: string; salesperson: string };
type TeamInfo = { key: string; memberName: string; email: string };

type DigestPreview = {
  nameKey: string;
  member: TeamInfo;
  orders: EmailOrder[];
  workDays: WorkDayDelta[];
};

type HistoryItem = {
  digestId: string;
  to: string;
  sentAt: string;
  orderCount: number;
  salesperson: string;
};

const SHOW_ORDERS_PATH = 'showOrders';
const TEAM_MEMBERS_PATH = 'teamMembers';
const SHOWS_PATH = 'shows';
const HISTORY_PATH = 'emailDigestHistory';
const MAX_ORDERS_PER_DIGEST = 15;

const SKIP_SHOW_IDS = new Set([
  '3aef2717-28d3-4df3-83e1-4174bf8f7cbe',
  'SHOW-1762752016864',
  'SHOW-1762752016865',
  'SHOW-1762752016868',
  'SHOW-1762752016867',
  'SHOW-1762752016870',
  '7a224798-7f6a-4cb8-888b-3e418fcb4dce',
]);

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_SERVICE_ID = 'service_d39k2lv';
const EMAILJS_TEMPLATE_ID = 'template_7780rdu';
const EMAILJS_PUBLIC_KEY = 'Ox1_IwykSClDMOhqz';
const EMAILJS_PRIVATE_KEY = 'Dg7xyuMhc-xtKQbROJT7H';
const EMAILJS_ATTACHMENT_PARAM = 'pdf_attachment';

const norm = (s?: string) => String(s ?? '').trim().toLowerCase();
const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nowIso = () => new Date().toISOString();
const makeConfirmationId = (prefix = 'CNF') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
const alreadySent = (val: unknown) => {
  if (val === true) return true;
  if (typeof val === 'number') return true;
  if (typeof val === 'string' && val.trim() !== '') return true;
  return false;
};

const parseShowDaysEntriesRaw = (showDays: unknown): ShowDayEntry[] => {
  if (!showDays) return [];

  const out: ShowDayEntry[] = [];

  if (Array.isArray(showDays)) {
    for (const item of showDays) {
      if (!item || typeof item !== 'object') continue;
      const typed = item as Record<string, unknown>;
      const showId = String(typed.showId ?? typed.id ?? typed.show_id ?? '').trim();
      const showName = String(typed.showName ?? typed.show_name ?? typed.name ?? '').trim() || undefined;
      const days = toNum(typed.days ?? typed.workDays ?? typed.totalDays ?? typed.value);
      if (showId && days >= 0) out.push({ showId, showName, days });
    }
    return out;
  }

  if (typeof showDays === 'object') {
    for (const [k, v] of Object.entries(showDays as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const typed = v as Record<string, unknown>;
        const showId = String(typed.showId ?? typed.show_id ?? typed.id ?? k ?? '').trim();
        if (!showId) continue;
        const showName = String(typed.showName ?? typed.show_name ?? typed.name ?? '').trim() || undefined;
        const days = toNum(typed.days ?? typed.workDays ?? typed.totalDays ?? typed.value);
        if (days >= 0) out.push({ showId, showName, days });
      } else {
        const showId = String(k).trim();
        const days = toNum(v);
        if (showId && days >= 0) out.push({ showId, days });
      }
    }
  }

  return out;
};

const chunk = <T,>(list: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
};

const escapePdf = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const buildPdfDataUri = (args: {
  salesperson: string;
  recipientEmail: string;
  digestId: string;
  orders: { orderId: string; showName: string; customerName: string; model: string }[];
  workDays: WorkDayDelta[];
}) => {
  const lines: string[] = [
    'Show Orders Confirmation',
    `Digest ID: ${args.digestId}`,
    `Salesperson: ${args.salesperson}`,
    `Email: ${args.recipientEmail}`,
    `Generated: ${new Date().toLocaleString()}`,
    '',
    `Orders (${args.orders.length})`,
  ];

  args.orders.forEach((order, index) => {
    lines.push(`${index + 1}. ${order.orderId} | ${order.showName} | ${order.customerName || '-'} | ${order.model || '-'}`);
  });

  if (args.workDays.length) {
    lines.push('', 'New Work Days');
    args.workDays.forEach((day, index) => {
      lines.push(`${index + 1}. ${day.showName} - added ${day.addedDays}, total ${day.totalDays}`);
    });
  }

  const contentStream = [
    'BT',
    '/F1 10 Tf',
    '50 792 Td',
    '14 TL',
    ...lines.map((line, i) => `${i === 0 ? '' : 'T* '}(${escapePdf(line)}) Tj`.trim()),
    'ET',
  ].join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const encoded = btoa(unescape(encodeURIComponent(pdf)));
  return `data:application/pdf;base64,${encoded}`;
};

async function sendEmailJs(toEmail: string, toName: string, templateParams: Record<string, unknown>) {
  const body: Record<string, unknown> = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    accessToken: EMAILJS_PRIVATE_KEY,
    template_params: {
      to_email: toEmail,
      to_name: toName,
      ...templateParams,
    },
  };

  const response = await fetch(EMAILJS_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`EmailJS failed ${response.status}: ${await response.text()}`);
  }
}

const EmailDigestCenter = () => {
  const [digests, setDigests] = useState<DigestPreview[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState('');

  const totalOrders = useMemo(() => digests.reduce((sum, d) => sum + d.orders.length, 0), [digests]);
  const totalWorkDays = useMemo(
    () => digests.reduce((sum, d) => sum + d.workDays.reduce((acc, item) => acc + item.addedDays, 0), 0),
    [digests],
  );

  const loadPreview = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [ordersSnap, teamSnap, showsSnap] = await Promise.all([
        get(ref(database, SHOW_ORDERS_PATH)),
        get(ref(database, TEAM_MEMBERS_PATH)),
        get(ref(database, SHOWS_PATH)),
      ]);

      const orders = (ordersSnap.val() ?? {}) as Record<string, ShowOrder>;
      const team = (teamSnap.val() ?? {}) as Record<string, TeamMember>;
      const shows = (showsSnap.val() ?? {}) as Record<string, { id?: string; showId?: string; name?: string; showName?: string }>;

      const showMap: Record<string, string> = {};
      for (const [key, value] of Object.entries(shows)) {
        const showId = String(value?.id ?? value?.showId ?? key ?? '').trim();
        const showName = String(value?.name ?? value?.showName ?? '').trim();
        if (showId && showName) showMap[showId] = showName;
      }

      const ordersByName: Record<string, EmailOrder[]> = {};
      for (const [orderKey, order] of Object.entries(orders)) {
        if (order.status !== 'Approved') continue;
        if (!order.showId || SKIP_SHOW_IDS.has(order.showId)) continue;
        if (alreadySent(order.emailconfirmation)) continue;
        const nameKey = norm(order.salesperson);
        if (!nameKey) continue;

        if (!ordersByName[nameKey]) ordersByName[nameKey] = [];
        ordersByName[nameKey].push({
          orderKey,
          orderId: String(order.id ?? orderKey),
          showId: String(order.showId),
          customerName: String(order.customerName ?? ''),
          model: String(order.model ?? ''),
          salesperson: String(order.salesperson ?? ''),
        });
      }

      const digestList: DigestPreview[] = [];
      for (const [memberKey, member] of Object.entries(team)) {
        const memberName = String(member.memberName ?? '');
        const email = String(member.email ?? '');
        const nameKey = norm(memberName);
        if (!nameKey || !email) continue;

        const ordersForMember = ordersByName[nameKey] ?? [];

        const sentMap = (member.showDaysSent ?? {}) as Record<string, number>;
        const showDayEntries = parseShowDaysEntriesRaw(member.showDays);
        const dayDeltas: WorkDayDelta[] = showDayEntries
          .filter((entry) => entry.showId && !SKIP_SHOW_IDS.has(entry.showId))
          .map((entry) => {
            const sentBefore = toNum(sentMap[entry.showId] ?? 0);
            const totalDays = toNum(entry.days);
            const addedDays = totalDays - sentBefore;
            const showName = entry.showName ?? showMap[entry.showId] ?? entry.showId;
            return {
              showId: entry.showId,
              showName,
              sentBefore,
              totalDays,
              addedDays,
            };
          })
          .filter((entry) => entry.addedDays > 0);

        if (ordersForMember.length === 0 && dayDeltas.length === 0) continue;
        digestList.push({
          nameKey,
          member: { key: memberKey, memberName, email },
          orders: ordersForMember,
          workDays: dayDeltas,
        });
      }

      setDigests(digestList);
      setMessage(`Loaded ${digestList.length} recipients.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load preview.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    setMessage('');
    try {
      const snapshot = await get(ref(database, HISTORY_PATH));
      const rows = (snapshot.val() ?? {}) as Record<string, HistoryItem>;
      const list = Object.values(rows)
        .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
        .slice(0, 100);
      setHistory(list);
      setShowHistory(true);
      setMessage(`Loaded ${list.length} history records.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  };

  const sendAll = async () => {
    if (digests.length === 0) {
      setMessage('No pending recipients to send.');
      return;
    }

    setSending(true);
    setMessage('Sending...');

    try {
      // First pass: skip list auto mark
      const [ordersSnap, teamSnap] = await Promise.all([
        get(ref(database, SHOW_ORDERS_PATH)),
        get(ref(database, TEAM_MEMBERS_PATH)),
      ]);
      const orders = (ordersSnap.val() ?? {}) as Record<string, ShowOrder>;
      const team = (teamSnap.val() ?? {}) as Record<string, TeamMember>;

      const skipUpdates: Record<string, unknown> = {};
      const skipDigestId = makeConfirmationId('SKIP');
      const skipTs = nowIso();
      for (const [orderKey, order] of Object.entries(orders)) {
        if (order.status !== 'Approved') continue;
        if (!order.showId || !SKIP_SHOW_IDS.has(order.showId)) continue;
        if (alreadySent(order.emailconfirmation)) continue;
        skipUpdates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmation`] = skipDigestId;
        skipUpdates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmationAt`] = skipTs;
        skipUpdates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmationTo`] = 'SKIPPED_NO_EMAIL';
      }
      for (const [memberKey, member] of Object.entries(team)) {
        const entries = parseShowDaysEntriesRaw(member.showDays);
        const sentMap = member.showDaysSent ?? {};
        let touched = false;
        for (const entry of entries) {
          if (!SKIP_SHOW_IDS.has(entry.showId)) continue;
          const current = Math.max(toNum(sentMap[entry.showId] ?? 0), toNum(entry.days));
          skipUpdates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSent/${entry.showId}`] = current;
          touched = true;
        }
        if (touched) {
          skipUpdates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSentAt`] = skipTs;
        }
      }
      if (Object.keys(skipUpdates).length > 0) {
        await update(ref(database), skipUpdates);
      }

      let success = 0;
      let failed = 0;

      for (const digest of digests) {
        const parts = digest.orders.length ? chunk(digest.orders, MAX_ORDERS_PER_DIGEST) : [[] as EmailOrder[]];
        for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
          const part = parts[partIndex];
          const includeWorkdays = partIndex === 0;
          const digestId = makeConfirmationId('CNF');
          const ts = nowIso();

          const ordersForTemplate = part.map((order) => ({
            order_id: order.orderId,
            show_name: order.showId,
            customerName: order.customerName,
            model: order.model,
          }));

          const pdfDataUri = buildPdfDataUri({
            salesperson: digest.member.memberName,
            recipientEmail: digest.member.email,
            digestId,
            orders: part.map((order) => ({
              orderId: order.orderId,
              showName: order.showId,
              customerName: order.customerName,
              model: order.model,
            })),
            workDays: includeWorkdays ? digest.workDays : [],
          });

          const workDaysNew = includeWorkdays
            ? digest.workDays.reduce((sum, item) => sum + item.addedDays, 0)
            : 0;

          const templateParams = {
            salesperson: digest.member.memberName,
            digest_id: digestId,
            has_orders: ordersForTemplate.length ? 1 : 0,
            has_workdays: includeWorkdays && digest.workDays.length ? 1 : 0,
            order_count: ordersForTemplate.length,
            work_days_new: Number.isInteger(workDaysNew) ? workDaysNew : Number(workDaysNew.toFixed(2)),
            orders: ordersForTemplate,
            [EMAILJS_ATTACHMENT_PARAM]: pdfDataUri,
          };

          try {
            await sendEmailJs(digest.member.email, digest.member.memberName, templateParams);

            const updates: Record<string, unknown> = {
              [`${HISTORY_PATH}/${digestId}`]: {
                digestId,
                to: digest.member.email,
                salesperson: digest.member.memberName,
                sentAt: ts,
                orderCount: part.length,
              },
            };

            for (const order of part) {
              updates[`${SHOW_ORDERS_PATH}/${order.orderKey}/emailconfirmation`] = digestId;
              updates[`${SHOW_ORDERS_PATH}/${order.orderKey}/emailconfirmationAt`] = ts;
              updates[`${SHOW_ORDERS_PATH}/${order.orderKey}/emailconfirmationTo`] = digest.member.email;
            }

            if (includeWorkdays) {
              for (const day of digest.workDays) {
                updates[`${TEAM_MEMBERS_PATH}/${digest.member.key}/showDaysSent/${day.showId}`] = day.totalDays;
              }
              updates[`${TEAM_MEMBERS_PATH}/${digest.member.key}/showDaysSentAt`] = ts;
              updates[`${TEAM_MEMBERS_PATH}/${digest.member.key}/showDaysSentConfirmationId`] = digestId;
            }

            await update(ref(database), updates);
            success += 1;
          } catch (error) {
            failed += 1;
            console.error(error);
          }
        }
      }

      setMessage(`Done. sent=${success}, failed=${failed}`);
      await loadPreview();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Order Digest Mail Center</h2>
          <p className="text-sm text-slate-600">Preview eligible orders + work days, send EmailJS with attached PDF, and review history.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPreview} disabled={loading || sending}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Pending
          </Button>
          <Button variant="outline" onClick={loadHistory} disabled={loading || sending}>
            <History className="mr-2 h-4 w-4" /> View History
          </Button>
          <Button onClick={sendAll} disabled={sending || loading || digests.length === 0}>
            <Send className="mr-2 h-4 w-4" /> Send Emails
          </Button>
        </div>
      </div>

      {message && <p className="text-sm text-slate-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Current Batch</CardTitle>
          <CardDescription>
            Recipients: {digests.length} · Orders: {totalOrders} · New Work Days: {totalWorkDays}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {digests.length === 0 ? (
            <p className="text-sm text-slate-500">No eligible recipients found. Click "Refresh Pending" to load.</p>
          ) : (
            digests.map((digest) => (
              <div key={digest.nameKey} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{digest.member.memberName}</p>
                    <p className="text-sm text-slate-600">{digest.member.email}</p>
                  </div>
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-800">Orders ({digest.orders.length})</p>
                    <ul className="max-h-44 space-y-1 overflow-auto text-xs text-slate-600">
                      {digest.orders.map((order) => (
                        <li key={order.orderKey} className="rounded bg-slate-50 px-2 py-1">
                          {order.orderId} · {order.showId} · {order.customerName || '-'} · {order.model || '-'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-800">New Work Days ({digest.workDays.length})</p>
                    <ul className="max-h-44 space-y-1 overflow-auto text-xs text-slate-600">
                      {digest.workDays.length === 0 && <li className="text-slate-400">No new work days.</li>}
                      {digest.workDays.map((day) => (
                        <li key={`${day.showId}-${day.totalDays}`} className="rounded bg-slate-50 px-2 py-1">
                          {day.showName} · +{day.addedDays} day(s) · total {day.totalDays}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle>Send History</CardTitle>
            <CardDescription>Latest {history.length} digest records from Firebase.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-700">
              {history.map((item) => (
                <li key={`${item.digestId}-${item.sentAt}`} className="rounded border border-slate-200 px-3 py-2">
                  <p className="font-medium">{item.salesperson} ({item.to})</p>
                  <p className="text-xs text-slate-500">
                    Digest: {item.digestId} · Orders: {item.orderCount} · Sent: {new Date(item.sentAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmailDigestCenter;
