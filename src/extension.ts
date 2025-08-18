import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

const P_TITLE = 'SnippetShot 📸'

function writeSerializedBlobToFile(serializeBlob: string, fileName: string) {
  const bytes = new Uint8Array(serializeBlob.split(',').map(n => Number(n)))
  fs.writeFileSync(fileName, Buffer.from(bytes))
}

export function activate(context: vscode.ExtensionContext) {
  const htmlPath = path.resolve(context.extensionPath, 'webview/index.html')

  let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'))
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
        bgColor: context.globalState.get('snippetshot.bgColor', '#2e3440')
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
  const bgColor = context.globalState.get('snippetshot.bgColor', '#2e3440') as string
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
        case 'shoot':
          vscode.window
            .showSaveDialog({
              defaultUri: lastUsedImageUri,
              filters: { Images: ['png'] }
            })
            .then(uri => {
              if (uri) {
                writeSerializedBlobToFile(data.serializedBlob, uri.fsPath)
                lastUsedImageUri = uri
              }
            })
          break
        case 'updateSettingsFromWebview':
          // Non-persistent except bgColor below; reflect new settings immediately
          if (panel) {
            syncSettings(panel)
          }
          break
        case 'getAndUpdateCacheAndSettings':
          p.webview.postMessage({
            type: 'restoreBgColor',
            bgColor: context.globalState.get('snippetshot.bgColor', '#2e3440')
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
      transparentBackground: settings.get('transparentBackground'),
      backgroundColor: settings.get('backgroundColor'),
      target: settings.get('target'),
      ligature: editorSettings.get('fontLigatures')
    })
  }
}

function getHtmlContent(htmlPath: string, webview: vscode.Webview) {
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8')
  // Convert local script src to webview URIs
  return htmlContent.replace(/script src=\"([^\"]*)\"/g, (_match, src) => {
    const onDisk = vscode.Uri.file(path.resolve(path.dirname(htmlPath), src))
    const webSrc = webview.asWebviewUri(onDisk)
    return `script src=\"${webSrc}\"`
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
