/**
 * Icon layer — Phosphor icons behind the app's original icon names.
 *
 * Replaces lucide-react with @phosphor-icons/react:
 *   - Every component exported here maps to a Phosphor icon (verified against
 *     the installed package's exports; aliases resolve semantic equivalents,
 *     e.g. ShieldAlert -> ShieldWarning, Search -> MagnifyingGlass).
 *   - Stroke width is standardized: `weight="regular"` is forced, and lucide's
 *     `strokeWidth` prop is swallowed so leftover call sites can't drift the
 *     weight. Per-icon `weight` overrides are still forwarded if ever needed.
 *   - `size` defaults to 24 (lucide's default) when not passed, so bare icon
 *     usages keep their previous dimensions.
 */
import React from "react";
import * as Ph from "@phosphor-icons/react";

/** Standardized stroke weight across the app (Phosphor's "regular" ≈ 2px). */
const WEIGHT = "regular";

function withWeight(Icon) {
  const Adapter = ({ strokeWidth, size = 24, weight = WEIGHT, ...props }) =>
    React.createElement(Icon, { weight, size, ...props });
  Adapter.displayName = `Icon(${Icon.displayName || "Phosphor"})`;
  return Adapter;
}

export const Activity = withWeight(Ph.Pulse);
export const AlertCircle = withWeight(Ph.WarningCircle);
export const AlertTriangle = withWeight(Ph.Warning);
export const AlignJustify = withWeight(Ph.List);
export const ArrowRight = withWeight(Ph.ArrowRight);
export const ArrowUpRight = withWeight(Ph.ArrowUpRight);
export const BarChart3 = withWeight(Ph.ChartBar);
export const Bell = withWeight(Ph.Bell);
export const Binary = withWeight(Ph.Binary);
export const Bookmark = withWeight(Ph.Bookmark);
export const Brain = withWeight(Ph.Brain);
export const BrainCircuit = withWeight(Ph.Brain);
export const Building2 = withWeight(Ph.Buildings);
export const Check = withWeight(Ph.Check);
export const CheckCircle = withWeight(Ph.CheckCircle);
export const CheckCircle2 = withWeight(Ph.CheckCircle);
export const ChevronDown = withWeight(Ph.CaretDown);
export const ChevronRight = withWeight(Ph.CaretRight);
export const ChevronUp = withWeight(Ph.CaretUp);
export const Clock = withWeight(Ph.Clock);
export const Code = withWeight(Ph.Code);
export const Code2 = withWeight(Ph.Code);
export const Cog = withWeight(Ph.Gear);
export const Command = withWeight(Ph.Command);
export const Component = withWeight(Ph.SquaresFour);
export const Copy = withWeight(Ph.Copy);
export const Cpu = withWeight(Ph.Cpu);
export const Database = withWeight(Ph.Database);
export const Download = withWeight(Ph.Download);
export const Expand = withWeight(Ph.ArrowsOut);
export const ExternalLink = withWeight(Ph.ArrowSquareOut);
export const File = withWeight(Ph.File);
export const FileCode2 = withWeight(Ph.FileCode);
export const FileDown = withWeight(Ph.FileArrowDown);
export const FileText = withWeight(Ph.FileText);
export const FileWarning = withWeight(Ph.FileLock);
export const Filter = withWeight(Ph.Funnel);
export const FolderOpen = withWeight(Ph.FolderOpen);
export const Gauge = withWeight(Ph.Gauge);
export const GitBranch = withWeight(Ph.GitBranch);
export const GitCommit = withWeight(Ph.GitCommit);
export const GitMerge = withWeight(Ph.GitMerge);
export const GitPullRequest = withWeight(Ph.GitPullRequest);
export const Globe = withWeight(Ph.Globe);
export const Info = withWeight(Ph.Info);
export const Keyboard = withWeight(Ph.Keyboard);
export const Layers = withWeight(Ph.Stack);
export const LayoutDashboard = withWeight(Ph.Layout);
export const Lock = withWeight(Ph.Lock);
export const LockOpen = withWeight(Ph.LockOpen);
export const MessageSquare = withWeight(Ph.Chat);
export const Minus = withWeight(Ph.Minus);
export const Package = withWeight(Ph.Package);
export const Palette = withWeight(Ph.Palette);
export const Plus = withWeight(Ph.Plus);
export const RefreshCw = withWeight(Ph.ArrowsClockwise);
export const Route = withWeight(Ph.Path);
export const Scan = withWeight(Ph.Scan);
export const Search = withWeight(Ph.MagnifyingGlass);
export const Send = withWeight(Ph.PaperPlaneTilt);
export const Server = withWeight(Ph.HardDrives);
export const Settings = withWeight(Ph.SlidersHorizontal);
export const Share2 = withWeight(Ph.ShareNetwork);
export const Shield = withWeight(Ph.Shield);
export const ShieldAlert = withWeight(Ph.ShieldWarning);
export const ShieldCheck = withWeight(Ph.ShieldCheck);
export const Star = withWeight(Ph.Star);
export const Trash2 = withWeight(Ph.Trash);
export const TrendingDown = withWeight(Ph.TrendDown);
export const TrendingUp = withWeight(Ph.TrendUp);
export const Workflow = withWeight(Ph.FlowArrow);
export const Wrench = withWeight(Ph.Wrench);
export const X = withWeight(Ph.X);
export const XCircle = withWeight(Ph.XCircle);
export const Zap = withWeight(Ph.Lightning);
export const ZoomIn = withWeight(Ph.MagnifyingGlassPlus);
export const ZoomOut = withWeight(Ph.MagnifyingGlassMinus);
