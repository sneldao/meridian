"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { findAirport, searchAirports, type Airport } from "@/domain/airports";
import { buildTrip } from "@/domain/fixtures";
import { fmtUtcOffset, utcOffsetMinOn } from "@/domain/timezones";

// Route control for any of ~1,100 airports: two type-ahead fields, a date,
// and a live readout of the real (DST-aware, wrapped) shift.
//
//   <RoutePicker origin={origin} dest={dest} date={date}
//     onChange={({ origin, dest, date }) => ...} />

interface Props {
  origin: string;
  dest: string;
  date: string;
  onChange: (next: { origin: string; dest: string; date: string }) => void;
  disabled?: boolean;
}

export function RoutePicker({ origin, dest, date, onChange, disabled }: Props) {
  const shift = useMemo(() => {
    try {
      return origin !== dest ? buildTrip(origin, dest, date) : null;
    } catch {
      return null;
    }
  }, [origin, dest, date]);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-2 py-1.5 font-mono2 text-[12px]">
      <AirportField label="from" value={origin} date={date} disabled={disabled} onPick={(c) => onChange({ origin: c, dest, date })} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ origin: dest, dest: origin, date })}
        className="px-1 text-sun-dest hover:text-paper disabled:opacity-40"
        aria-label="Swap origin and destination"
        title="Swap"
      >
        →
      </button>
      <AirportField label="to" value={dest} date={date} disabled={disabled} onPick={(c) => onChange({ origin, dest: c, date })} />
      <input
        type="date"
        value={date}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange({ origin, dest, date: e.target.value })}
        className="bg-transparent text-mist [color-scheme:dark]"
        aria-label="Departure date"
      />
      {shift && (
        <span className="whitespace-nowrap pl-1 text-mist" title="Real offsets on these dates, DST included">
          <span className="text-paper">{Math.abs(shift.requiredShiftMin / 60)}h</span> {shift.direction}
        </span>
      )}
    </div>
  );
}

function AirportField({
  label,
  value,
  date,
  onPick,
  disabled,
}: {
  label: string;
  value: string;
  date: string;
  onPick: (code: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = findAirport(value);
  const results = useMemo(() => searchAirports(query, 8), [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const pick = (a: Airport) => {
    onPick(a.code);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? query : value}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHi(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setHi((h) => Math.min(h + 1, results.length - 1));
          else if (e.key === "ArrowUp") setHi((h) => Math.max(h - 1, 0));
          else if (e.key === "Enter" && results[hi]) pick(results[hi]);
          else if (e.key === "Escape") setOpen(false);
          e.stopPropagation(); // keep the page's Space/Esc shortcuts out of typing
        }}
        placeholder={open ? "city or code" : value}
        aria-label={`${label} airport`}
        title={current ? `${current.airport} · ${current.tz}` : undefined}
        className="w-14 bg-transparent text-paper uppercase placeholder:normal-case placeholder:text-dim focus:w-36 focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-ink-2 shadow-xl"
        >
          {results.map((a, i) => (
            <li
              key={a.code}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(a);
              }}
              onMouseEnter={() => setHi(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-2 ${i === hi ? "bg-ink-3" : ""}`}
            >
              <span className="w-9 font-semibold text-paper">{a.code}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-paper normal-case">
                {a.name} <span className="text-mist">· {a.country}</span>
              </span>
              <span className="text-[12px] text-mist">{fmtUtcOffset(utcOffsetMinOn(a.tz, date))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
