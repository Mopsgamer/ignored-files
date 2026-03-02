import { FsAdapter } from "view-ignored"
import { MatcherContext } from "view-ignored/patterns"
import * as targets from "view-ignored/targets"

export type TargetName = "NPM" | "Yarn" | "Yarn classic" | "VSCE" | "Git" | "Bun" | "Deno" | "JSR"

export const targetNames: TargetName[] = [
	"NPM",
	"Yarn",
	"Yarn classic",
	"VSCE",
	"Git",
	"Bun",
	"Deno",
	"JSR",
]

export const targetProviders = targetNames.map(targetFromName)

export function targetFromName(name: TargetName): targets.Target {
	switch (name) {
		case "NPM":
			return targets.NPM
		case "Yarn":
			return targets.Yarn
		case "Yarn classic":
			return targets.YarnClassic
		case "VSCE":
			return targets.VSCE
		case "Git":
			return targets.Git
		case "Bun":
			return targets.Bun
		case "Deno":
			return targets.Deno
		case "JSR":
			return targets.JSR
	}
}

export function nameFromTarget(target: targets.Target): TargetName {
	switch (target) {
		case targets.NPM:
			return "NPM"
		case targets.Yarn:
			return "Yarn"
		case targets.YarnClassic:
			return "Yarn classic"
		case targets.VSCE:
			return "VSCE"
		case targets.Git:
			return "Git"
		case targets.Bun:
			return "Bun"
		case targets.Deno:
			return "Deno"
		case targets.JSR:
			return "JSR"
		default:
			throw new TypeError("Unknown target")
	}
}

export async function relatedTargets(
	cwd: string,
	fs: FsAdapter,
	signal: AbortSignal,
): Promise<targets.Target[]> {
	const safeTargets: targets.Target[] = []
	for (const target of targetProviders) {
		if (!target.init) {
			safeTargets.push(target)
			continue
		}

		try {
			const tempCtx: MatcherContext = {
				depthPaths: new Map(),
				external: new Map(),
				failed: [],
				paths: new Map(),
				totalDirs: 0,
				totalFiles: 0,
				totalMatchedFiles: 0,
			}
			await target.init?.({ ctx: tempCtx, cwd, fs, signal, target })
		} catch {
			continue
		}
		safeTargets.push(target)
	}
	return safeTargets
}
