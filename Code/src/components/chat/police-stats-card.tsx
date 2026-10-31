"use client";

import React, { useState, useMemo } from "react";
import {
  Shield,
  Building2,
  TrendingUp,
  AlertCircle,
  FileText,
  Search,
  CheckCircle2,
  Users,
  BarChart3,
  Scale,
  DollarSign,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import type { PoliceStatsData } from "@/lib/police-stats";

interface PoliceStatsCardProps {
  rawJson: string;
  onPromptClick?: (prompt: string) => void;
}

export function PoliceStatsCard({ rawJson, onPromptClick }: PoliceStatsCardProps) {
  const [activeTab, setActiveTab] = useState<"stations" | "crimes" | "loss" | "evidence">("stations");
  const [showTechnical, setShowTechnical] = useState(false);

  // Parse raw JSON safely
  const data = useMemo<PoliceStatsData | null>(() => {
    try {
      const trimmed = rawJson.trim();
      return JSON.parse(trimmed) as PoliceStatsData;
    } catch {
      return null;
    }
  }, [rawJson]);

  if (!data) {
    return (
      <div className="my-3 rounded-2xl border border-blue-500/30 bg-blue-50/50 p-4 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 animate-spin text-[#0052FF]" />
          <span>Analyzing police repository and generating intelligence graphs…</span>
        </div>
      </div>
    );
  }

  const { summary, stations, districts, crimeCategories, highLossCases, zeroFirs, personnel, technical } = data;

  return (
    <div className="my-4 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md transition-all dark:border-slate-800 dark:bg-slate-900/95">
      {/* 1. POLICE HEADER BANNER */}
      <div className="relative border-b border-slate-200/80 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 px-5 py-4 text-white dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md shadow-amber-500/20">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
                  CRIME RECORDS BUREAU (CRB)
                </span>
                <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                  Live Intelligence
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-white">
                Police Records & Investigation Statistics
              </h3>
              <p className="text-[11px] text-slate-300">
                {data.scopeLabel} • Generated {data.generatedAt}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-300">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              <span>{personnel.activeNow} Officers Online</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. TOP EXECUTIVE METRICS ROW */}
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4 sm:gap-3 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200/70 dark:border-slate-800/70">
        {/* Metric 1: Total FIRs */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">Total Registered FIRs</span>
            <FileText className="h-4 w-4 text-[#0052FF]" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-display text-slate-900 dark:text-white">
              {summary.totalFirs}
            </span>
            <span className="text-[11px] text-slate-400">({summary.totalFiles} docs)</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>100% Vector Indexed</span>
          </div>
        </div>

        {/* Metric 2: Active Police Stations */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">Active Jurisdictions</span>
            <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-display text-slate-900 dark:text-white">
              {summary.totalStations}
            </span>
            <span className="text-[11px] text-slate-400">Stations</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Across {summary.totalDistricts} Operational Districts
          </div>
        </div>

        {/* Metric 3: Total Property Loss */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">Reported Property Loss</span>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-display text-amber-600 dark:text-amber-400">
              {summary.formattedTotalLoss}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Valuation recorded across crime scenes
          </div>
        </div>

        {/* Metric 4: Zero FIRs */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/90">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">Zero FIR Transfers</span>
            <AlertCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-display text-purple-600 dark:text-purple-400">
              {summary.zeroFirCount}
            </span>
            <span className="text-[11px] text-slate-400">Case(s)</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Inter-station jurisdiction transfer
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE NAVIGATION TABS */}
      <div className="flex items-center gap-1 border-b border-slate-200 px-4 pt-2.5 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("stations")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "stations"
              ? "border-[#0052FF] text-[#0052FF] dark:border-[#4D7CFF] dark:text-[#4D7CFF]"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Station Breakdown ({stations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("crimes")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "crimes"
              ? "border-[#0052FF] text-[#0052FF] dark:border-[#4D7CFF] dark:text-[#4D7CFF]"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>Crime & Acts ({crimeCategories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("loss")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "loss"
              ? "border-[#0052FF] text-[#0052FF] dark:border-[#4D7CFF] dark:text-[#4D7CFF]"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Property Loss ({summary.formattedTotalLoss})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("evidence")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === "evidence"
              ? "border-[#0052FF] text-[#0052FF] dark:border-[#4D7CFF] dark:text-[#4D7CFF]"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Digitization & Roster</span>
        </button>
      </div>

      {/* 4. TAB PANELS WITH INTERACTIVE GRAPHS */}
      <div className="p-4 sm:p-5">
        {/* TAB 1: POLICE STATION BREAKDOWN (HORIZONTAL BAR CHARTS) */}
        {activeTab === "stations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  FIR Case Volume by Police Station
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribution of registered FIR records across operational stations
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Total {summary.totalFirs} FIRs
                </span>
              </div>
            </div>

            {/* Visual Bar Graphs List */}
            <div className="space-y-3 pt-1">
              {stations.map((st, idx) => {
                // Color palette based on index
                const colors = [
                  "from-blue-600 to-indigo-600",
                  "from-indigo-600 to-purple-600",
                  "from-purple-600 to-pink-600",
                  "from-teal-600 to-emerald-600",
                  "from-amber-600 to-orange-600",
                  "from-cyan-600 to-blue-600",
                ];
                const gradient = colors[idx % colors.length];

                return (
                  <div
                    key={st.name}
                    className="group rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 transition-all hover:border-[#0052FF]/40 hover:bg-white hover:shadow-xs dark:border-slate-800/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {st.name}
                        </span>
                        <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {st.district}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {st.propertyLoss > 0 && (
                          <span className="font-mono text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            Loss: ₹ {new Intl.NumberFormat("en-IN").format(st.propertyLoss)}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-white">
                          {st.count} FIR{st.count !== 1 ? "s" : ""}
                        </span>
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0052FF] dark:bg-blue-900/40 dark:text-blue-300">
                          {st.percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700`}
                        style={{ width: `${Math.max(6, st.percentage)}%` }}
                      />
                    </div>

                    {/* Sample FIRs & Quick Filter */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-800/50 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <span className="text-[10px] uppercase font-semibold">FIRs:</span>
                        {st.firNumbers.map((fir) => (
                          <span
                            key={fir}
                            className="rounded border border-slate-200 bg-white px-1.5 py-0.2 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {fir}
                          </span>
                        ))}
                      </div>

                      {onPromptClick && (
                        <button
                          type="button"
                          onClick={() =>
                            onPromptClick(
                              `Show full investigation details and list all FIRs registered under ${st.name}`
                            )
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0052FF] hover:underline dark:text-[#4D7CFF]"
                        >
                          <span>Investigate Station</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* District Jurisdiction Breakdown Pills */}
            <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                District Jurisdiction Distribution
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {districts.map((d) => (
                  <div
                    key={d.name}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-2xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {d.count} ({d.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CRIME CATEGORIES & LEGAL SECTIONS (IPC / BNS) */}
        {activeTab === "crimes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Crime Classification & Legal Sections (IPC / BNS)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Offense distribution mapped to statutory penal provisions and special enactments
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {crimeCategories.map((cat) => {
                const badgeColor =
                  cat.severity === "critical"
                    ? "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"
                    : cat.severity === "high"
                    ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
                    : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";

                return (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-all hover:bg-white hover:shadow-xs dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800/70"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {cat.name}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeColor}`}
                        >
                          {cat.severity}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {cat.count} Case{cat.count !== 1 ? "s" : ""}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {cat.percentage}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-1">
                      <span className="font-mono text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Governing Sections: <span className="text-indigo-600 dark:text-indigo-400">{cat.acts}</span>
                      </span>
                    </div>

                    {/* Progress Bar with category color */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(6, cat.percentage)}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>

                    {/* Examples & Action */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-800/50 text-[11px]">
                      {cat.examples.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <span className="text-[10px] uppercase font-semibold">Instances:</span>
                          {cat.examples.map((ex) => (
                            <span
                              key={ex}
                              className="rounded border border-slate-200 bg-white px-1.5 py-0.2 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {ex}
                            </span>
                          ))}
                        </div>
                      )}

                      {onPromptClick && (
                        <button
                          type="button"
                          onClick={() =>
                            onPromptClick(
                              `Analyze and summarize all cases pertaining to ${cat.name} (${cat.acts})`
                            )
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0052FF] hover:underline dark:text-[#4D7CFF]"
                        >
                          <span>Examine Offenses</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: REPORTED PROPERTY LOSS & HIGH-VALUATION CASES */}
        {activeTab === "loss" && (
          <div className="space-y-4">
            {/* Total Banner */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-amber-700 uppercase dark:text-amber-300">
                      AGGREGATE PROPERTY LOSS ASSESSED
                    </span>
                    <div className="text-xl font-bold font-display text-amber-900 dark:text-amber-100">
                      {summary.formattedTotalLoss}
                      <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                        (₹ {new Intl.NumberFormat("en-IN").format(summary.totalPropertyLoss)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-amber-800 dark:text-amber-200">
                  Recorded in {highLossCases.length} distinct case incidents
                </div>
              </div>
            </div>

            {/* High-Loss Leaderboard */}
            <div>
              <h5 className="font-display text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                High-Valuation Incident Records Leaderboard
              </h5>
              <div className="mt-2 space-y-2.5">
                {highLossCases.map((hl, idx) => {
                  const lossShare =
                    summary.totalPropertyLoss > 0
                      ? Math.round((hl.propertyLoss / summary.totalPropertyLoss) * 100)
                      : 0;

                  return (
                    <div
                      key={hl.firNumber}
                      className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            #{idx + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {hl.firNumber}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {hl.policeStation}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-display text-xs font-bold text-amber-600 dark:text-amber-400">
                            {hl.formattedLoss}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            {lossShare}% of Total
                          </span>
                        </div>
                      </div>

                      {/* Loss bar */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                          style={{ width: `${Math.max(4, lossShare)}%` }}
                        />
                      </div>

                      {hl.acts.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono text-[10px]">
                            Sections: {hl.acts.join(", ")}
                          </span>
                          {onPromptClick && (
                            <button
                              type="button"
                              onClick={() =>
                                onPromptClick(
                                  `Provide full case details, complainant statement and property loss breakdown for FIR ${hl.firNumber}`
                                )
                              }
                              className="text-[10px] font-semibold text-[#0052FF] hover:underline dark:text-[#4D7CFF]"
                            >
                              Review Case Dossier →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Zero FIR Alert Box */}
            {zeroFirs.length > 0 && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 dark:border-purple-900/50 dark:bg-purple-950/20">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <div>
                    <h6 className="text-xs font-bold text-purple-900 dark:text-purple-200">
                      Cross-Jurisdiction Zero FIR Transfer Log ({zeroFirs.length} Case)
                    </h6>
                    <p className="mt-0.5 text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                      {zeroFirs.map((z) => (
                        <span key={z.firNumber} className="block mt-1">
                          • <strong>{z.firNumber}</strong> at {z.policeStation} ({z.district}) — Transferred from Zero FIR Reference:{" "}
                          <code className="font-mono text-[11px] font-bold underline">{z.zeroFirReference}</code> under {z.acts.join(", ")}.
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DIGITIZATION PIPELINE & DUTY ROSTER */}
        {activeTab === "evidence" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Evidence Ingestion & Scanned Status */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#0052FF]" />
                  <h5 className="font-display text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Evidence Ingestion & OCR Pipeline
                  </h5>
                </div>

                <div className="mt-3 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">Scanned Physical Paper FIRs (OCR)</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {summary.scannedCount} ({Math.round((summary.scannedCount / Math.max(1, summary.totalFiles)) * 100)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{
                          width: `${Math.round((summary.scannedCount / Math.max(1, summary.totalFiles)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">Born-Digital PDF Records</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {summary.digitalCount} ({Math.round((summary.digitalCount / Math.max(1, summary.totalFiles)) * 100)}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{
                          width: `${Math.round((summary.digitalCount / Math.max(1, summary.totalFiles)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
                    <CheckCircle2 className="inline mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                    <strong>100% Vector Search Ready:</strong> All documents indexed into 768-dim vector space for multi-document FIR semantic intelligence.
                  </div>
                </div>
              </div>

              {/* Active Duty Roster */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h5 className="font-display text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Investigation Duty Roster
                  </h5>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Total Registered Personnel:{" "}
                    <strong className="text-slate-900 dark:text-white">{personnel.totalPersonnel}</strong>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Currently Active Officers:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {personnel.activeNow} Online
                    </strong>
                  </div>

                  <div className="mt-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase">On-Duty Officers:</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {personnel.dutyOfficers.map((officer) => (
                        <span
                          key={officer}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{officer}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. QUICK INVESTIGATION ACTION CHIPS */}
      {data.suggestedQueries && data.suggestedQueries.length > 0 && onPromptClick && (
        <div className="border-t border-slate-200/70 bg-slate-50/60 p-4 dark:border-slate-800/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-[#0052FF]" />
            <span>Quick Case Investigations (Click to Run):</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {data.suggestedQueries.map((query, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPromptClick(query)}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-left text-xs text-slate-700 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#0052FF]/60 hover:bg-blue-50/60 hover:text-[#0052FF] dark:border-slate-800 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-[#4D7CFF]/60 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Search className="h-3 w-3 text-slate-400 group-hover:text-[#0052FF] dark:group-hover:text-[#4D7CFF]" />
                <span>{query}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6. TECHNICAL SYSTEM FOOTNOTE (COLLAPSIBLE FOR DEVS/ADMINS) */}
      <div className="border-t border-slate-200/60 px-4 py-2.5 text-[11px] text-slate-400 dark:border-slate-800/60 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-slate-400" />
          <span>Police CRB Database • High-Security State Archive</span>
        </span>

        <button
          type="button"
          onClick={() => setShowTechnical(!showTechnical)}
          className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <span>{showTechnical ? "Hide" : "Show"} Server Telemetry</span>
          {showTechnical ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {showTechnical && (
        <div className="border-t border-slate-200/60 bg-slate-100/70 p-3 text-[11px] text-slate-600 dark:border-slate-800/60 dark:bg-slate-950/60 dark:text-slate-400">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">AI Inference Engine:</span>{" "}
              {technical.aiModel}
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Vector Embeddings:</span>{" "}
              {technical.vectorChunks} pgvector chunks (768-dim)
            </div>
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Storage Footprint:</span>{" "}
              {technical.storageMb} MB
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
