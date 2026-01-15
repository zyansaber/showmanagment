import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ColorOption = {
  label: string;
  value: string;
  className: string;
};

type OrderCommentsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const textColors: ColorOption[] = [
  { label: 'Slate', value: '#0f172a', className: 'bg-slate-900' },
  { label: 'Blue', value: '#2563eb', className: 'bg-blue-600' },
  { label: 'Emerald', value: '#059669', className: 'bg-emerald-600' },
  { label: 'Rose', value: '#e11d48', className: 'bg-rose-600' },
];

const highlightColors: ColorOption[] = [
  { label: 'Sunshine', value: '#fef3c7', className: 'bg-amber-200' },
  { label: 'Mint', value: '#d1fae5', className: 'bg-emerald-100' },
  { label: 'Sky', value: '#e0f2fe', className: 'bg-sky-100' },
  { label: 'Lavender', value: '#ede9fe', className: 'bg-violet-100' },
];

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

export default function OrderCommentsEditor({ value, onChange, className }: OrderCommentsEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const isEmpty = useMemo(() => !stripHtml(value), [value]);

  const applyCommand = (command: string, commandValue?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    onChange(editorRef.current.innerHTML);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-sm"
          onClick={() => applyCommand('bold')}
        >
          <span className="font-semibold">B</span>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Text</span>
          <div className="flex items-center gap-1">
            {textColors.map((color) => (
              <button
                key={color.value}
                type="button"
                title={`Text: ${color.label}`}
                aria-label={`Set text color to ${color.label}`}
                className={cn(
                  'h-6 w-6 rounded-full border border-slate-200 shadow-sm transition hover:scale-105',
                  color.className
                )}
                onClick={() => applyCommand('foreColor', color.value)}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Highlight</span>
          <div className="flex items-center gap-1">
            {highlightColors.map((color) => (
              <button
                key={color.value}
                type="button"
                title={`Highlight: ${color.label}`}
                aria-label={`Highlight text with ${color.label}`}
                className={cn(
                  'h-6 w-6 rounded-full border border-slate-200 shadow-sm transition hover:scale-105',
                  color.className
                )}
                onClick={() => applyCommand('hiliteColor', color.value)}
              />
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => applyCommand('removeFormat')}
        >
          Clear formatting
        </Button>
      </div>
      <div className="relative min-h-[420px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/40">
        {isEmpty && (
          <div className="pointer-events-none absolute left-4 top-4 text-sm text-muted-foreground">
            Add rich notes, highlights, and key reminders for this order...
          </div>
        )}
        <div
          ref={editorRef}
          className="min-h-[380px] w-full outline-none"
          contentEditable
          spellCheck
          onInput={handleInput}
        />
      </div>
    </div>
  );
}
