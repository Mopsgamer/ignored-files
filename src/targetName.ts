import * as targets from "view-ignored/targets"

export type TargetName = "NPM" | "JSR" | "Yarn" | "VSCE" | "Git"

export const targetNames: TargetName[] = ["NPM", "JSR", "Yarn", "VSCE", "Git"]

export function targetFromName(name: TargetName): targets.Target {
	switch (name) {
		case "NPM":
			return targets.NPM
		case "JSR":
			return targets.JSR
		case "Yarn":
			return targets.Yarn
		case "VSCE":
			return targets.VSCE
		case "Git":
			return targets.Git
	}
}

export function nameFromTarget(target: targets.Target): TargetName | undefined {
	switch (target) {
		case targets.NPM:
			return "NPM"
		case targets.JSR:
			return "JSR"
		case targets.Yarn:
			return "Yarn"
		case targets.VSCE:
			return "VSCE"
		case targets.Git:
			return "Git"
		default:
			return undefined
	}
}
