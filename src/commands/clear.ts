import { decorationProvider } from "../decorationProvider.js"

export default function (maySave: any): void {
	if (typeof maySave === "boolean") {
		decorationProvider.clear(maySave)
		return
	}
	decorationProvider.clear()
}
