import * as fs from "fs"
import * as targets from "view-ignored/targets"
import * as vscode from "vscode"

export type TargetName =
	| "NPM"
	| "Yarn v2+, Modern"
	| "Yarn v1, Classic"
	| "VSCE"
	| "Git"
	| "Bun"
	| "Deno"
	| "JSR"

export const targetNames: TargetName[] = [
	"NPM",
	"Yarn v2+, Modern",
	"Yarn v1, Classic",
	"VSCE",
	"Git",
	"Bun",
	"Deno",
	"JSR",
]

export const targetProviders = targetNames.map((n) => targetMakerFromName(n))

export function targetMakerFromName(name: TargetName): () => targets.Target {
	switch (name) {
		case "NPM":
			return targets.makeNPM
		case "Yarn v2+, Modern":
			return targets.makeYarn
		case "Yarn v1, Classic":
			return targets.makeYarnClassic
		case "VSCE":
			return targets.makeVSCE
		case "Git":
			return targets.makeGit
		case "Bun":
			return targets.makeBun
		case "Deno":
			return targets.makeDeno
		case "JSR":
			return targets.makeJSR
	}
}

export function nameFromTargetMaker(targetMaker: () => targets.Target): TargetName {
	switch (targetMaker) {
		case targets.makeNPM:
			return "NPM"
		case targets.makeYarn:
			return "Yarn v2+, Modern"
		case targets.makeYarnClassic:
			return "Yarn v1, Classic"
		case targets.makeVSCE:
			return "VSCE"
		case targets.makeGit:
			return "Git"
		case targets.makeBun:
			return "Bun"
		case targets.makeDeno:
			return "Deno"
		case targets.makeJSR:
			return "JSR"
		default:
			throw new TypeError("Unknown target")
	}
}

export async function relatedTargetMakers(
	signal: AbortSignal | null = null,
): Promise<(() => targets.Target)[]> {
	const safeTargets: (() => targets.Target)[] = []
	if (!vscode.workspace.workspaceFolders) {
		return safeTargets
	}
	for (const folder of vscode.workspace.workspaceFolders) {
		for (const targetMaker of targetProviders) {
			const target = targetMaker()
			if (!target.init) {
				safeTargets.push(targetMaker)
				continue
			}
			try {
				await new Promise<void>((r, j) =>
					target.init?.({ cwd: folder.uri.fsPath, fs, signal, target }, (err) => {
						if (err) {
							j(err)
							return
						}
						r()
					}),
				)
			} catch {
				continue
			}
			safeTargets.push(targetMaker)
		}
	}
	return safeTargets
}
