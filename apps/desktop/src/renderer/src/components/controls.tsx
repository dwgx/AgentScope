import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ActionButton(props: { label: string; onClick: () => void; disabled?: boolean; testId?: string | undefined }) {
  return (
    <button className="actionButton" data-testid={props.testId} disabled={props.disabled} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

export function MiniSegmentedControl<T extends string>(props: {
  value: T;
  values: T[];
  label: (value: T) => string;
  onChange: (value: T) => void;
  testId?: string | undefined;
}) {
  return (
    <div className="segmented miniSegmented" data-testid={props.testId}>
      {props.values.map((value) => (
        <button
          key={value}
          className={props.value === value ? "active" : ""}
          data-value={value}
          onClick={() => props.onChange(value)}
        >
          {props.label(value)}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl(props: {
  value: string;
  values: Array<string | [string, string]>;
  onChange: (value: string) => void;
  testId?: string | undefined;
}) {
  return (
    <span className="segmented" data-testid={props.testId}>
      {props.values.map((item) => {
        const [value, label] = Array.isArray(item) ? item : [item, item];
        return (
          <button
            className={props.value === value ? "active" : ""}
            data-value={value}
            key={value}
            onClick={() => props.onChange(value)}
          >
            {label}
          </button>
        );
      })}
    </span>
  );
}

export function SwitchControl(props: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean | undefined }) {
  return (
    <button
      className={`switchControl ${props.checked ? "checked" : ""}`}
      aria-pressed={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span />
    </button>
  );
}

export function ToolbarControl(props: { label: string; children: ReactNode }) {
  return (
    <div className="toolbarControl">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}

export function SearchableComboBox(props: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowCustom?: boolean | undefined;
  allowEmpty?: boolean | undefined;
  emptyLabel?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  testId?: string | undefined;
  renderOption?: ((value: string) => ReactNode) | undefined;
  renderValue?: ((value: string) => ReactNode) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const comboRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scrollSnapshotRef = useRef<Array<{ element: Element | Window; top: number; left: number }>>([]);
  const options = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const all = comboOptions(props.options, props.value, props.allowEmpty ? props.emptyLabel ?? "" : undefined);
    const filtered = all.filter((font) => !query || font.toLowerCase().includes(query));
    if (query || filtered.includes(props.value)) return filtered.slice(0, 18);
    return [props.value, ...filtered.filter((font) => font !== props.value).slice(0, 17)];
  }, [filter, props.allowEmpty, props.emptyLabel, props.options, props.value]);

  useEffect(() => {
    const currentIndex = options.findIndex((font) => font === props.value);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [filter, open, options, props.value]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (comboRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setFilter("");
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (!open) {
      setMenuStyle(undefined);
      return undefined;
    }
    scrollSnapshotRef.current = captureScrollPositions(comboRef.current);
    const updatePosition = () => {
      const trigger = comboRef.current?.querySelector<HTMLButtonElement>(".fontComboTrigger");
      if (!trigger) return;
      const box = trigger.getBoundingClientRect();
      const gap = 6;
      const maxHeight = Math.min(260, Math.max(140, window.innerHeight - box.bottom - gap - 14));
      const fallbackTop = Math.max(14, box.top - maxHeight - gap);
      const belowTop = box.bottom + gap;
      const top = window.innerHeight - belowTop >= 140 ? belowTop : fallbackTop;
      setMenuStyle({
        position: "fixed",
        top,
        left: Math.min(box.left, window.innerWidth - Math.max(220, box.width) - 14),
        width: Math.max(220, box.width),
        maxHeight,
        zIndex: 140
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      scrollSnapshotRef.current = [];
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
      restoreScrollPositions(scrollSnapshotRef.current);
    });
  }, [open]);

  const commit = (value: string) => {
    const next = value.trim();
    if (next || props.allowEmpty) props.onChange(optionValueFromLabel(next, props.emptyLabel));
    setFilter("");
  };

  return (
    <div className={`fontCombo ${props.className ?? ""} ${open ? "open" : ""}`} data-testid={props.testId} ref={comboRef}>
      <button
        type="button"
        className="fontComboTrigger"
        data-testid={props.testId ? `${props.testId}-trigger` : undefined}
        disabled={props.disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {props.renderValue ? props.renderValue(displayComboValue(props.value, props.emptyLabel)) : <span>{displayComboValue(props.value, props.emptyLabel)}</span>}
        <ChevronRight size={15} className={open ? "open" : ""} />
      </button>
      {open && createPortal((
        <div className="fontComboMenu fontComboMenuPortal" ref={menuRef} style={menuStyle}>
          <input
            ref={searchRef}
            className="fontComboSearch"
            data-testid={props.testId ? `${props.testId}-search` : undefined}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setFilter("");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.min(options.length - 1, index + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const selected = options[highlightedIndex];
                if (selected !== undefined) {
                  commit(selected);
                  setOpen(false);
                } else if (props.allowCustom) {
                  commit(filter);
                  setOpen(false);
                }
              }
            }}
            spellCheck={false}
          />
          {options.map((font, index) => (
            <button
              type="button"
              key={font}
              data-testid={props.testId ? `${props.testId}-option` : undefined}
              data-value={optionValueFromLabel(font, props.emptyLabel)}
              className={`${optionValueFromLabel(font, props.emptyLabel) === props.value ? "active" : ""} ${
                index === highlightedIndex ? "highlighted" : ""
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                props.onChange(optionValueFromLabel(font, props.emptyLabel));
                setFilter("");
                setOpen(false);
              }}
            >
              {props.renderOption ? props.renderOption(font) : <span>{font}</span>}
            </button>
          ))}
          {!options.length && (
            props.allowCustom ? (
              <button
                type="button"
                className="highlighted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  commit(filter);
                  setOpen(false);
                }}
              >
                <span>{filter}</span>
              </button>
            ) : (
              <span className="fontComboEmpty">{filter}</span>
            )
          )}
        </div>
      ), document.body)}
    </div>
  );
}

function captureScrollPositions(anchor: Element | null): Array<{ element: Element | Window; top: number; left: number }> {
  const out: Array<{ element: Element | Window; top: number; left: number }> = [
    { element: window, top: window.scrollY, left: window.scrollX }
  ];
  let current = anchor?.parentElement;
  while (current) {
    if (current.scrollTop || current.scrollLeft || scrollableElement(current)) {
      out.push({ element: current, top: current.scrollTop, left: current.scrollLeft });
    }
    current = current.parentElement;
  }
  return out;
}

function restoreScrollPositions(items: Array<{ element: Element | Window; top: number; left: number }>): void {
  for (const item of items) {
    if (item.element instanceof Element) {
      const element = item.element;
      element.scrollTop = item.top;
      element.scrollLeft = item.left;
    } else {
      item.element.scrollTo(item.left, item.top);
    }
  }
}

function scrollableElement(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`);
}

function comboOptions(options: string[], current: string, emptyLabel?: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined) => {
    const next = value?.trim();
    if (!next) return;
    const key = next.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(next);
  };
  if (emptyLabel !== undefined) add(emptyLabel);
  add(current);
  for (const option of options) add(option);
  return out;
}

function optionValueFromLabel(value: string, emptyLabel?: string | undefined): string {
  return emptyLabel !== undefined && value === emptyLabel ? "" : value;
}

function displayComboValue(value: string, emptyLabel?: string | undefined): string {
  return value || emptyLabel || "";
}
