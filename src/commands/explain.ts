import ms from "ms"
import * as nodefs from "node:fs"
import { dirname, join, basename } from "node:path"
import { resolveSources, Resource, RuleMatch } from "view-ignored/patterns"
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
	const { cwd: cwdPlatform, entry } = parsed
	const title = "Explain ignoring for " + entry
	const aborter = new AbortController()
	const cwd = cwdPlatform.replace(/\w:/, "")
	const choice = await pickTarget(title, false)
	if (!choice) return
	const { targetName } = choice
	const targetMaker = targetMakerFromName(targetName as TargetName)
	const target = targetMaker()
	const fs = { readFile: nodefs.readFile, readdir: nodefs.readdir, stat: nodefs.stat }
	output.info("Explaining '" + entry + "'. targetName is " + targetName)
	output.info("Scanning to explain...")
	const start = Date.now()
	function errh(err: unknown): void {
		if (err instanceof Error) {
			const detail = collectCauses(err).join(": ")
			void vscode.window.showErrorMessage("Failed to explain " + entry, { modal: true, detail })
			output.error("'" + entry + "': " + detail)
			return
		}
		output.error(String(err))
		throw err
	}
	using _t = setTimeout(aborter.abort.bind(aborter), 5000)
	try {
		const { promise, resolve: rs, reject: rj } = Promise.withResolvers<void>()
		target.init?.({ cwd, fs, signal: aborter.signal, target }, (err) => (err ? rj(err) : rs()))
		await promise
	} catch (err) {
		errh(err)
		return
	}
	const dir = dirname(entry)
	const entries = await nodefs.promises.readdir(join(cwdPlatform, dir), { withFileTypes: true })
	const entryBasename = basename(entry)
	const dirent = entries.find((e) => e.name === entryBasename)!
	let resource: Resource
	try {
		const { promise, resolve: rs, reject: rj } = Promise.withResolvers<Resource>()
		resolveSources(
			{
				cwd: cwd,
				dir,
				external: new Map(),
				fs,
				signal: aborter.signal,
				target,
				entries,
			},
			(err, resource) => (err ? rj(err) : rs(resource)),
		)
		resource = await promise
	} catch (err) {
		errh(err)
		return
	}
	let match: RuleMatch
	try {
		const { promise, resolve: rs, reject: rj } = Promise.withResolvers<RuleMatch>()
		target.ignores(
			{
				cwd: cwd,
				entry,
				dirent,
				fs,
				signal: aborter.signal,
				target,
				lowerEntry: entry.toLocaleLowerCase(),
				parentPath: dir,
				resource,
			},
			(err, match) => (err ? rj(err) : rs(match)),
		)
		match = await promise
	} catch (err) {
		errh(err)
		return
	}
	output.info("'" + entry + "' has been explained in", ms(Date.now() - start, { long: true }))
	const explanation = explain(match, targetName as TargetName)
	output.info("Got the explanation message: " + explanation)
	void vscode.window.showInformationMessage(entry, { modal: true, detail: explanation })
}
