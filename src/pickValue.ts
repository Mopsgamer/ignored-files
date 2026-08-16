import * as vscode from "vscode"

import { getTarget } from "./context.js"
import { decorationProvider } from "./decorationProvider.js"
import {
	nameFromTargetMaker,
	relatedTargetMakers,
	targetMakerFromName,
	TargetName,
} from "./targetName.js"

export function pickValue(
	title: string,
	placeholder: string,
	items: Array<vscode.QuickPickItem | string>,
	onItemButton?: (item: vscode.QuickPickItem, button: vscode.QuickInputButton) => void,
): Promise<string | undefined> {
	const { promise, resolve } = Promise.withResolvers<string | undefined>()
	const quickPick = vscode.window.createQuickPick()
	quickPick.title = title
	quickPick.placeholder = placeholder
	quickPick.items = items.map((item) => (typeof item === "string" ? { label: item } : item))
	quickPick.ignoreFocusOut = true

	if (onItemButton) {
		quickPick.onDidTriggerItemButton((e) => {
			onItemButton(e.item, e.button)
			resolve(e.item.label)
			quickPick.hide()
		})
	}

	quickPick.onDidAccept(() => {
		const selection = quickPick.selectedItems[0]
		resolve(selection ? selection.label : undefined)
		quickPick.hide()
	})

	quickPick.onDidHide(() => {
		resolve(undefined)
		quickPick.dispose()
	})

	quickPick.show()
	return promise
}

function description(name: string, saved: TargetName | "None", error?: Error): string | undefined {
	const { isTemporary } = decorationProvider
	return name === saved
		? isTemporary && name !== "None" // Target temprarily disabled
			? error
				? "$(warning) Not suitable"
				: undefined
			: "$(check) Active"
		: isTemporary && name === "None" && saved !== "None"
			? "$(check) Active. " + saved + " $(pinned) is not suitable right now"
			: error
				? "$(warning) Not suitable"
				: undefined
}

function iconPath(name: TargetName): vscode.ThemeIcon {
	return name === "VSCE"
		? new vscode.ThemeIcon("extensions")
		: name.startsWith("Yarn")
			? new vscode.ThemeIcon("view-ignored-yarn")
			: new vscode.ThemeIcon("view-ignored-" + name.toLowerCase())
}

export async function pickTarget(
	title: string,
	none = false,
): Promise<{ targetName: string; invert: boolean | 2 } | undefined> {
	const currentTarget = getTarget()
	let inver: boolean | 2 = false
	const { errored, related } = await relatedTargetMakers()
	const targetNamesToShow = related.map(nameFromTargetMaker)
	if (!["None", ...targetNamesToShow].includes(currentTarget)) {
		decorationProvider.clear(false)
	}

	const targetName = await pickValue(
		title,
		"Select new target of inclusive file decorations. Modes aren't implemented yet.",
		[
			...((none
				? [
						{
							label: "None",
							alwaysShow: true,
							picked: currentTarget === "None",
							description: description("None", currentTarget),
							detail: "Hides decorations.",
						},
					]
				: []) as vscode.QuickPickItem[]),
			...targetNamesToShow.map<vscode.QuickPickItem>((name) => ({
				picked: name === currentTarget,
				label: name,
				buttons: [
					{ iconPath: new vscode.ThemeIcon("diff-added"), tooltip: "Show Included" },
					{ iconPath: new vscode.ThemeIcon("diff-ignored"), tooltip: "Show Excluded" },
					{ iconPath: new vscode.ThemeIcon("diff"), tooltip: "Show Both" },
				],
				iconPath: iconPath(name),
				description: description(name, currentTarget, errored.get(targetMakerFromName(name))),
				detail: {
					NPM: "Shows inclusive files for Node Package Manage. Has 'publish' and 'list' modes.",
					"Yarn v2+, Modern":
						"Shows inclusive files for Berry and ZPM. Has 'publish' and 'list' modes.",
					"Yarn v1, Classic": "Shows inclusive files for old Yarn. Has 'publish' and 'list' modes.",
					VSCE: "Shows inclusive files for VSIX archives.",
					Git: "A recreated algorithm for inclusive files. Still not compatible.",
					Bun: "Shows inclusive files for the generated archives.",
					Deno: "Shows inclusive files for the generated archives.",
					JSR: "Shows inclusive files for the generated archives.",
				}[name],
			})),
		],
		(_item, { tooltip }) => {
			inver = tooltip === "Show Included" ? false : tooltip === "Show Both" ? 2 : true
		},
	)

	if (!targetName) return undefined
	return { targetName: targetName, invert: inver }
}
