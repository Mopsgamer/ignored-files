import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"

export default function (): void {
	output.info("Clearing")
	decorationProvider.clear()
}
