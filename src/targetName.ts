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

export function nameFromTarget(target: targets.Target): TargetName | undefined {
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
			return undefined
	}
}
