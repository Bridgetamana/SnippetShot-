/* global domtoimage */
(function () {
  const vscode = acquireVsCodeApi();
  let backgroundColor = '#020617';
  vscode.postMessage({ type: 'getAndUpdateCacheAndSettings' });
  const snippetNode = document.getElementById('snippet');
  const snippetContainerNode = document.getElementById('snippet-container');
  const saveBtn = document.getElementById('saveBtn');
  const saveBtnText = document.getElementById('saveBtnText');
  const bgPicker = document.getElementById('bgPicker');
  const lineNumbersCheckbox = document.getElementById('lineNumbers');
  const attributionEnabled = document.getElementById('attributionEnabled');
  const attributionText = document.getElementById('attributionText');
  const attributionOverlay = document.getElementById('attribution-overlay');

  const oldState = vscode.getState();
  if (oldState && oldState.innerHTML) {
    snippetNode.innerHTML = oldState.innerHTML;
  }

  const getInitialHtml = (_fontFamily) => {
    return `<meta charset="utf-8"><div class="snippet-initial"><div><span class="snippet-initial-title">Ready to create a SnippetShot?</span></div><div class="snippet-initial-step snippet-initial-step--first"><span class="snippet-initial-step">1. Copy some code from your editor.</span></div><div><span class="snippet-initial-step">2. Paste it here.</span></div><div><span class="snippet-initial-step">3. Click the 📸 button to save or use Ctrl+S (Cmd+S on Mac)!</span></div></div>`;
  };

  const serializeBlob = (blob, cb) => {
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const bytes = new Uint8Array(fileReader.result);
      cb(Array.from(bytes).join(','));
    };

    fileReader.onerror = () => {
      saveBtn.disabled = false;
      saveBtnText.textContent = 'Save as PNG';
    };

    fileReader.readAsArrayBuffer(blob);
  };

  function applyExportStyles() {
    const containerBackup = {
      background: snippetContainerNode ? snippetContainerNode.style.background : '',
      border: snippetContainerNode ? snippetContainerNode.style.border : '',
      padding: snippetContainerNode ? snippetContainerNode.style.padding : '',
      maxWidth: snippetContainerNode ? snippetContainerNode.style.maxWidth : '',
      width: snippetContainerNode ? snippetContainerNode.style.width : '',
      height: snippetContainerNode ? snippetContainerNode.style.height : '',
      display: snippetContainerNode ? snippetContainerNode.style.display : '',
      textAlign: snippetContainerNode ? snippetContainerNode.style.textAlign : '',
      opacity: snippetContainerNode ? snippetContainerNode.style.opacity : '',
    };
    const snippetBackup = {
      width: snippetNode.style.width,
      display: snippetNode.style.display,
      margin: snippetNode.style.margin,
      backgroundColor: snippetNode.style.backgroundColor,
      padding: snippetNode.style.padding,
    };
    if (snippetContainerNode) {
      snippetContainerNode.style.background = backgroundColor;
      snippetContainerNode.style.border = 'none';
      snippetContainerNode.style.padding = '64px 48px';
      snippetContainerNode.style.maxWidth = 'none';
      snippetContainerNode.style.width = 'fit-content';
      snippetContainerNode.style.height = 'fit-content';
      snippetContainerNode.style.display = 'block';
      snippetContainerNode.style.textAlign = 'center';
    }
    snippetNode.style.width = 'auto';
    snippetNode.style.height = 'auto';
    snippetNode.style.display = 'inline-block';
    snippetNode.style.margin = '0';

    return function restore() {
      if (snippetContainerNode) {
        snippetContainerNode.style.background = containerBackup.background;
        snippetContainerNode.style.border = containerBackup.border;
        snippetContainerNode.style.padding = containerBackup.padding;
        snippetContainerNode.style.maxWidth = containerBackup.maxWidth;
        snippetContainerNode.style.width = containerBackup.width;
        snippetContainerNode.style.height = containerBackup.height;
        snippetContainerNode.style.display = containerBackup.display;
        snippetContainerNode.style.textAlign = containerBackup.textAlign;
        snippetContainerNode.style.opacity = containerBackup.opacity;
      }

      snippetNode.style.width = snippetBackup.width;
      snippetNode.style.display = snippetBackup.display;
      snippetNode.style.margin = snippetBackup.margin;
      snippetNode.style.backgroundColor = snippetBackup.backgroundColor;
      snippetNode.style.padding = snippetBackup.padding;
    };
  }

  function shoot(serializedBlob) {
    vscode.postMessage({
      type: 'shoot',
      data: {
        serializedBlob,
      },
    });
  }

  function getSnippetBgColor(html) {
    const match = html.match(/background-color: (#[a-fA-F0-9]+)/);
    return match ? match[1] : undefined;
  }

  function updateEnvironment(snippetBgColor) {
    if (snippetBgColor) {
      document.getElementById('snippet').style.backgroundColor = snippetBgColor;
    }
  }

  bgPicker.addEventListener('input', () => {
    backgroundColor = bgPicker.value;
    document.body.style.backgroundColor = backgroundColor;
    vscode.postMessage({ type: 'updateBgColor', data: { bgColor: backgroundColor } });
  });

  attributionEnabled.addEventListener('change', () => {
    updateAttribution();
  });

  attributionText.addEventListener('input', () => {
    updateAttribution();
  });

  attributionText.addEventListener('paste', (e) => {
    e.stopPropagation();
  });

  function updateAttribution() {
    if (attributionEnabled.checked) {
      attributionOverlay.textContent = attributionText.value;
      attributionOverlay.style.display = 'block';
    } else {
      attributionOverlay.style.display = 'none';
    }
  }

  lineNumbersCheckbox.addEventListener('change', () => {
    toggleLineNumbers(lineNumbersCheckbox.checked);
  });

  function toggleLineNumbers(show) {
    const snippet = document.getElementById('snippet');
    const lineContainer = snippet.querySelector('div');
    if (!lineContainer) return;

    const existingNumbers = snippet.querySelectorAll('.line-number');
    existingNumbers.forEach((n) => n.remove());
    const allLinesForStyleReset = Array.from(snippet.querySelectorAll('div > div'));
    allLinesForStyleReset.forEach((l) => {
      if (l.style.display === 'flex') l.style.display = '';
    });

    if (show) {
      const lines = Array.from(lineContainer.children).filter((c) => c.tagName === 'DIV');
      for (let i = 0; i < lines.length; i++) {
        const number = document.createElement('span');
        number.style.color = '#888';
        number.style.paddingRight = '1em';
        number.style.userSelect = 'none';
        number.className = 'line-number';
        number.innerText = i + 1;
        lines[i].style.display = 'flex';
        lines[i].prepend(number);
      }
    }
  }

  function getMinIndent(code) {
    const arr = code.split('\n');

    let minIndentCount = Number.MAX_VALUE;
    for (let i = 0; i < arr.length; i++) {
      const wsCount = arr[i].search(/\S/);
      if (wsCount !== -1) {
        if (wsCount < minIndentCount) {
          minIndentCount = wsCount;
        }
      }
    }

    return minIndentCount;
  }

  function stripInitialIndent(html, indent) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const initialSpans = doc.querySelectorAll('div > div span:first-child');
    for (let i = 0; i < initialSpans.length; i++) {
      initialSpans[i].textContent = initialSpans[i].textContent.slice(indent);
    }
    return doc.body.innerHTML;
  }

  document.addEventListener('paste', (e) => {
    const innerHTML = e.clipboardData.getData('text/html');
    const code = e.clipboardData.getData('text/plain');
    const minIndent = getMinIndent(code);
    const snippetBgColor = getSnippetBgColor(innerHTML);

    if (snippetBgColor) {
      updateEnvironment(snippetBgColor);
    }

    let content;
    if (minIndent !== 0) {
      content = stripInitialIndent(innerHTML, minIndent);
    } else {
      content = innerHTML;
    }
    snippetNode.innerHTML = content;
    vscode.setState({ innerHTML: content }); // Save clean content
    toggleLineNumbers(lineNumbersCheckbox.checked);
  });

  document.addEventListener('keydown', (e) => {
    try {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) {
          saveBtn.click();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          e.preventDefault();
          copyScreenshotToClipboard();
        }
      }
    } catch {
      vscode.postMessage({
        type: 'exportError',
        message: 'Keyboard shortcut failed. Please use the buttons instead.',
      });
    }
  });

  function copyScreenshotToClipboard() {
    if (saveBtn.disabled) return;

    saveBtn.disabled = true;
    saveBtnText.textContent = 'Copying…';

    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: 'Copy operation timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();
    const config = {
      bgcolor: backgroundColor,
      filter: (node) => {
        return !node.classList || !node.classList.contains('toolbar');
      },
    };

    domtoimage
      .toBlob(snippetContainerNode || document.querySelector('#snippet').parentElement, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (blob) {
          navigator.clipboard
            .write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ])
            .then(() => {
              saveBtnText.textContent = 'Copied!';
              setTimeout(() => {
                saveBtnText.textContent = 'Save as PNG';
              }, 2000);
              vscode.postMessage({
                type: 'copySuccess',
                message: 'Screenshot copied to clipboard!',
              });
            })
            .catch((_error) => {
              saveBtnText.textContent = 'Save as PNG';
              vscode.postMessage({
                type: 'copyError',
                message: 'Failed to copy to clipboard. Try saving as file instead.',
              });
            })
            .finally(() => {
              restore();
              saveBtn.disabled = false;
            });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        restore();
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: `Copy failed: ${error.message || 'Unknown error'}`,
        });
      });
  }

  let saveLabelTimer = null;
  saveBtn.addEventListener('click', () => {
    shootAll();
  });

  function shootAll() {
    if (saveBtn.disabled) return;

    saveBtnText.textContent = 'Saving…';
    saveBtn.disabled = true;

    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'exportError',
          message: 'Screenshot capture timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();
    const config = {
      bgcolor: backgroundColor,
      filter: (node) => {
        return !node.classList || !node.classList.contains('toolbar');
      },
    };

    const target = snippetContainerNode || document.querySelector('#snippet').parentElement;
    if (target && target.style) target.style.opacity = '1'; // Ensure full opacity for capture

    domtoimage
      .toBlob(target, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (target && target.style) {
          target.style.opacity = '0.7'; // Feedback
          setTimeout(() => {
            if (target && target.style) target.style.opacity = '1';
          }, 500);
        }
        if (blob) {
          serializeBlob(blob, (serializedBlob) => {
            shoot(serializedBlob);
          });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        if (target && target.style) target.style.opacity = '1';
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';

        const errorMessage = error.message || 'Unknown error occurred';
        vscode.postMessage({
          type: 'exportError',
          message: `Screenshot capture failed: ${errorMessage}. Please try again.`,
        });
      })
      .finally(() => {
        restore();
      });
  }

  window.addEventListener('message', (e) => {
    if (e) {
      if (e.data.type === 'init') {
        const { fontFamily, bgColor } = e.data;

        const initialHtml = getInitialHtml(fontFamily);
        snippetNode.innerHTML = initialHtml;
        vscode.setState({ innerHTML: initialHtml });
        toggleLineNumbers(lineNumbersCheckbox.checked);

        if (bgColor) {
          backgroundColor = bgColor;
          bgPicker.value = bgColor;
          document.body.style.backgroundColor = bgColor;
        }
      } else if (e.data.type === 'update') {
        document.execCommand('paste');
      } else if (e.data.type === 'restore') {
        snippetNode.innerHTML = e.data.innerHTML;
        toggleLineNumbers(lineNumbersCheckbox.checked);
        if (e.data.bgColor) {
          backgroundColor = e.data.bgColor;
          bgPicker.value = e.data.bgColor;
          document.body.style.backgroundColor = e.data.bgColor;
        }
      } else if (e.data.type === 'restoreBgColor') {
        if (e.data.bgColor) {
          backgroundColor = e.data.bgColor;
          bgPicker.value = e.data.bgColor;
          document.body.style.backgroundColor = e.data.bgColor;
        }
      } else if (e.data.type === 'updateSettings') {
        snippetNode.style.boxShadow = e.data.shadow;
        if (e.data.attributionEnabled !== undefined) {
          attributionEnabled.checked = e.data.attributionEnabled;
        }
        if (e.data.attributionText) {
          attributionText.value = e.data.attributionText;
        }
        updateAttribution();
        if (e.data.ligature) {
          snippetNode.style.fontVariantLigatures = 'normal';
        } else {
          snippetNode.style.fontVariantLigatures = 'none';
        }
      } else if (e.data.type === 'save') {
        shootAll();
      } else if (e.data.type === 'saveSuccess') {
        saveBtnText.textContent = 'Saved!';
        saveBtn.disabled = false;
        if (saveLabelTimer) {
          clearTimeout(saveLabelTimer);
        }
        saveLabelTimer = setTimeout(() => {
          saveBtnText.textContent = 'Save as PNG';
        }, 2000);
      } else if (e.data.type === 'saveError') {
        saveBtnText.textContent = 'Save as PNG';
        saveBtn.disabled = false;
      }
    }
  });
})();
