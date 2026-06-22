# View ignored

Show files and directories ignored/included by Git, NPM, Yarn, JSR, VSCE or other tools.

See https://github.com/Mopsgamer/view-ignored for details.

![Extension preview](https://raw.githubusercontent.com/Mopsgamer/view-ignored-vscode/main/images/preview.png)

## Features

- `View ignored: Scan decorations`

![File tree hover preview](https://raw.githubusercontent.com/Mopsgamer/view-ignored-vscode/main/images/hover.png)

- `Explain ignoring reasons`

![File tree context menu selection preview](https://raw.githubusercontent.com/Mopsgamer/view-ignored-vscode/main/images/menu-explain.png)

## Context

- `viewIgnored.isReady`: Indicates whether the extension has been activated.
- `viewIgnored.isScanning`: Indicates whether the extension is currently scanning for ignored files.
- `viewIgnored.target`: Indicates the currently selected target for ignored file analysis. [See `TargetName` type](https://github.com/Mopsgamer/view-ignored-vscode/blob/main/src/targetName.ts).
