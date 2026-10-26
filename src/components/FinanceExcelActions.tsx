import { useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dbGet, dbImport2027 } from '@/lib/firebase';
import { activeYear } from '@/lib/showYear';
import type { FinanceExportRow } from '@/lib/financeResultExcel';

export default function FinanceExcelActions({ rows, disabled, onImported }: { rows: FinanceExportRow[]; disabled: boolean; onImported: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<FinanceExportRow[] | null>(null);
  const [error, setError] = useState('');
  const isTemplate = rows.every((row) => row.isTemplateRow);
  if (activeYear !== 2027) return null;

  const exportExcel = async () => {
    setBusy(true);
    try {
      const { exportFinanceWorkbook } = await import('@/lib/financeResultExcel');
      const buffer = await exportFinanceWorkbook(rows);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = isTemplate ? 'Finance-Result-2027-Template.xlsx' : 'Finance-Result-2027.xlsx';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Excel export failed.'); }
    finally { setBusy(false); }
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file exported from Finance Result 2027.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose an Excel file smaller than 10 MB.');
      const { parseFinanceWorkbook } = await import('@/lib/financeResultExcel');
      setPending(await parseFinanceWorkbook(await file.arrayBuffer()));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read Excel file.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const save = async () => {
    if (!pending || activeYear !== 2027) return;
    setBusy(true); setError('');
    try {
      const { prepareFinanceImport } = await import('@/lib/financeResultExcel');
      const [shows, internalOrders] = await Promise.all([dbGet('shows'), dbGet('finance/internalSalesOrders')]);
      const result = prepareFinanceImport(pending, shows || {}, internalOrders || {}, () => crypto.randomUUID());
      await dbImport2027(result.updates);
      setPending(null);
      toast.success(`2027 updated: ${result.created} new shows, ${result.updated} updated shows.`);
      await onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import failed. No changes were saved.'); }
    finally { setBusy(false); }
  };
  return <>
    <input ref={input} type="file" accept=".xlsx" className="hidden" aria-label="Import 2027 finance Excel" onChange={(event) => void readFile(event.target.files?.[0])} />
    <Button variant="outline" size="sm" className="h-9 bg-white" disabled={disabled || busy} onClick={() => void exportExcel()}><Download className="mr-2 h-4 w-4" />{isTemplate ? 'Download template' : 'Export Excel'}</Button>
    <Button size="sm" className="h-9" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Import Excel</Button>
    {error && !pending && <p role="alert" className="w-full text-sm text-rose-600">{error}</p>}
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) { setPending(null); setError(''); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import Finance Result · 2027</DialogTitle><DialogDescription>{pending?.length} shows validated. Listed shows will be added or updated, including their dates, targets, budgets and financial summaries. Other shows are kept. 2026 is unchanged.</DialogDescription></DialogHeader>
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2 text-left">Show</th><th className="p-2 text-left">Dealership</th><th className="p-2 text-right">Budget</th><th className="p-2 text-right">Actual</th></tr></thead><tbody>{pending?.map((row, index) => <tr key={index} className="border-t"><td className="p-2">{row.showName}</td><td className="p-2">{row.dealership}</td><td className="p-2 text-right">${row.totalBudget.toLocaleString('en-AU')}</td><td className="p-2 text-right">${row.actual.toLocaleString('en-AU')}</td></tr>)}</tbody></table>
        </div>
        <p className="text-xs text-slate-500">Imported sales are summaries. Individual orders, salespeople and contract details can still be managed in Orders &amp; Sales.</p>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import into 2027</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
