export type ArkError = { summary: string }

export function collectCauses(error: Error | ArkError): string[] {
	const messages: string[] = []
	let current: any = error

	while (current) {
		const text = current.summary || current.message

		if (text) {
			messages.push(text)
		}

		current = current instanceof Error ? current.cause : null
	}

	return messages
}
