"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { findAirport, searchAirports, type Airport } from "@/domain/airports";
import { buildTrip } from "@/domain/fixtures";
import { fmtUtcOffset, utcOffsetMinOn } from "@/domain/timezones";
import { Card } from "@/components/ui";

// Route control for any of ~1,100 airports: two type-ahead fields, a date,
// and a live readout of the real (DST-aware, wrapped) shift.
//
//   <RoutePicker origin={origin} dest={dest} date={date}
//     surface="cream"
//     onChange={({ origin, dest, date }) => ...} />

type Surface = "default" | "cream";

interface Props {
  origin: string;
  dest: string;
  date: string;
  onChange: (next: { origin: string; dest: string; date: string }) => void;
  disabled?: boolean;
  /** `default` keeps the dark `Card` chrome that lives well on /crew and
   *  other ink-2 surfaces; `cream` swaps to a cream pill that matches the
   *  home surface (white-ish ground, warm border, dark text). The listbox
   *  stays dark either way — list items on a cream ground are unreadable. */
  surface?: Surface;
}

const SURFACE_CLASSES: Record<Surface, string> = {
  default:
    "rounded-xl border border-line bg-ink-2 px-3 py-2 font-mono2 text-xs",
  cream:
    "rounded-2xl border border-[#e3d5c3] bg-[#fff8ef] px-3 py-2 font-mono2 text-xs shadow-[0_1px_0_rgba(0,0,0,0.02)]",
};

const SWAP_CLASSES: Record<Surface, string> = {
  default: "px-1 text-sun-dest hover:text-paper disabled:opacity-40",
  cream: "px-1 text-[#D96B43] hover:text-[#a8512f] disabled:opacity-40",
};

const DATE_INPUT_CLASSES: Record<Surface, string> = {
  default: "min-w-0 bg-transparent text-mist [color-scheme:dark]",
  cream: "min-w-0 bg-transparent text-[#7a6a5c] [color-scheme:light]",
};

const SHIFT_BADGE: Record<Surface, string> = {
  default: "text-paper",
  cream: "text-[#3a2e23]",
};

const SHIFT_LABEL: Record<Surface, string> = {
  default: "text-mist",
  cream: "text-[#7a6a5c]",
};

const FIELD_LABEL: Record<Surface, string> = {
  default: "text-[9px] font-bold uppercase tracking-wider text-dim",
  cream: "text-[9px] font-bold uppercase tracking-wider text-[#a89a8a]",
};

const AIRPORT_INPUT: Record<Surface, string> = {
  default:
    "w-14 bg-transparent text-paper uppercase placeholder:normal-case placeholder:text-dim focus:w-36",
  cream:
    "w-14 bg-transparent text-[#3a2e23] uppercase placeholder:normal-case placeholder:text-[#a89a8a] focus:w-36",
};

export function RoutePicker({
  origin,
  dest,
  date,
  onChange,
  disabled,
  surface = "default",
}: Props) {
  const shift = useMemo(() => {
    try {
      return origin !== dest ? buildTrip(origin, dest, date) : null;
    } catch {
      return null;
    }
  }, [origin, dest, date]);

  // The default surface uses the shared `Card` so it inherits the ink-2
  // chrome and the line border; the cream surface has its own pill so the
  // home page can sit on the warm ground without dark surface imports.
  const surfaceClass = SURFACE_CLASSES[surface];

  const destCity = findAirport(dest)?.name ?? dest;
  const fields = (
    <>
      <div className="rp-route-row flex items-end gap-1.5">
        <div className="rp-field rp-field--from flex flex-col gap-0.5">
          <span className={`rp-label ${FIELD_LABEL[surface]}`}>From</span>
          <AirportField label="From" value={origin} date={date} disabled={disabled} onPick={(c) => onChange({ origin: c, dest, date })} surface={surface} />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ origin: dest, dest: origin, date })}
          className={SWAP_CLASSES[surface]}
          aria-label="Swap origin and destination"
          title="Swap"
        >
          →
        </button>
        <div className="rp-field rp-field--to flex flex-col gap-0.5">
          <span className={`rp-label ${FIELD_LABEL[surface]}`}>To</span>
          <AirportField label="To" value={dest} date={date} disabled={disabled} onPick={(c) => onChange({ origin, dest: c, date })} surface={surface} />
        </div>
      </div>
      <div className="rp-date-row flex flex-wrap items-end gap-2">
        <div className="rp-field flex flex-col gap-0.5">
          <span className={`rp-label ${FIELD_LABEL[surface]}`}>Departs</span>
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => e.target.value && onChange({ origin, dest, date: e.target.value })}
            className={`rp-input ${DATE_INPUT_CLASSES[surface]}`}
            aria-label="Departure date"
          />
        </div>
        {shift && (
          <span className={`${SHIFT_LABEL[surface]}`} title="Real offsets on these dates, DST included">
            {destCity} is <span className={SHIFT_BADGE[surface]}>{Math.abs(shift.requiredShiftMin / 60)}h</span>{" "}
            {shift.direction === "east" ? "ahead" : "behind"}
          </span>
        )}
      </div>
    </>
  );

  return surface === "default" ? (
    <Card className="rp-picker flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mono2 text-xs">
      {fields}
    </Card>
  ) : (
    <div className={`rp-picker ${surfaceClass} flex flex-wrap items-center justify-between gap-2`}>
      {fields}
    </div>
  );
}

function AirportField({
  label,
  value,
  date,
  onPick,
  disabled,
  surface,
}: {
  label: string;
  value: string;
  date: string;
  onPick: (code: string) => void;
  disabled?: boolean;
  surface: Surface;
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
    <div ref={ref} className="rp-field-wrap relative">
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
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open && results[hi]) {
            e.preventDefault();
            pick(results[hi]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
          e.stopPropagation(); // keep the page's Space/Esc shortcuts out of typing
        }}
        placeholder={open ? "city or code" : value || "City or airport"}
        aria-label={`${label} airport`}
        title={current ? `${current.airport} · ${current.tz}` : undefined}
        className={`rp-input ${AIRPORT_INPUT[surface]}`}
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="rp-listbox absolute top-full left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-ink-2 shadow-xl"
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
              <span className="min-w-0 flex-1 truncate text-xs text-paper normal-case">
                {a.name} <span className="text-mist">· {a.country}</span>
              </span>
              <span className="text-xs text-mist">{fmtUtcOffset(utcOffsetMinOn(a.tz, date))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
