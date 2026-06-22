import ms from "ms"
import * as fs from "node:fs"
import * as vign from "view-ignored"
import {
	MatcherContext,
	matcherContextAddPath,
	matcherContextRemovePath,
} from "view-ignored/patterns"
import { makeGit, Target } from "view-ignored/targets"
import * as vscode from "vscode"

import { setScanning } from "./context.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri, pathToUri } from "./parseUri.js"
import { Semaphore } from "./semaphore.js"
import { targetMakerFromName } from "./targetName.js"

export type DecorationKind = "ignored" | "included" | "unknown"

export class DecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private subscriptions: vscode.Disposable[] = []
	private mutexWorspaceFolderChange = new Semaphore(1)
	private mutexWatcher = new Semaphore(1)
	private readonly onDidChange = new vscode.EventEmitter<vscode.Uri>()
	readonly onDidChangeFileDecorations = this.onDidChange.event.bind(this.onDidChange)

	private decorations = new Map<string, DecorationKind>()

	private contexts: Map<string, MatcherContext> = new Map()

	constructor() {}

	async init(
		options?: Partial<Omit<vign.ScanOptions, "cwd" | "target">> & { target?: () => Target },
	): Promise<void> {
		setScanning(true)
		await this.scan(options)

		this.aborter.signal.addEventListener("abort", () => {
			vscode.workspace
				.onDidChangeWorkspaceFolders(async () => {
					setScanning(true)
					using folders = this.mutexWorspaceFolderChange.tryAcquire()
					if (!folders) {
						setScanning(false)
						return
					}
					using _scanning = this.mutexWatcher.tryAcquire()
					await this.scan(options)
				})
				.dispose()
		})
		this.watch(this.aborter.signal)
	}

	private aborter = new AbortController()
	private options: Required<Omit<vign.ScanOptions, "cwd">> = {
		target: targetMakerFromName("Git")(),
		skipDepth: true,
		skipInternal: true,
		invert: false,
		depth: Infinity,
		fs,
		signal: null,
		within: ".",
	}
	private targetMaker: () => Target = makeGit

	private async scan(
		options?: Partial<Omit<vign.ScanOptions, "cwd" | "target">> & { target?: () => Target },
	): Promise<void> {
		this.targetMaker = options?.target || makeGit
		assignOpt(this.options, options)
		this.options.target = this.targetMaker()

		setScanning(true)
		using _ = { [Symbol.dispose]: () => setScanning(false) }
		await this.clear()
		if (!vscode.workspace.workspaceFolders) return
		for (const directory of vscode.workspace.workspaceFolders) {
			const cwd = directory.uri.fsPath.replaceAll("\\", "/")
			const ctx = await vign.scan({ ...this.options, cwd })
			this.contexts.set(cwd, ctx)
			for (const [file, _match] of ctx.paths) {
				if (file.endsWith("/")) continue
				const uri = pathToUri(cwd, file)
				this.add(uri)
			}
		}
	}

	/**
	 * This function recalculates decoration.
	 */
	add(uri: vscode.Uri): void {
		const ignored = this.options.invert
		const decoration = ignored ? "ignored" : "included"
		this.decorations.set(uri.fsPath, decoration)
		this.onDidChange.fire(uri)
	}
	/**
	 * This function recalculates decoration.
	 */
	del(uri: vscode.Uri): void {
		this.decorations.delete(uri.fsPath)
		this.onDidChange.fire(uri)
	}

	private async watchPatch(
		eventName: string,
		f: { cwd: string; entry: string },
		cb: (ctx: MatcherContext, f: { cwd: string; entry: string }) => Promise<void>,
	): Promise<void> {
		const ctx = this.contexts.get(f.cwd)
		if (!ctx) return
		const before = new Set(ctx.paths.keys())
		await cb(ctx, f)
		const after = new Set(ctx.paths.keys())
		const added = Array.from(after.difference(before)),
			removed = Array.from(before.difference(after))
		if (added.length + removed.length > 0) output.info("File " + eventName + ":", f.entry)
		if (added.length > 0) output.info("Added " + f.entry + ":", added)
		for (const element of added) {
			if (element.endsWith("/")) continue
			const uri = pathToUri(f.cwd, element)
			this.add(uri)
		}
		if (removed.length > 0) output.info("Deleted " + f.entry + ":", removed)
		for (const element of removed) {
			if (element.endsWith("/")) continue
			const uri = pathToUri(f.cwd, element)
			this.del(uri)
		}
	}

	private didAny(
		eventName: string,
		cb: (ctx: MatcherContext, f: { cwd: string; entry: string }) => Promise<void>,
	): (uri: vscode.Uri) => Promise<void> {
		return async (uri: vscode.Uri) => {
			const f = parseUri(uri)
			if (!f) return
			using _mutex = await this.mutexWatcher.acquire()
			setScanning(true)
			using _notScanning = { [Symbol.dispose]: () => setScanning(false) }
			await this.watchPatch(eventName, f, cb)
		}
	}

	private watch(signal: AbortSignal | null = null): void {
		const start = Date.now()
		const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false)
		output.info("Started watching in " + ms(Date.now() - start))
		const abort = async () => {
			const start = Date.now()
			watcher.dispose()
			setScanning(false)
			output.info("Stopped watching in " + ms(Date.now() - start))
		}
		if (signal) {
			output.info("+ watch signal dispose")
			signal.addEventListener("abort", abort, { once: true })
			this.subscriptions.push({
				dispose(): void {
					output.info("- watch signal dispose")
					signal.removeEventListener("abort", abort)
					abort()
				},
			})
		}
		watcher.onDidChange(
			this.didAny("changed", async (ctx, f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextRemovePath(ctx, opts, f.entry)
				await matcherContextAddPath(ctx, opts, f.entry)
				// this.ctx = await vign.scan(opts)
			}),
		)
		watcher.onDidChange(
			this.didAny("created", async (ctx, f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextAddPath(ctx, opts, f.entry)
				// this.ctx = await vign.scan(opts)
			}),
		)
		watcher.onDidChange(
			this.didAny("deleted", async (ctx, f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextRemovePath(ctx, opts, f.entry)
				// this.ctx = await vign.scan(opts)
			}),
		)
	}

	async clear(): Promise<void> {
		await this.deinit()
		const map = this.decorations
		this.decorations = new Map<string, DecorationKind>()
		for (const [fsPath] of map) {
			const uri = vscode.Uri.file(fsPath)
			this.del(uri)
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		const parsed = parseUri(uri)
		if (!parsed) return
		const ctx = this.contexts.get(parsed.cwd)
		if (!ctx || this.decorations.size < 0) return
		const match = ctx?.paths.get(parsed.entry)
		const tooltip = match
			? explain(this.options?.invert ?? false, match, this.targetMaker)
			: "Internal error, couldn't find " + parsed.entry
		const propagate = true
		// let color: vscode.ThemeColor
		let badge: string
		switch (this.decorations.get(uri.fsPath)) {
			case "ignored":
				badge = "-"
				// color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground")
				return { badge, tooltip, propagate }
			case "included":
				badge = "+"
				// color = new vscode.ThemeColor("gitDecoration.submoduleResourceForeground")
				return { badge, tooltip, propagate }
		}
	}

	/**
	 * Disposes current scanning `scan` and `watch` operations.
	 * Use `init` to restart them again.
	 */
	async deinit(): Promise<void> {
		using _mutex = await this.mutexWatcher.acquire()
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
	}

	/**
	 * Runs only on `extension.deactivate` event. Never use it.
	 */
	dispose() {
		for (const sub of this.subscriptions) sub.dispose()
		this.clear()
		try {
			this.aborter.abort()
		} catch {}
	}
}

export const decorationProvider = new DecorationProvider()

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
