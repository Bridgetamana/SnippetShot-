import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

const P_TITLE = 'SnippetShot'

function writeSerializedBlobToFile(serializeBlob: string, fileName: string) {
  const bytes = new Uint8Array(serializeBlob.split(',').map(n => Number(n)))
  fs.writeFileSync(fileName, Buffer.from(bytes))
}

export function activate(context: vscode.ExtensionContext) {
  const htmlPath = path.resolve(context.extensionPath, 'webview/index.html')

  const downloadsDir = (() => {
    const home = homedir()
    const candidate = path.resolve(home, 'Downloads')
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {}
    return home
  })()
  let lastUsedImageUri = vscode.Uri.file(path.resolve(downloadsDir, 'codesnippet.png'))
  let panel: vscode.WebviewPanel | undefined

  const serializer: vscode.WebviewPanelSerializer = {
    async deserializeWebviewPanel(_panel, state: any) {
      panel = _panel
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
      }
      panel.webview.html = getHtmlContent(htmlPath, panel.webview)
      panel.webview.postMessage({
        type: 'restore',
        innerHTML: state?.innerHTML,
        bgColor: context.globalState.get('snippetshot.bgColor')
      })
      const selectionListener = setupSelectionSync(panel)
      panel.onDidDispose(() => selectionListener.dispose())
      setupMessageListeners(panel)
    }
  }
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('snippetshot', serializer))

  context.subscriptions.push(
    vscode.commands.registerCommand('snippetshot.activate', () => {
      panel = vscode.window.createWebviewPanel('snippetshot', P_TITLE, vscode.ViewColumn.Two, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
      })

      panel.webview.html = getHtmlContent(htmlPath, panel.webview)

      const selectionListener = setupSelectionSync(panel)
      panel.onDidDispose(() => selectionListener.dispose())

      setupMessageListeners(panel)

      const fontFamily = vscode.workspace.getConfiguration('editor').get<string>('fontFamily')
      const bgColor = context.globalState.get('snippetshot.bgColor')
      panel.webview.postMessage({
        type: 'init',
        fontFamily,
        bgColor
      })

      syncSettings(panel)
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('snippetshot') || e.affectsConfiguration('editor')) {
        if (panel) {
          syncSettings(panel)
        }
      }
    })
  )

  function setupMessageListeners(p: vscode.WebviewPanel) {
    p.webview.onDidReceiveMessage(({ type, data }) => {
      switch (type) {
    case 'shoot': {
          const now = new Date()
          const pad = (n: number) => n.toString().padStart(2, '0')
          const yyyy = now.getFullYear()
          const mm = pad(now.getMonth() + 1)
          const dd = pad(now.getDate())
          const hh = pad(now.getHours())
          const mi = pad(now.getMinutes())
          const ss = pad(now.getSeconds())
          const filename = `codesnippet-${yyyy}${mm}${dd}-${hh}${mi}${ss}.png`
          const filePath = path.resolve(downloadsDir, filename)
          try {
            writeSerializedBlobToFile(data.serializedBlob, filePath)
            lastUsedImageUri = vscode.Uri.file(filePath)
      p.webview.postMessage({ type: 'saveSuccess', fileName: filename, filePath })
      vscode.window.showInformationMessage(`Saved to Downloads: ${filename}`)
          } catch (err) {
      p.webview.postMessage({ type: 'saveError', message: (err as Error)?.message || String(err) })
      vscode.window.showErrorMessage('Failed to save image: ' + (err as Error).message)
          }
          break
        }
        case 'updateSettingsFromWebview':
          // Non-persistent except bgColor below; reflect new settings immediately
          if (panel) {
            syncSettings(panel)
          }
          break
        case 'getAndUpdateCacheAndSettings':
          p.webview.postMessage({
            type: 'restoreBgColor',
            bgColor: context.globalState.get('snippetshot.bgColor')
          })
          syncSettings(p)
          break
        case 'updateBgColor':
          context.globalState.update('snippetshot.bgColor', data.bgColor)
          break
        case 'invalidPasteContent':
          vscode.window.showInformationMessage(
            'Pasted content is invalid. Only copy from VS Code and check if your shortcuts for copy/paste have conflicts.'
          )
          break
      }
    })
  }

  function syncSettings(p: vscode.WebviewPanel) {
  const settings = vscode.workspace.getConfiguration('snippetshot')
    const editorSettings = vscode.workspace.getConfiguration('editor', null)
    p.webview.postMessage({
      type: 'updateSettings',
      shadow: settings.get('shadow'),
      backgroundColor: settings.get('backgroundColor'),
      ligature: editorSettings.get('fontLigatures')
    })
  }
}

function getHtmlContent(htmlPath: string, webview: vscode.Webview) {
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8')
  return htmlContent
    .replace(/script src=\"([^\"]*)\"/g, (_m, src) => {
      const onDisk = vscode.Uri.file(path.resolve(path.dirname(htmlPath), src))
      const webSrc = webview.asWebviewUri(onDisk)
      return `script src=\"${webSrc}\"`
    })
    .replace(/link href=\"([^\"]*)\"/g, (_m, href) => {
      const onDisk = vscode.Uri.file(path.resolve(path.dirname(htmlPath), href))
      const webHref = webview.asWebviewUri(onDisk)
      return `link href=\"${webHref}\"`
    })
}

export function deactivate() {}

// Keep selection in sync with the webview so it can copy with highlighting
function setupSelectionSync(panel: vscode.WebviewPanel) {
  return vscode.window.onDidChangeTextEditorSelection(e => {
    if (e.selections[0] && !e.selections[0].isEmpty) {
      vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction')
      panel.webview.postMessage({ type: 'update' })
    }
  })
}
