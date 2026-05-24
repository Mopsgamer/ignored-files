import ms from "ms"
import * as fs from "node:fs"
import * as vign from "view-ignored"
import {
	MatcherContext,
	matcherContextAddPath,
	matcherContextRemovePath,
} from "view-ignored/patterns"
import * as vscode from "vscode"

import { collectCauses } from "./collectCauses.js"
import { setScanning } from "./context.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri, pathToUri } from "./parseUri.js"
import { nameFromTarget, targetFromName } from "./targetName.js"

export type DecorationKind = "ignored" | "included" | "unknown"

export class DecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private readonly onDidChange = new vscode.EventEmitter<vscode.Uri>()
	readonly onDidChangeFileDecorations = this.onDidChange.event.bind(this.onDidChange)

	private decorations = new Map<string, DecorationKind>()

	// @ts-expect-error initialized by init
	private ctx: MatcherContext

	constructor() {}

	async init(options?: Partial<Omit<vign.ScanOptions, "cwd">>): Promise<void> {
		setScanning(true)
		await this.scan(options)
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			setScanning(true)
			void this.scan(options)
		})
		this.watch()
	}

	private aborter = new AbortController()
	private options: Required<Omit<vign.ScanOptions, "cwd">> = {
		target: targetFromName("Git"),
		fastDepth: true,
		fastInternal: true,
		invert: false,
		depth: Infinity,
		fs,
		signal: null,
		within: ".",
	}

	private async scan(options?: Partial<Omit<vign.ScanOptions, "cwd">>): Promise<void> {
		assignOpt(this.options, options)
		setScanning(true)
		using _ = { [Symbol.dispose]: () => setScanning(false) }
		await this.clear()
		if (!vscode.workspace.workspaceFolders) {
			return
		}
		for (const directory of vscode.workspace.workspaceFolders) {
			const cwd = directory.uri.fsPath
			const ctx = await vign.scan({ ...this.options, cwd })
			this.ctx = ctx
			for (const [file, _match] of ctx.paths) {
				if (file.endsWith("/")) {
					continue
				}
				const uri = pathToUri(cwd, file)
				this.add(uri)
			}
		}
	}

	/**
	 * This function recalculates decoration.
	 */
	add(uri: vscode.Uri) {
		const ignored = this.options.invert
		const decoration = ignored ? "ignored" : "included"
		this.decorations.set(uri.fsPath, decoration)
		this.onDidChange.fire(uri)
	}
	/**
	 * This function recalculates decoration.
	 */
	del(uri: vscode.Uri) {
		this.decorations.delete(uri.fsPath)
		this.onDidChange.fire(uri)
	}

	scanWithProgress(options: Omit<vign.ScanOptions, "cwd">) {
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
		const targetName = nameFromTarget(options.target)
		return new Promise<void>((resolve) => {
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Scanning for ${targetName} files...`,
					cancellable: true,
				},
				async (_progress, token) => {
					const aborter = new AbortController()
					token.onCancellationRequested(() => {
						aborter.abort()
					})
					const signals = [this.aborter.signal, aborter.signal]
					if (options.signal) {
						signals.push(options.signal)
					}
					try {
						await this.scan({
							...options,
							signal: AbortSignal.any(signals),
						})
					} catch (err) {
						if ((err as DOMException).name === "TimeoutError") {
							vscode.window.showWarningMessage(`Scanning for ${targetName} files timed out (20s).`)
							return
						}

						if (err instanceof Error) {
							const detail = collectCauses(err).join(": ")
							void vscode.window.showErrorMessage("Failed to scan " + targetName, {
								modal: true,
								detail,
							})
							output.error(targetName + ": " + detail)
							return
						}
						output.error(String(err))
					} finally {
						resolve()
					}
				},
			)
		})
	}

	private watch(signal: AbortSignal | null = null): void {
		const start = Date.now()
		const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false)
		output.info("Started watching in " + ms(Date.now() - start))
		signal?.addEventListener("abort", async () => {
			const start = Date.now()
			watcher.dispose()
			setScanning(false)
			output.info("Stopped watching in " + ms(Date.now() - start))
		})
		watcher.onDidChange(async (uri) => {
			const f = parseUri(uri)
			if (!f) return
			const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
			setScanning(true)
			output.info("File changed:", f.entry)
			using _ = { [Symbol.dispose]: () => setScanning(false) }
			this.del(uri)
			const before = new Set(this.ctx.paths.keys())
			await matcherContextRemovePath(this.ctx, opts, f.entry)
			await matcherContextAddPath(this.ctx, opts, f.entry)
			const after = new Set(this.ctx.paths.keys())
			const added = Array.from(after.difference(before)),
				removed = Array.from(before.difference(after))
			output.info("Added:", f.entry, added)
			for (const element of added) {
				if (element.endsWith("/")) continue
				const uri = pathToUri(f.cwd, element)
				this.add(uri)
			}
			output.info("Deleted:", f.entry, removed)
			for (const element of removed) {
				if (element.endsWith("/")) continue
				const uri = pathToUri(f.cwd, element)
				this.del(uri)
			}
		})
		watcher.onDidCreate(async (uri) => {
			const f = parseUri(uri)
			if (!f) return
			const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
			setScanning(true)
			output.info("File created:", f.entry)
			using _ = { [Symbol.dispose]: () => setScanning(false) }
			await matcherContextAddPath(this.ctx, opts, f.entry)
			this.add(uri)
		})
		watcher.onDidDelete(async (uri) => {
			const f = parseUri(uri)
			if (!f) return
			const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
			setScanning(true)
			output.info("File deleted:", f.entry)
			using _ = { [Symbol.dispose]: () => setScanning(false) }
			await matcherContextRemovePath(this.ctx, opts, f.entry)
			this.del(uri)
		})
	}

	async clear(): Promise<void> {
		this.deinit()
		const map = this.decorations
		this.decorations = new Map<string, DecorationKind>()
		for (const [fsPath] of map) {
			const uri = vscode.Uri.file(fsPath)
			this.del(uri)
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		if (!this.ctx || this.decorations.size < 0) return
		const target = this.options.target
		const parsed = parseUri(uri)
		if (!parsed) {
			return
		}
		const { entry } = parsed
		const match = this.ctx?.paths.get(entry)
		const explanation = match
			? explain(this.options?.invert ?? false, match, target)
			: "Internal error, couldn't find " + entry
		switch (this.decorations.get(uri.fsPath)) {
			case "ignored":
				return {
					badge: "-",
					tooltip: explanation,
					propagate: true,
					color: new vscode.ThemeColor("gitDecoration.ignoredResourceForeground"),
				}
			case "included":
				return {
					badge: "+",
					tooltip: explanation,
					propagate: true,
					color: new vscode.ThemeColor("gitDecoration.untrackedResourceForeground"),
				}
			default:
				return
		}
	}

	/**
	 * Disposes current scanning `scan` and `watch` operations.
	 * Use `init` to restart them again.
	 */
	deinit(): void {
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
	}

	/**
	 * Runs only on `extension.deactivate` event. Never use it.
	 */
	dispose() {
		try {
			this.aborter.abort()
		} catch {}
		this.clear()
	}
}

function assignOpt(target: any, ...sources: any[]) {
	for (const src of sources) {
		if (!src) continue
		for (const key in src) {
			if (!Object.hasOwn(src, key) || src[key] === undefined) continue
			target[key] = src[key]
		}
	}
	return target
}
