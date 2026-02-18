import { useEffect, useMemo, useState } from 'react';
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
  dealerConfirm?: boolean;
  emailconfirmation?: string | boolean;
};

type TeamMember = {
  memberName?: string;
  email?: string;
  activeFlag?: number | string;
  showDays?: unknown;
  showDaysSent?: Record<string, number>;
};

type ShowDayEntry = { showId: string; showName?: string; days: number };
type WorkDayDelta = { showId: string; showName: string; addedDays: number; totalDays: number; sentBefore: number };
type EmailOrder = {
  orderKey: string;
  dealNo: string;
  showId: string;
  showName: string;
  customerName: string;
  model: string;
  salesperson: string;
};
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

const buildDigestPdfDataUri = (args: {
  salesperson: string;
  recipientEmail: string;
  digestId: string;
  orders: { dealNo: string; showName: string; customerName: string; model: string }[];
  workDays: WorkDayDelta[];
}) => {
  const generatedAt = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
  const totalNewDays = args.workDays.reduce((s, d) => s + toNum(d.addedDays), 0);

  const lines: string[] = [
    `CNF: ${args.digestId}`,
    '',
    'Show Orders Confirmation',
    `TOTAL VANS: ${args.orders.length}`,
    ...(totalNewDays > 0 ? [`NEW WORK DAYS: ${totalNewDays}`] : []),
    `Salesperson: ${args.salesperson}`,
    `Email: ${args.recipientEmail}`,
    `Generated: ${generatedAt}`,
    '',
    `Orders (${args.orders.length})`,
    'Deal # | Customer Name | Show | Model',
    ...args.orders.map((order) => `${order.dealNo || '-'} | ${order.customerName || '-'} | ${order.showName || '-'} | ${order.model || '-'}`),
  ];

  if (args.workDays.length > 0) {
    lines.push('', `Work Days (New: ${totalNewDays})`, 'Show | Added Days | Total');
    lines.push(...args.workDays.map((d) => `${d.showName || d.showId} | ${d.addedDays} | ${d.totalDays}`));
  }

  lines.push(
    '',
    'Next step (Commission / Concur)',
    '• Please attach this Show Orders Confirmation PDF to your Concur claim as supporting evidence for commission.',
    '• Use the CNF number as the reference in Concur (recommended).',
    '• Submit according to internal policy.',
    '',
    'Page 1 of 1',
  );

  const contentStream = ['BT', '/F1 10 Tf', '48 800 Td', '14 TL', ...lines.map((line, i) => `${i === 0 ? '' : 'T* '}(${escapePdf(line)}) Tj`.trim()), 'ET'].join('\n');

  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return `data:application/pdf;base64,${btoa(unescape(encodeURIComponent(pdf)))}`;
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

  const showSections = useMemo(() => {
    const bucket = new Map<string, { showName: string; rows: Array<{ dealNo: string; customerName: string; salesperson: string }> }>();
    for (const digest of digests) {
      for (const order of digest.orders) {
        const key = order.showName || order.showId;
        const section = bucket.get(key) ?? { showName: key, rows: [] };
        section.rows.push({
          dealNo: order.dealNo,
          customerName: order.customerName || '-',
          salesperson: digest.member.memberName,
        });
        bucket.set(key, section);
      }
    }
    return Array.from(bucket.values()).sort((a, b) => a.showName.localeCompare(b.showName));
  }, [digests]);

  const totalOrders = useMemo(() => digests.reduce((sum, d) => sum + d.orders.length, 0), [digests]);
  const totalWorkDays = useMemo(() => digests.reduce((sum, d) => sum + d.workDays.reduce((acc, item) => acc + item.addedDays, 0), 0), [digests]);

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
        if (order.dealerConfirm !== true) continue;
        if (!order.showId || SKIP_SHOW_IDS.has(order.showId)) continue;
        if (alreadySent(order.emailconfirmation)) continue;
        const nameKey = norm(order.salesperson);
        if (!nameKey) continue;

        if (!ordersByName[nameKey]) ordersByName[nameKey] = [];
        ordersByName[nameKey].push({
          orderKey,
          dealNo: String(order.id ?? orderKey),
          showId: String(order.showId),
          showName: showMap[String(order.showId)] ?? String(order.showId),
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
        if (member.activeFlag !== undefined && Number(member.activeFlag) !== 1) continue;

        const ordersForMember = ordersByName[nameKey] ?? [];
        const sentMap = (member.showDaysSent ?? {}) as Record<string, number>;
        const showDayEntries = parseShowDaysEntriesRaw(member.showDays);
        const dayDeltas: WorkDayDelta[] = showDayEntries
          .filter((entry) => entry.showId && !SKIP_SHOW_IDS.has(entry.showId))
          .map((entry) => {
            const sentBefore = toNum(sentMap[entry.showId] ?? 0);
            const totalDays = toNum(entry.days);
            return {
              showId: entry.showId,
              showName: entry.showName ?? showMap[entry.showId] ?? entry.showId,
              sentBefore,
              totalDays,
              addedDays: totalDays - sentBefore,
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
      const list = Object.values(rows).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)).slice(0, 100);
      setHistory(list);
      setShowHistory(true);
      setMessage(`Loaded ${list.length} history records.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPreview();
  }, []);

  const sendAll = async () => {
    if (digests.length === 0) {
      setMessage('No pending recipients to send.');
      return;
    }

    setSending(true);
    setMessage('Sending...');

    try {
      const [ordersSnap, teamSnap] = await Promise.all([get(ref(database, SHOW_ORDERS_PATH)), get(ref(database, TEAM_MEMBERS_PATH))]);
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
          skipUpdates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSent/${entry.showId}`] = Math.max(toNum(sentMap[entry.showId] ?? 0), toNum(entry.days));
          touched = true;
        }
        if (touched) skipUpdates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSentAt`] = skipTs;
      }

      if (Object.keys(skipUpdates).length > 0) await update(ref(database), skipUpdates);

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
            order_id: order.dealNo,
            show_name: order.showName,
            customerName: order.customerName,
            model: order.model,
          }));

          const pdfDataUri = buildDigestPdfDataUri({
            salesperson: digest.member.memberName,
            recipientEmail: digest.member.email,
            digestId,
            orders: part.map((order) => ({
              dealNo: order.dealNo,
              showName: order.showName,
              customerName: order.customerName,
              model: order.model,
            })),
            workDays: includeWorkdays ? digest.workDays : [],
          });

          const workDaysNew = includeWorkdays ? digest.workDays.reduce((sum, item) => sum + item.addedDays, 0) : 0;

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
          <h2 className="text-2xl font-bold text-slate-900">Confirmation Email</h2>
          <p className="text-sm text-slate-600">Send confirmation emails with PDF attachment and EmailJS data.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPreview} disabled={loading || sending}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
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
          {showSections.length === 0 ? (
            <p className="text-sm text-slate-500">No eligible data.</p>
          ) : (
            showSections.map((section) => (
              <div key={section.showName} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{section.showName}</p>
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-2">Deal #</th>
                        <th className="py-1 pr-2">Customer Name</th>
                        <th className="py-1">Salesperson</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, idx) => (
                        <tr key={`${row.dealNo}-${idx}`} className="border-t border-slate-100">
                          <td className="py-1 pr-2">{row.dealNo}</td>
                          <td className="py-1 pr-2">{row.customerName}</td>
                          <td className="py-1">{row.salesperson}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <p className="font-medium">
                    {item.salesperson} ({item.to})
                  </p>
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
