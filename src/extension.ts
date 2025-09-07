import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const P_TITLE = 'SnippetShot';

function writeSerializedBlobToFile(serializedBlob: string, fileName: string) {
  const bytes = new Uint8Array(serializedBlob.split(',').map((n) => Number(n)));
  fs.writeFileSync(fileName, Buffer.from(bytes));
}

function generateFilename(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `codesnippet-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}

function handleTwitterShare(
  panel: vscode.WebviewPanel,
  data: { imageData: string; text: string; imageCopiedToClipboard?: boolean }
) {
  try {
    const tweetText = encodeURIComponent(data.text);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
    const tempDir = path.join(homedir(), 'Downloads');
    const fileName = generateFilename(new Date());
    const filePath = path.join(tempDir, fileName);
    const imageBuffer = Buffer.from(data.imageData, 'base64');
    fs.writeFileSync(filePath, imageBuffer);
    vscode.env.openExternal(vscode.Uri.parse(twitterUrl));
    if (data.imageCopiedToClipboard) {
      vscode.window
        .showInformationMessage(
          `Twitter/X opened! Image copied to clipboard - paste it directly into your tweet! (Also saved to Downloads/${fileName})`,
          'Show in Folder'
        )
        .then((selection) => {
          if (selection === 'Show in Folder') {
            if (process.platform === 'win32') {
              vscode.env.openExternal(vscode.Uri.parse(`file:///${tempDir}`));
            } else {
              vscode.env.openExternal(vscode.Uri.file(tempDir));
            }
          }
        });
    } else {
      vscode.window
        .showInformationMessage(
          `Twitter/X opened! Image saved to Downloads/${fileName}. Click the image button in Twitter to attach it to your tweet.`,
          'Show in Folder',
          'Copy Image Path'
        )
        .then((selection) => {
          if (selection === 'Show in Folder') {
            if (process.platform === 'win32') {
              vscode.env.openExternal(vscode.Uri.parse(`file:///${tempDir}`));
            } else {
              vscode.env.openExternal(vscode.Uri.file(tempDir));
            }
          } else if (selection === 'Copy Image Path') {
            vscode.env.clipboard.writeText(filePath);
            vscode.window.showInformationMessage('Image path copied to clipboard!');
          }
        });
    }

    panel.webview.postMessage({ type: 'shareSuccess' });
  } catch (error) {
    panel.webview.postMessage({
      type: 'shareError',
      message: `Failed to share: ${(error as Error).message}`,
    });
    vscode.window.showErrorMessage(`Failed to share to Twitter/X: ${(error as Error).message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const htmlPath = path.resolve(context.extensionPath, 'webview/index.html');

  let panel: vscode.WebviewPanel | undefined;

  const serializer: vscode.WebviewPanelSerializer = {
    async deserializeWebviewPanel(_panel: vscode.WebviewPanel, state: { innerHTML?: string }) {
      panel = _panel;
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))],
      };
      panel.webview.html = getHtmlContent(htmlPath, panel.webview);
      panel.webview.postMessage({
        type: 'restore',
        innerHTML: state?.innerHTML,
        bgColor: context.globalState.get('snippetshot.bgColor'),
      });
      const selectionListener = setupSelectionSync(panel);
      panel.onDidDispose(() => selectionListener.dispose());
      setupMessageListeners(panel);
    },
  };
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('snippetshot', serializer)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snippetshot.activate', () => {
      panel = vscode.window.createWebviewPanel('snippetshot', P_TITLE, vscode.ViewColumn.Two, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))],
      });

      panel.webview.html = getHtmlContent(htmlPath, panel.webview);

      const selectionListener = setupSelectionSync(panel);
      panel.onDidDispose(() => selectionListener.dispose());

      setupMessageListeners(panel);

      const fontFamily = vscode.workspace.getConfiguration('editor').get<string>('fontFamily');
      const bgColor = context.globalState.get('snippetshot.bgColor');
      panel.webview.postMessage({
        type: 'init',
        fontFamily,
        bgColor,
      });

      syncSettings(panel);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snippetshot.save', () => {
      if (panel) {
        panel.webview.postMessage({ type: 'save' });
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('snippetshot') || e.affectsConfiguration('editor')) {
        if (panel) {
          syncSettings(panel);
        }
      }
    })
  );

  function setupMessageListeners(p: vscode.WebviewPanel) {
    p.webview.onDidReceiveMessage(({ type, data }) => {
      switch (type) {
        case 'shoot': {
          const defaultName = generateFilename(new Date());
          vscode.window
            .showSaveDialog({
              defaultUri: vscode.Uri.file(path.resolve(homedir(), 'Downloads', defaultName)),
              filters: { Images: ['png'] },
              saveLabel: 'Save SnippetShot',
            })
            .then((uri) => {
              if (!uri) {
                p.webview.postMessage({ type: 'saveError', message: 'Save canceled' });
                return;
              }
              try {
                writeSerializedBlobToFile(data.serializedBlob, uri.fsPath);
                p.webview.postMessage({
                  type: 'saveSuccess',
                  fileName: path.basename(uri.fsPath),
                  filePath: uri.fsPath,
                });
                vscode.window.showInformationMessage(`Saved: ${path.basename(uri.fsPath)}`);
              } catch (err) {
                p.webview.postMessage({
                  type: 'saveError',
                  message: (err as Error)?.message || String(err),
                });
                vscode.window.showErrorMessage('Failed to save image: ' + (err as Error).message);
              }
            });
          break;
        }
        case 'updateSettingsFromWebview':
          // Removed attribution caching (no action needed)
          break;
        case 'getAndUpdateCacheAndSettings':
          p.webview.postMessage({
            type: 'restoreBgColor',
            bgColor: context.globalState.get('snippetshot.bgColor'),
          });
          syncSettings(p);
          break;
        case 'updateBgColor':
          context.globalState.update('snippetshot.bgColor', data.bgColor);
          break;
        case 'copySuccess':
          vscode.window.showInformationMessage(data.message || 'Screenshot copied to clipboard!');
          break;
        case 'copyError':
          vscode.window.showErrorMessage(data.message || 'Failed to copy screenshot to clipboard');
          break;
        case 'exportError':
          vscode.window.showErrorMessage(data.message || 'Screenshot export failed');
          break;
        case 'shareToTwitter':
          handleTwitterShare(p, data);
          break;
        case 'shareError':
          vscode.window.showErrorMessage(data.message || 'Failed to share to Twitter/X');
          break;
      }
    });
  }

  function syncSettings(p: vscode.WebviewPanel) {
    const settings = vscode.workspace.getConfiguration('snippetshot');
    const editorSettings = vscode.workspace.getConfiguration('editor', null);
    p.webview.postMessage({
      type: 'updateSettings',
      shadow: settings.get('shadow'),
      backgroundColor: settings.get('backgroundColor'),
      attributionEnabled: settings.get('attributionEnabled'),
      attributionText: settings.get('attributionText'),
      ligature: editorSettings.get('fontLigatures'),
    });
  }
}

function getHtmlContent(htmlPath: string, webview: vscode.Webview) {
  const raw = fs.readFileSync(htmlPath, 'utf-8');
  const nonce = Math.random().toString(36).slice(2);
  const withResources = raw
    .replace(/script src="([^"]*)"/g, (_m, src) => {
      const onDisk = vscode.Uri.file(path.resolve(path.dirname(htmlPath), src));
      const webSrc = webview.asWebviewUri(onDisk);
      return `script nonce="${nonce}" src="${webSrc}"`;
    })
    .replace(/link href="([^"]*)"/g, (_m, href) => {
      const onDisk = vscode.Uri.file(path.resolve(path.dirname(htmlPath), href));
      const webHref = webview.asWebviewUri(onDisk);
      return `link href="${webHref}"`;
    })
    .replace(
      /<meta\s+http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"\s*\/?>/,
      (m, csp) => {
        let updated = csp.replace('script-src', `script-src 'nonce-${nonce}'`);
        return m.replace(csp, updated);
      }
    );
  return withResources;
}

export function deactivate() {}

function setupSelectionSync(panel: vscode.WebviewPanel) {
  return vscode.window.onDidChangeTextEditorSelection((e) => {
    if (e.selections[0] && !e.selections[0].isEmpty) {
      vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
      panel.webview.postMessage({ type: 'update' });
    }
  });
}
