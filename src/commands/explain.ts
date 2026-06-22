import ms from "ms"
import * as nodefs from "node:fs"
import { dirname, join } from "node:path"
import { resolveSources, RuleMatch } from "view-ignored/patterns"
import * as vscode from "vscode"

import { collectCauses } from "../collectCauses.js"
import { explain } from "../explain.js"
import { output } from "../output.js"
import { parseUri } from "../parseUri.js"
import { pickTarget } from "../pickValue.js"
import { targetMakerFromName, TargetName } from "../targetName.js"

export default async function (entryUri: vscode.Uri): Promise<void> {
	if (!(entryUri instanceof vscode.Uri)) return
	const parsed = parseUri(entryUri)
	if (!parsed) return
	const { cwd, entry } = parsed
	const title = "Explain ignoring for " + entry
	const aborter = new AbortController()
	const unixCwd = cwd.replace(/\w:/, "")
	const targetName = await pickTarget(title, false)
	if (!targetName) return
	const targetMaker = targetMakerFromName(targetName as TargetName)
	const target = targetMaker()
	const fs = { readFile: nodefs.readFile, readdir: nodefs.readdir }
	output.info("Explaining '" + entry + "'. targetName is " + targetName)
	output.info("Scanning to explain...")
	const start = Date.now()
	let match: RuleMatch
	try {
		using _t = setTimeout(aborter.abort.bind(aborter), 5000)
		await new Promise<void>((r, j) =>
			target.init?.({ cwd: unixCwd, fs, signal: aborter.signal, target }, (err) => {
				if (err) {
					j(err)
					return
				}
				r()
			}),
		)
		const dir = dirname(entry)
		const entries = await nodefs.promises.readdir(join(cwd, dir), { withFileTypes: true })
		match = await new Promise<RuleMatch>((r, j) => {
			resolveSources(
				{
					cwd: unixCwd,
					dir,
					external: new Map(),
					fs,
					signal: aborter.signal,
					target,
					entries,
				},
				(err, resource) => {
					if (err) {
						j(err)
						return
					}
					target.ignores(
						{
							cwd: unixCwd,
							entry,
							fs,
							signal: aborter.signal,
							target,
							lowerEntry: entry.toLocaleLowerCase(),
							parentPath: dir,
							resource,
						},
						(err, match) => {
							if (err) {
								j(err)
								return
							}
							r(match)
						},
					)
				},
			)
		})
	} catch (err) {
		if (err instanceof Error) {
			const detail = collectCauses(err).join(": ")
			void vscode.window.showErrorMessage("Failed to explain " + entry, { modal: true, detail })
			output.error("'" + entry + "': " + detail)
			return
		}
		output.error(String(err))
		throw err
	}
	output.info("'" + entry + "' has been explained in", ms(Date.now() - start, { long: true }))
	const explanation = explain(false, match, targetName as TargetName)
	output.info("Got the explanation message: " + explanation)
	void vscode.window.showInformationMessage(entry, { modal: true, detail: explanation })
}
