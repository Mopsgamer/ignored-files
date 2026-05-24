import * as vscode from "vscode"

export default function pickValue(
	title: string,
	placeholder: string,
	items: string[],
): Promise<string | undefined> {
	return new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick()
		quickPick.title = title
		quickPick.placeholder = placeholder
		quickPick.items = items.map((label) => ({ label }))
		quickPick.ignoreFocusOut = true

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
	})
}
