import { useEffect, useMemo, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { Mail, History, RefreshCw, Send, Eye } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ShowOrder = {
  id?: string;
  dealNumber?: number | string;
  showId?: string;
  salesperson?: string;
  customerName?: string;
  model?: string;
  status?: string;
  orderStatusId?: string;
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
  daysSentTotal?: number;
  daysSentSummary?: string;
};

const SHOW_ORDERS_PATH = 'showOrders';
const TEAM_MEMBERS_PATH = 'teamMembers';
const SHOWS_PATH = 'shows';
const HISTORY_PATH = 'emailDigestHistory';
const MAX_ORDERS_PER_DIGEST = 15;
const CONFIRMATION_STATUS_ID = 'confirmation';
const CANCELLATION_STATUS_ID = 'cancellation';

const SKIP_SHOW_IDS = new Set([
  '3aef2717-28d3-4df3-83e1-4174bf8f7cbe',
  'SHOW-1762752016864',
  'SHOW-1762752016865',
  'SHOW-1762752016868',
  'SHOW-1762752016867',
  'SHOW-1762752016870',
  '7a224798-7f6a-4cb8-888b-3e418fcb4dce',
  'SHOW-1762752016929',
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

const isConfirmedOrder = (order: ShowOrder) => {
  const normalizedStatus = String(order.status ?? '').trim().toLowerCase();
  const normalizedStatusId = String(order.orderStatusId ?? '').trim().toLowerCase();
  return normalizedStatusId === CONFIRMATION_STATUS_ID || normalizedStatus === 'approved';
};

const resolveStatusValue = (orderStatusId: unknown, statusLookup: Record<string, string>) => {
  const rawStatusId = String(orderStatusId ?? '').trim();
  const normalized = rawStatusId.toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === CONFIRMATION_STATUS_ID) return 'Approved';
  if (normalized === CANCELLATION_STATUS_ID) return 'Cancelled';
  return statusLookup[rawStatusId] || statusLookup[normalized] || 'Pending';
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

const makePseudoCode39Bars = (value: string, x: number, y: number, height: number, moduleW = 1.6) => {
  const src = `*${value.toUpperCase()}*`;
  const bars: Array<{ x: number; y: number; w: number; h: number }> = [];
  let cursor = x;
  for (const ch of src) {
    const seed = ch.charCodeAt(0);
    for (let i = 0; i < 9; i += 1) {
      const wide = ((seed >> (i % 6)) & 1) === 1;
      const w = moduleW * (wide ? 2.2 : 1);
      if (i % 2 === 0) bars.push({ x: cursor, y, w, h: height });
      cursor += w;
    }
    cursor += moduleW * 2.2;
  }
  return { bars, width: cursor - x };
};

const buildDigestPdfDataUri = async (args: {
  salesperson: string;
  recipientEmail: string;
  digestId: string;
  orders: { dealNo: string; showName: string; customerName: string; model: string }[];
  workDays: WorkDayDelta[];
}) => {
  const generatedAt = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
  const totalNewDays = args.workDays.reduce((s, d) => s + toNum(d.addedDays), 0);

  const pageW = 595;
  const pageH = 842;
  const left = 48;
  const right = 547;
  const contentW = right - left;
  const topReserved = Math.round(pageH / 7);
  const lineGap = 14;

  const textLines: Array<{ size: number; text: string; bold?: boolean }> = [
    { size: 14, bold: true, text: 'Show Orders Confirmation' },
    { size: 12, bold: true, text: `TOTAL VANS: ${args.orders.length}` },
    ...(totalNewDays > 0 ? [{ size: 11, bold: true, text: `NEW WORK DAYS: ${totalNewDays}` }] : []),
    { size: 10, text: `Salesperson: ${args.salesperson}` },
    { size: 10, text: `Email: ${args.recipientEmail}` },
    { size: 10, text: `Generated: ${generatedAt}` },
    { size: 10, text: '' },
    { size: 11, bold: true, text: `Orders (${args.orders.length})` },
    ...args.orders.map((o, idx) => ({ size: 9, text: `${idx + 1}. Deal #${o.dealNo || '-'} | ${o.showName || '-'} | ${o.customerName || '-'} | ${o.model || '-'}` })),
    { size: 10, text: '' },
    { size: 11, bold: true, text: `Work Days (Added: ${totalNewDays})` },
    ...args.workDays.map((d, idx) => ({ size: 9, text: `${idx + 1}. ${d.showName || d.showId} | +${d.addedDays}` })),
    { size: 10, text: '' },
    { size: 10, bold: true, text: 'Commission / Concur' },
    { size: 9, text: '- Attach this PDF in Concur claim.' },
    { size: 9, text: '- Use CNF on top-right as reference.' },
  ];

  const barcode = makePseudoCode39Bars(args.digestId, 0, 0, 24, 1.55);
  const barcodeX = right - Math.min(220, barcode.width);
  const barcodeY = pageH - 68;

  const contentParts: string[] = [];
  contentParts.push('q 0.90 0.92 0.97 rg 0.90 0.92 0.97 RG');
  contentParts.push(`${left} ${(pageH - topReserved - 56).toFixed(2)} ${contentW} 70 re f`);
  contentParts.push('Q');
  contentParts.push('q 0.88 0.90 0.94 RG 1 w');
  contentParts.push(`${left} ${(pageH - topReserved).toFixed(2)} m ${right} ${(pageH - topReserved).toFixed(2)} l S Q`);

  const pillText = `CNF: ${args.digestId}`;
  const pillW = Math.min(240, 18 + pillText.length * 5.1);
  const pillH = 22;
  const pillX = right - pillW;
  const pillY = pageH - 40;
  contentParts.push('q 1 1 1 rg 0.85 0.87 0.90 RG');
  contentParts.push(`${pillX.toFixed(2)} ${pillY.toFixed(2)} ${pillW.toFixed(2)} ${pillH} re B Q`);

  contentParts.push('q 0 0 0 rg');
  for (const bar of barcode.bars) {
    contentParts.push(`${(bar.x + barcodeX).toFixed(2)} ${(bar.y + barcodeY).toFixed(2)} ${bar.w.toFixed(2)} ${bar.h.toFixed(2)} re f`);
  }
  contentParts.push('Q');

  let y = pageH - topReserved - 30;
  for (const line of textLines) {
    if (y < 52) break;
    const font = line.bold ? '/F2' : '/F1';
    contentParts.push('BT');
    contentParts.push(`${font} ${line.size} Tf`);
    contentParts.push(`${left} ${y.toFixed(2)} Td`);
    contentParts.push(`(${escapePdf(line.text)}) Tj`);
    contentParts.push('ET');
    y -= lineGap;
  }

  contentParts.push('BT /F2 10 Tf');
  contentParts.push(`${(pillX + 9).toFixed(2)} ${(pillY + 8).toFixed(2)} Td`);
  contentParts.push(`(${escapePdf(pillText)}) Tj ET`);

  contentParts.push('BT /F1 9 Tf');
  contentParts.push(`${left} 26 Td (Page 1 of 1) Tj ET`);

  const contentStream = contentParts.join('\n');
  const contentLength = new TextEncoder().encode(contentStream).length;

  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `6 0 obj << /Length ${contentLength} >> stream\n${contentStream}\nendstream endobj`,
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

  const binary = new TextEncoder().encode(pdf).reduce((acc, byte) => acc + String.fromCharCode(byte), '');
  return `data:application/pdf;base64,${btoa(binary)}`;
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
  const [showNameMap, setShowNameMap] = useState<Record<string, string>>({});

  const sortedDigests = useMemo(
    () => [...digests].sort((a, b) => a.member.memberName.localeCompare(b.member.memberName)),
    [digests]
  );

  const resolveShowName = (showIdOrName: string) => {
    if (!showIdOrName) return 'Unknown show';
    return showNameMap[showIdOrName] || showIdOrName;
  };

  const prettifyDaysSummary = (summary?: string) => {
    if (!summary) return '';
    return summary
      .split(' | ')
      .map((chunkPart) => {
        const [who, rest] = chunkPart.split(' => ');
        if (!rest) return chunkPart;
        const prettyRest = rest
          .split(', ')
          .map((pair) => {
            const [showId, days] = pair.split(':');
            return `${resolveShowName(showId)}:${days ?? ''}`;
          })
          .join(', ');
        return `${who} => ${prettyRest}`;
      })
      .join(' | ');
  };

  const extractPeopleFromDaysSummary = (summary?: string) => {
    if (!summary) return '';
    const names = summary
      .split(' | ')
      .map((chunkPart) => chunkPart.split(' => ')[0]?.trim())
      .filter(Boolean);
    return Array.from(new Set(names)).join(', ');
  };

  const isCommissionDoneHistory = (item: HistoryItem) =>
    item.to === 'SKIPPED_NO_EMAIL' || item.salesperson === 'SKIPPED_SHOWS_BATCH';


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

      setShowNameMap(showMap);

      const ordersByName: Record<string, EmailOrder[]> = {};
      for (const [orderKey, order] of Object.entries(orders)) {
        if (!isConfirmedOrder(order)) continue;
        if (!order.showId) continue;
        if (alreadySent(order.emailconfirmation)) continue;
        const nameKey = norm(order.salesperson);
        if (!nameKey) continue;

        if (!ordersByName[nameKey]) ordersByName[nameKey] = [];
        ordersByName[nameKey].push({
          orderKey,
          dealNo: String(order.dealNumber ?? order.id ?? orderKey),
          showId: String(order.showId),
          showName: showMap[String(order.showId)] ?? 'Unknown show',
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
              showName: entry.showName ?? showMap[entry.showId] ?? 'Unknown show',
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
      const [historySnap, showsSnap] = await Promise.all([get(ref(database, HISTORY_PATH)), get(ref(database, SHOWS_PATH))]);
      const rows = (historySnap.val() ?? {}) as Record<string, HistoryItem>;
      const shows = (showsSnap.val() ?? {}) as Record<string, { id?: string; showId?: string; name?: string; showName?: string }>;
      const map: Record<string, string> = {};
      for (const [key, value] of Object.entries(shows)) {
        const showId = String(value?.id ?? value?.showId ?? key ?? '').trim();
        const showName = String(value?.name ?? value?.showName ?? '').trim();
        if (showId && showName) map[showId] = showName;
      }
      setShowNameMap((prev) => ({ ...prev, ...map }));

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

  const markConfirmedSkippedShowsAsSent = async () => {
    setSending(true);
    setMessage('Marking confirmed skipped-show orders as sent (without email)...');

    try {
      const [ordersSnap, teamSnap] = await Promise.all([get(ref(database, SHOW_ORDERS_PATH)), get(ref(database, TEAM_MEMBERS_PATH))]);
      const orders = (ordersSnap.val() ?? {}) as Record<string, ShowOrder>;
      const team = (teamSnap.val() ?? {}) as Record<string, TeamMember>;

      const updates: Record<string, unknown> = {};
      const skipDigestId = makeConfirmationId('SKIP');
      const skipTs = nowIso();
      let touchedOrders = 0;

      for (const [orderKey, order] of Object.entries(orders)) {
        if (!order.showId || !SKIP_SHOW_IDS.has(order.showId)) continue;
        if (!isConfirmedOrder(order)) continue;
        if (alreadySent(order.emailconfirmation)) continue;

        updates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmation`] = skipDigestId;
        updates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmationAt`] = skipTs;
        updates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmationTo`] = 'SKIPPED_NO_EMAIL';
        updates[`${SHOW_ORDERS_PATH}/${orderKey}/emailconfirmationNote`] = 'Auto-marked as sent for skipped showId (no email required)';
        touchedOrders += 1;
      }

      let totalDaysSent = 0;
      const daySummaries: string[] = [];
      for (const [memberKey, member] of Object.entries(team)) {
        const entries = parseShowDaysEntriesRaw(member.showDays).filter((entry) => SKIP_SHOW_IDS.has(entry.showId));
        if (!entries.length) continue;

        const sentMap = (member.showDaysSent ?? {}) as Record<string, number>;
        const applied: string[] = [];
        for (const entry of entries) {
          const totalDays = toNum(entry.days);
          const sentBefore = toNum(sentMap[entry.showId] ?? 0);
          const nextSent = Math.max(sentBefore, totalDays);
          updates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSent/${entry.showId}`] = nextSent;
          updates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSentAt`] = skipTs;
          updates[`${TEAM_MEMBERS_PATH}/${memberKey}/showDaysSentConfirmationId`] = skipDigestId;
          totalDaysSent += Math.max(0, nextSent - sentBefore);
          applied.push(`${entry.showId}:${nextSent}`);
        }
        if (applied.length) daySummaries.push(`${member.memberName || memberKey} => ${applied.join(', ')}`);
      }

      updates[`${HISTORY_PATH}/${skipDigestId}`] = {
        digestId: skipDigestId,
        to: 'SKIPPED_NO_EMAIL',
        salesperson: 'SKIPPED_SHOWS_BATCH',
        sentAt: skipTs,
        orderCount: touchedOrders,
        daysSentTotal: totalDaysSent,
        daysSentSummary: daySummaries.join(' | '),
        manual: true,
      };

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }

      setMessage(
        `Done. Marked ${touchedOrders} confirmed skip-show orders as sent (no email). Days confirmed delta: ${totalDaysSent}.`
      );
      await loadPreview();
      await loadHistory();
    } finally {
      setSending(false);
    }
  };


  const backfillMissingStatus = async () => {
    setSending(true);
    setMessage('Backfilling missing status values...');

    try {
      const [ordersSnap, statusOptionsSnap] = await Promise.all([
        get(ref(database, SHOW_ORDERS_PATH)),
        get(ref(database, 'orderStatusOptions')),
      ]);

      const orders = (ordersSnap.val() ?? {}) as Record<string, ShowOrder>;
      const statusOptions = (statusOptionsSnap.val() ?? {}) as Record<string, { label?: string }>;
      const statusLookup = Object.entries(statusOptions).reduce<Record<string, string>>((acc, [id, option]) => {
        const key = String(id ?? '').trim();
        const label = String(option?.label ?? '').trim();
        if (!key || !label) return acc;
        acc[key] = label;
        acc[key.toLowerCase()] = label;
        return acc;
      }, {});

      const updates: Record<string, unknown> = {};
      let patched = 0;

      for (const [orderKey, order] of Object.entries(orders)) {
        if (typeof order.status === 'string' && order.status.trim() !== '') continue;
        updates[`${SHOW_ORDERS_PATH}/${orderKey}/status`] = resolveStatusValue(order.orderStatusId, statusLookup);
        patched += 1;
      }

      if (patched > 0) {
        await update(ref(database), updates);
      }

      setMessage(patched > 0 ? `Backfill complete. Updated ${patched} orders.` : 'No missing status found.');
      await loadPreview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backfill failed.');
    } finally {
      setSending(false);
    }
  };


  const previewPdfTemplate = async () => {
    const first = sortedDigests[0];
    const digestId = makeConfirmationId('CNF-PREVIEW');
    const dataUri = await buildDigestPdfDataUri({
      salesperson: first?.member.memberName || 'Preview User',
      recipientEmail: first?.member.email || 'preview@example.com',
      digestId,
      orders: (first?.orders || []).slice(0, 12).map((order) => ({
        dealNo: order.dealNo,
        showName: order.showName,
        customerName: order.customerName,
        model: order.model,
      })),
      workDays: first?.workDays || [],
    });
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    w.document.write(`<iframe src="${dataUri}" style="border:0;width:100vw;height:100vh"></iframe>`);
    w.document.close();
  };

  const sendDigest = async (digest: DigestPreview) => {
    setSending(true);
    setMessage(`Sending ${digest.member.memberName}...`);

    try {
      const parts = digest.orders.length ? chunk(digest.orders, MAX_ORDERS_PER_DIGEST) : [[] as EmailOrder[]];
      let success = 0;
      let failed = 0;

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

        const pdfDataUri = await buildDigestPdfDataUri({
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
              daysSentTotal: includeWorkdays ? digest.workDays.reduce((sum, day) => sum + toNum(day.addedDays), 0) : 0,
              daysSentSummary: includeWorkdays ? digest.workDays.map((day) => `${day.showId}:${day.totalDays}`).join(', ') : '',
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

      setMessage(`Done for ${digest.member.memberName}. sent=${success}, failed=${failed}`);
      await loadPreview();
    } finally {
      setSending(false);
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

          const pdfDataUri = await buildDigestPdfDataUri({
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
                daysSentTotal: includeWorkdays ? digest.workDays.reduce((sum, day) => sum + toNum(day.addedDays), 0) : 0,
                daysSentSummary: includeWorkdays ? digest.workDays.map((day) => `${day.showId}:${day.totalDays}`).join(', ') : '',
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
          <Button variant="outline" onClick={previewPdfTemplate} disabled={loading || sending}>
            <Eye className="mr-2 h-4 w-4" /> Preview PDF
          </Button>
          <Button onClick={sendAll} disabled={sending || loading || digests.length === 0}>
            <Send className="mr-2 h-4 w-4" /> Send Emails
          </Button>
          <Button variant="secondary" onClick={markConfirmedSkippedShowsAsSent} disabled={sending || loading}>
            Mark Confirmed Skipped Shows as Sent (No Email)
          </Button>
          <Button variant="outline" onClick={backfillMissingStatus} disabled={sending || loading}>
            Backfill Missing Status
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
          {sortedDigests.length === 0 ? (
            <p className="text-sm text-slate-500">No eligible data.</p>
          ) : (
            sortedDigests.map((digest) => (
              <div key={digest.member.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{digest.member.memberName}</p>
                    <p className="text-xs text-slate-500">{digest.member.email}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => sendDigest(digest)}
                    disabled={sending || loading}
                    title={`Send email to ${digest.member.memberName}`}
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {digest.orders.length ? (
                          digest.orders.map((order, idx) => (
                            <tr key={`${order.orderKey}-${idx}`} className="border-t first:border-t-0 border-slate-100 odd:bg-white even:bg-slate-50/40">
                              <td className="px-2 py-1 font-semibold text-slate-900 whitespace-nowrap">#{order.dealNo}</td>
                              <td className="px-2 py-1 whitespace-nowrap">{order.showName || 'Unknown show'}</td>
                              <td className="px-2 py-1">{order.customerName || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-2 py-2 text-xs text-slate-500" colSpan={3}>No pending orders</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-md border border-slate-200 overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {digest.workDays.length ? (
                          digest.workDays.map((day, idx) => (
                            <tr key={`${day.showId}-${idx}`} className="border-t first:border-t-0 border-slate-100 odd:bg-white even:bg-slate-50/40">
                              <td className="px-2 py-1">{day.showName || 'Unknown show'}</td>
                              <td className="px-2 py-1 text-right font-medium whitespace-nowrap">+{day.addedDays}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-2 py-2 text-xs text-slate-500" colSpan={2}>No new days</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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
                  <p className="font-medium">
                    {isCommissionDoneHistory(item) ? 'Commission Done' : item.salesperson}
                  </p>
                  <p className="text-xs text-slate-500">
                    People: {isCommissionDoneHistory(item) ? extractPeopleFromDaysSummary(prettifyDaysSummary(item.daysSentSummary)) || '—' : `${item.salesperson} (${item.to})`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Orders: {item.orderCount} · Days Added: {toNum(item.daysSentTotal)} · Sent: {new Date(item.sentAt).toLocaleString()}
                  </p>
                  {item.daysSentSummary ? <p className="text-xs text-slate-500">Days: {prettifyDaysSummary(item.daysSentSummary)}</p> : null}
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
