const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const { homedir } = require('os')

const writeSerializedBlobToFile = (serializeBlob, fileName) => {
  const bytes = new Uint8Array(serializeBlob.split(','))
  fs.writeFileSync(fileName, Buffer.from(bytes))
}

const P_TITLE = 'SnippetShot 📸'

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const htmlPath = path.resolve(context.extensionPath, 'webview/index.html')

  let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Downloads/SnippetShot.png'))
  let panel

  vscode.window.registerWebviewPanelSerializer('snippetshot', {
    async deserializeWebviewPanel(_panel, state) {
      panel = _panel
      panel.webview.html = getHtmlContent(htmlPath)
      panel.webview.postMessage({
        type: 'restore',
        innerHTML: state.innerHTML,
        bgColor: context.globalState.get('snippetshot.bgColor', '#2e3440')
      })
      const selectionListener = setupSelectionSync()
      panel.onDidDispose(() => {
        selectionListener.dispose()
      })
      setupMessageListeners()
    }
  })

  vscode.commands.registerCommand('snippetshot.activate', () => {
    panel = vscode.window.createWebviewPanel('snippetshot', P_TITLE, 2, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
    })

    panel.webview.html = getHtmlContent(htmlPath)

    const selectionListener = setupSelectionSync()
    panel.onDidDispose(() => {
      selectionListener.dispose()
    })

    setupMessageListeners()

    const fontFamily = vscode.workspace.getConfiguration('editor').fontFamily
    const bgColor = context.globalState.get('snippetshot.bgColor', '#2e3440')
    const theme = context.globalState.get('snippetshot.theme', 'frosted')
    panel.webview.postMessage({
      type: 'init',
      fontFamily,
      bgColor,
      theme
    })

    syncSettings()
  })

  vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('snippetshot') || e.affectsConfiguration('editor')) {
      syncSettings()
    }
  })

  function setupMessageListeners() {
    panel.webview.onDidReceiveMessage(({ type, data }) => {
      switch (type) {
        case 'shoot':
          try {
            const downloadsDir = path.join(homedir(), 'Downloads')
            const now = new Date()
            const yyyy = String(now.getFullYear())
            const mm = String(now.getMonth() + 1).padStart(2, '0')
            const dd = String(now.getDate()).padStart(2, '0')
            const hh = String(now.getHours()).padStart(2, '0')
            const mi = String(now.getMinutes()).padStart(2, '0')
            const ss = String(now.getSeconds()).padStart(2, '0')
            const fileBase = `codesnippet-${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`
            const filePath = path.join(downloadsDir, `${fileBase}.png`)
            writeSerializedBlobToFile(data.serializedBlob, filePath)
            lastUsedImageUri = vscode.Uri.file(filePath)
            // Notify webview of success so it can update the UI label
            panel.webview.postMessage({ type: 'saveSuccess', fileName: path.basename(filePath), filePath })
            vscode.window.showInformationMessage(`Saved to Downloads: ${path.basename(filePath)}`, 'Open Folder').then(sel => {
              if (sel === 'Open Folder') {
                vscode.env.openExternal(vscode.Uri.file(downloadsDir))
              }
            })
          } catch (err) {
            // Notify webview of failure too
            panel.webview.postMessage({ type: 'saveError', message: err?.message || String(err) })
            vscode.window.showErrorMessage(`Save failed: ${err?.message || err}`)
          }
          break
        case 'getAndUpdateCacheAndSettings':
          panel.webview.postMessage({
            type: 'restoreBgColor',
            bgColor: context.globalState.get('snippetshot.bgColor', '#2e3440')
          })

          syncSettings()
          break
        case 'updateBgColor':
          context.globalState.update('snippetshot.bgColor', data.bgColor)
          break
        case 'updateSettingsFromWebview':
          if (data && typeof data === 'object') {
            const cfg = vscode.workspace.getConfiguration('snippetshot')
            if (Object.prototype.hasOwnProperty.call(data, 'target')) cfg.update('target', data.target, true)
            if (Object.prototype.hasOwnProperty.call(data, 'transparentBackground')) cfg.update('transparentBackground', data.transparentBackground, true)
            if (Object.prototype.hasOwnProperty.call(data, 'backgroundColor')) cfg.update('backgroundColor', data.backgroundColor, true)
            if (Object.prototype.hasOwnProperty.call(data, 'theme')) context.globalState.update('snippetshot.theme', data.theme)
          }
          break
        case 'invalidPasteContent':
          vscode.window.showInformationMessage(
            'Pasted content is invalid. Only copy from VS Code and check if your shortcuts for copy/paste have conflicts.'
          )
          break
      }
    })
  }

  function syncSettings() {
    const settings = vscode.workspace.getConfiguration('snippetshot')
    const editorSettings = vscode.workspace.getConfiguration('editor', null)
    panel.webview.postMessage({
      type: 'updateSettings',
      shadow: settings.get('shadow'),
      transparentBackground: settings.get('transparentBackground'),
      backgroundColor: settings.get('backgroundColor'),
      target: settings.get('target'),
      ligature: editorSettings.get('fontLigatures')
    })
  }

  function setupSelectionSync() {
    return vscode.window.onDidChangeTextEditorSelection(e => {
      if (e.selections[0] && !e.selections[0].isEmpty) {
        vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction')
        panel.webview.postMessage({
          type: 'update'
        })
      }
    })
  }
}

function getHtmlContent(htmlPath) {
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8')
  return htmlContent
    .replace(/script src="([^"]*)"/g, (match, src) => {
      const realSource = 'vscode-resource:' + path.resolve(htmlPath, '..', src)
      return `script src="${realSource}"`
    })
    .replace(/link href="([^"]*)"/g, (match, href) => {
      const realHref = 'vscode-resource:' + path.resolve(htmlPath, '..', href)
      return `link href="${realHref}"`
    })
}

exports.activate = activate
