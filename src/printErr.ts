import { output } from "./output.js"

export function printErr(err: Error): void {
	output.error(err)
	for (let c = err.cause; c; c = err.cause) {
		output.appendLine("Error cause: " + c)
	}
}
