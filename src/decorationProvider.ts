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
	private readonly onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>()
	readonly onDidChangeFileDecorations = this.onDidChange.event.bind(this.onDidChange)

	private decorations = new Map<string, DecorationKind>()

	private contexts: Map<string, MatcherContext> = new Map()

	constructor() {}

	async init(
		options?: Partial<Omit<vign.ScanOptions, "cwd" | "target">> & { target?: () => Target },
	): Promise<void> {
		const start = Date.now()
		output.info("Initializing decoration provider...")
		setScanning(true)
		await this.scan(options)

		output.info("Adding workspace folders listener...")
		const l = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			setScanning(true)
			output.info("Locked workspace folders listener mutexWorspaceFolderChange")
			using folders = this.mutexWorspaceFolderChange.tryAcquire()
			using _logFolders = {
				[Symbol.dispose]: () =>
					output.info("Unlocked workspace folders listener mutexWorspaceFolderChange"),
			}
			if (!folders) {
				setScanning(false)
				return
			}
			output.info("Locked workspace folders listener mutexWatcher")
			using _scanning = this.mutexWatcher.tryAcquire()
			using _logScanning = {
				[Symbol.dispose]: () => output.info("Unlocked workspace folders listener mutexWatcher"),
			}
			await this.scan(options)
		})
		this.aborter.signal.addEventListener("abort", () => {
			output.info("Removing workspace folders listener...")
			l.dispose()
		})
		this.watch(this.aborter.signal)
		output.info("Initialized decoration provider in " + ms(Date.now() - start))
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
		setScanning(true)
		const start = Date.now()
		output.info("Scanning...")
		using _logSelf = {
			[Symbol.dispose]: () => {
				setScanning(false)
				output.info("Scanned in " + ms(Date.now() - start))
			},
		}
		this.targetMaker = options?.target || makeGit
		assignOpt(this.options, options)
		this.options.target = this.targetMaker()

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
		const start = Date.now()
		output.info("Handling " + eventName + "...")
		using _logSelf = {
			[Symbol.dispose]: () => output.info("Handled " + eventName + " in " + ms(Date.now() - start)),
		}
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
			const start = Date.now()
			const f = parseUri(uri)
			if (!f) {
				return
			}
			output.info("Locked/Waiting didAny " + eventName + " '" + f.entry + "'")
			using _mutex = await this.mutexWatcher.acquire()
			setScanning(true)
			using _notScanning = {
				[Symbol.dispose]: () => {
					setScanning(false)
					output.info(
						"Unlocked/Updated didAny " +
							eventName +
							" '" +
							f.entry +
							"' in " +
							ms(Date.now() - start),
					)
				},
			}
			await this.watchPatch(eventName, f, cb)
		}
	}

	private watchQueue: {
		eventName: string
		uri: vscode.Uri
		cb: (ctx: MatcherContext, f: { cwd: string; entry: string }) => Promise<void>
	}[] = []
	private watchDebounceTimer: NodeJS.Timeout | null = null

	private watch(signal: AbortSignal): void {
		const start = Date.now()
		const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false)
		output.info("Created watcher in " + ms(Date.now() - start))

		const queueEvent = (
			eventName: string,
			cb: (ctx: MatcherContext, f: { cwd: string; entry: string }) => Promise<void>,
		) => {
			return (uri: vscode.Uri) => {
				this.watchQueue.push({ eventName, uri, cb })

				if (this.watchDebounceTimer) {
					clearTimeout(this.watchDebounceTimer)
				}

				this.watchDebounceTimer = setTimeout(() => {
					this.flushWatchQueue()
				}, 50)
			}
		}

		const watcherListeners = [
			watcher.onDidChange(
				queueEvent("changed", async (ctx, f) => {
					const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
					await matcherContextRemovePath(ctx, opts, f.entry)
					await matcherContextAddPath(ctx, opts, f.entry)
				}),
			),
			watcher.onDidCreate(
				queueEvent("created", async (ctx, f) => {
					const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
					await matcherContextAddPath(ctx, opts, f.entry)
				}),
			),
			watcher.onDidDelete(
				queueEvent("deleted", async (ctx, f) => {
					const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
					await matcherContextRemovePath(ctx, opts, f.entry)
				}),
			),
		]

		output.info(
			"Started " + watcherListeners.length + " watcher listeners in " + ms(Date.now() - start),
		)

		const abort = async () => {
			output.info("Disposing watcher and listeners...")
			const start = Date.now()
			if (this.watchDebounceTimer) {
				clearTimeout(this.watchDebounceTimer)
			}
			this.watchQueue = []
			watcherListeners.forEach((l) => l.dispose())
			watcher.dispose()
			setScanning(false)
			output.info("Disposed watcher in " + ms(Date.now() - start))
		}

		output.info("Watcher will be disposed when signal is aborted")
		signal.addEventListener("abort", abort, { once: true })
	}

	private async flushWatchQueue(): Promise<void> {
		if (this.watchQueue.length === 0) return

		const batch = [...this.watchQueue]
		this.watchQueue = []

		const start = Date.now()
		output.info(`Locked/Waiting processing batch of ${batch.length} file system events`)

		using _mutex = await this.mutexWatcher.acquire()
		setScanning(true)

		using _notScanning = {
			[Symbol.dispose]: () => {
				setScanning(false)
				output.info(`Unlocked/Updated batch of ${batch.length} events in ` + ms(Date.now() - start))
			},
		}

		// Process each item in the batch sequentially under a single lock instance
		for (const task of batch) {
			const f = parseUri(task.uri)
			if (!f) continue
			await this.watchPatch(task.eventName, f, task.cb)
		}
	}

	async clear(): Promise<void> {
		if (this.decorations.size === 0) return
		const start = Date.now()
		output.info("Clearing...")
		await this.deinit()
		this.decorations.clear()
		this.onDidChange.fire(undefined)
		output.info("Cleared in " + ms(Date.now() - start))
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		const state = this.decorations.get(uri.fsPath)
		if (!state) return
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
		const start = Date.now()
		output.info("Deinitializing...")
		if (this.watchDebounceTimer) {
			clearTimeout(this.watchDebounceTimer)
			this.watchDebounceTimer = null
		}
		this.watchQueue = []
		using _mutex = await this.mutexWatcher.acquire()
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
		output.info("Deinitialized in " + ms(Date.now() - start))
	}

	/**
	 * Runs only on `extension.deactivate` event. Never use it.
	 */
	dispose() {
		const start = Date.now()
		output.info("Disposing...")
		if (this.watchDebounceTimer) {
			clearTimeout(this.watchDebounceTimer)
			this.watchDebounceTimer = null
		}
		this.watchQueue = []
		try {
			this.aborter.abort()
		} catch {}
		for (const sub of this.subscriptions) sub.dispose()
		this.clear()
		output.info("Disposed in " + ms(Date.now() - start))
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
