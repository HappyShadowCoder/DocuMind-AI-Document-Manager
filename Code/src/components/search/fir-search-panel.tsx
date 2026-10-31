"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  X,
  Eye,
  FileText,
  SlidersHorizontal,
  Calendar,
  MapPin,
  AlertCircle,
  Loader2,
  RefreshCw,
  IndianRupee,
  Landmark,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
interface SearchResult {
  id: string;
  fileId: string;
  fileName: string;
  state?: string | null;
  firNumber: string | null;
  firDate: string | null;
  district: string | null;
  subDivision: string | null;
  policeStation: string | null;
  propertyLoss: number | null;
  actsAndSections: string[] | null;
  zeroFirReference: string | null;
}

interface JurisdictionOptions {
  states: string[];
  districts: string[];
  subDivisions: string[];
  policeStations: string[];
}

// ────────────────────────────────────────────────────────────
// Custom Select Component with In-Dropdown Search
// ────────────────────────────────────────────────────────────
function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  icon: Icon,
  enableSearch = true,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  icon: React.ElementType;
  enableSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && enableSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm("");
    }
  }, [open, enableSearch]);

  const displayValue = value || placeholder;
  const isSet = !!value;

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter((opt) => opt.toLowerCase().includes(term));
  }, [options, searchTerm]);

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
      >
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <div className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-all duration-200 ${
            isSet
              ? "border-[#0052FF]/40 bg-[#0052FF]/5 text-slate-900 dark:border-[#4D7CFF]/40 dark:bg-[#4D7CFF]/10 dark:text-white"
              : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          } ${disabled ? "cursor-not-allowed opacity-40" : "hover:border-[#0052FF]/40 hover:shadow-sm"}`}
        >
          <span className="truncate">{displayValue}</span>
          <div className="flex shrink-0 items-center gap-1">
            {isSet && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onChange("");
                  }
                }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </div>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[210px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {/* Search Input inside Dropdown */}
            {enableSearch && (
              <div className="border-b border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={`Search ${label.toLowerCase()}…`}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#4D7CFF]"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setOpen(false);
                      } else if (e.key === "Enter" && filteredOptions.length === 1) {
                        onChange(filteredOptions[0]);
                        setOpen(false);
                        setSearchTerm("");
                      }
                    }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchTerm("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="max-h-52 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-slate-400">
                  {searchTerm ? `No matching "${searchTerm}"` : "No options available"}
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setSearchTerm("");
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      value === opt
                        ? "bg-[#0052FF]/10 font-medium text-[#0052FF] dark:bg-[#4D7CFF]/20 dark:text-[#4D7CFF]"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {opt}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────
export default function FirSearchPanel() {
  const router = useRouter();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSubDivision, setSelectedSubDivision] = useState("");
  const [selectedPoliceStation, setSelectedPoliceStation] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Jurisdiction cascading options
  const [jurisdiction, setJurisdiction] = useState<JurisdictionOptions>({
    states: [],
    districts: [],
    subDivisions: [],
    policeStations: [],
  });
  const [loadingJurisdiction, setLoadingJurisdiction] = useState(false);

  // Results
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch jurisdiction options whenever state, district, or subDivision changes ──
  const fetchJurisdiction = useCallback(
    async (st: string, dist: string, subDiv: string) => {
      setLoadingJurisdiction(true);
      try {
        const params = new URLSearchParams();
        if (st) params.set("state", st);
        if (dist) params.set("district", dist);
        if (subDiv) params.set("subDivision", subDiv);
        const res = await fetch(`/api/search/jurisdiction?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setJurisdiction({
            states: data.states ?? [],
            districts: data.districts ?? [],
            subDivisions: data.subDivisions ?? [],
            policeStations: data.policeStations ?? [],
          });
        }
      } catch {
        // ignore
      } finally {
        setLoadingJurisdiction(false);
      }
    },
    []
  );

  // Load initial jurisdiction options on mount
  useEffect(() => {
    fetchJurisdiction("", "", "");
  }, [fetchJurisdiction]);

  function handleStateChange(v: string) {
    setSelectedState(v);
    setSelectedDistrict("");
    setSelectedSubDivision("");
    setSelectedPoliceStation("");
    fetchJurisdiction(v, "", "");
  }

  function handleDistrictChange(v: string) {
    setSelectedDistrict(v);
    setSelectedSubDivision("");
    setSelectedPoliceStation("");
    fetchJurisdiction(selectedState, v, "");
  }

  function handleSubDivisionChange(v: string) {
    setSelectedSubDivision(v);
    setSelectedPoliceStation("");
    fetchJurisdiction(selectedState, selectedDistrict, v);
  }

  // ── Search ──
  const runSearch = useCallback(
    async (params: {
      query: string;
      state: string;
      district: string;
      subDivision: string;
      policeStation: string;
      fromDate: string;
      toDate: string;
    }) => {
      setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const sp = new URLSearchParams();
        if (params.query) sp.set("query", params.query);
        if (params.state) sp.set("state", params.state);
        if (params.district) sp.set("district", params.district);
        if (params.subDivision) sp.set("subDivision", params.subDivision);
        if (params.policeStation) sp.set("policeStation", params.policeStation);
        if (params.fromDate) sp.set("fromDate", params.fromDate);
        if (params.toDate) sp.set("toDate", params.toDate);

        const res = await fetch(`/api/search?${sp.toString()}`);
        if (!res.ok) throw new Error("Search request failed");
        const data = await res.json();
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-search with debounce on any filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch({
        query: searchQuery,
        state: selectedState,
        district: selectedDistrict,
        subDivision: selectedSubDivision,
        policeStation: selectedPoliceStation,
        fromDate,
        toDate,
      });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    searchQuery,
    selectedState,
    selectedDistrict,
    selectedSubDivision,
    selectedPoliceStation,
    fromDate,
    toDate,
    runSearch,
  ]);

  function clearAll() {
    setSearchQuery("");
    setSelectedState("");
    setSelectedDistrict("");
    setSelectedSubDivision("");
    setSelectedPoliceStation("");
    setFromDate("");
    setToDate("");
    fetchJurisdiction("", "", "");
  }

  const hasFilters = Boolean(
    searchQuery ||
      selectedState ||
      selectedDistrict ||
      selectedSubDivision ||
      selectedPoliceStation ||
      fromDate ||
      toDate
  );

  function formatCurrency(amount: number | null): string {
    if (amount === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    try {
      const ymdMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10) - 1;
        const day = parseInt(ymdMatch[3], 10);
        return new Date(year, month, day, 12, 0, 0).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return String(dateStr);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0052FF]/10">
            <Search className="h-5 w-5 text-[#0052FF]" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              FIR Global Search
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search and filter FIR records by number, state jurisdiction, and registration date
            </p>
          </div>
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Global Search Bar */}
        <div className="border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="fir-search-bar"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by FIR number — partial match (e.g. 1220 matches 1220(8)2023 LPS)…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none transition-all focus:border-[#0052FF] focus:bg-white focus:ring-4 focus:ring-[#0052FF]/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-[#4D7CFF] dark:focus:bg-slate-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Jurisdiction + Date Filters */}
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              FILTERS
              {loadingJurisdiction && (
                <Loader2 className="h-3 w-3 animate-spin text-[#0052FF]" />
              )}
            </div>
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <RefreshCw className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {/* State */}
            <FilterSelect
              id="filter-state"
              label="State"
              value={selectedState}
              options={jurisdiction.states}
              onChange={handleStateChange}
              placeholder="All States"
              icon={Landmark}
            />

            {/* District */}
            <FilterSelect
              id="filter-district"
              label="District"
              value={selectedDistrict}
              options={jurisdiction.districts}
              onChange={handleDistrictChange}
              disabled={jurisdiction.districts.length === 0}
              placeholder="All Districts"
              icon={MapPin}
            />

            {/* Sub-Division */}
            <FilterSelect
              id="filter-subdivision"
              label="Sub-Division"
              value={selectedSubDivision}
              options={jurisdiction.subDivisions}
              onChange={handleSubDivisionChange}
              disabled={jurisdiction.subDivisions.length === 0}
              placeholder="All Sub-Divisions"
              icon={MapPin}
            />

            {/* Police Station */}
            <FilterSelect
              id="filter-police-station"
              label="Police Station"
              value={selectedPoliceStation}
              options={jurisdiction.policeStations}
              onChange={setSelectedPoliceStation}
              disabled={jurisdiction.policeStations.length === 0}
              placeholder="All Stations"
              icon={MapPin}
            />

            {/* From Date */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="filter-from-date"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                <Calendar className="h-3 w-3" />
                From Date
              </label>
              <div className="relative">
                <input
                  id="filter-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={`flex h-10 w-full items-center rounded-xl border px-3 text-sm transition-all duration-200 outline-none ${
                    fromDate
                      ? "border-[#0052FF]/40 bg-[#0052FF]/5 text-slate-900 dark:border-[#4D7CFF]/40 dark:bg-[#4D7CFF]/10 dark:text-white"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  } hover:border-[#0052FF]/40 focus:border-[#0052FF]`}
                />
                {fromDate && (
                  <button
                    type="button"
                    onClick={() => setFromDate("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-0.5 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            </div>

            {/* To Date */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="filter-to-date"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                <Calendar className="h-3 w-3" />
                To Date
              </label>
              <div className="relative">
                <input
                  id="filter-to-date"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={`flex h-10 w-full items-center rounded-xl border px-3 text-sm transition-all duration-200 outline-none ${
                    toDate
                      ? "border-[#0052FF]/40 bg-[#0052FF]/5 text-slate-900 dark:border-[#4D7CFF]/40 dark:bg-[#4D7CFF]/10 dark:text-white"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  } hover:border-[#0052FF]/40 focus:border-[#0052FF]`}
                />
                {toDate && (
                  <button
                    type="button"
                    onClick={() => setToDate("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-0.5 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Results Section ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-[#0052FF]" />
          <p className="text-xs text-slate-400">Searching indexed FIR records…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/50 py-12 text-center dark:border-red-900/30 dark:bg-red-950/20">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Search Failed</p>
            <p className="mt-1 text-xs text-red-500 dark:text-red-500">{error}</p>
          </div>
          <button
            onClick={() =>
              runSearch({
                query: searchQuery,
                state: selectedState,
                district: selectedDistrict,
                subDivision: selectedSubDivision,
                policeStation: selectedPoliceStation,
                fromDate,
                toDate,
              })
            }
            className="mt-1 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white py-20 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No FIR records found
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Try adjusting your search criteria or upload FIR documents to index them.
            </p>
          </div>
        </div>
      ) : results.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Table header with count */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Results
              </span>
              <span className="rounded-full bg-[#0052FF]/10 px-2 py-0.5 text-xs font-bold text-[#0052FF] dark:bg-[#4D7CFF]/20 dark:text-[#4D7CFF]">
                {total}
              </span>
            </div>
            {total !== null && total >= 200 && (
              <span className="text-xs text-slate-400">Showing first 200 results</span>
            )}
          </div>

          {/* Scrollable table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Date Registered
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    FIR Number
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    State
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    District
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Police Station
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Property Loss (INR)
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {results.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`group transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20 ${
                      i % 2 === 0 ? "" : "bg-slate-50/50 dark:bg-slate-900/30"
                    }`}
                  >
                    {/* Date */}
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(row.firDate)}
                      </span>
                    </td>

                    {/* FIR Number */}
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {row.firNumber ?? (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </span>
                    </td>

                    {/* State */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {row.state ?? "Manipur"}
                      </span>
                    </td>

                    {/* District */}
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        {row.district ?? "—"}
                      </span>
                    </td>

                    {/* Police Station */}
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        {row.policeStation ?? "—"}
                      </span>
                    </td>

                    {/* Property Loss */}
                    <td className="px-5 py-3.5 text-right">
                      {row.propertyLoss !== null ? (
                        <div className="flex items-center justify-end gap-1">
                          <IndianRupee className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(row.propertyLoss)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Null</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5 text-center">
                      <button
                        id={`view-pdf-${row.fileId}`}
                        onClick={() =>
                          router.push(`/dashboard/pdf/${row.fileId}?mode=view`)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0052FF]/10 px-3 py-1.5 text-xs font-semibold text-[#0052FF] transition-all hover:bg-[#0052FF] hover:text-white dark:bg-[#4D7CFF]/15 dark:text-[#4D7CFF] dark:hover:bg-[#4D7CFF] dark:hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
