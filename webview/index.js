(function () {
  const vscode = acquireVsCodeApi();

  let backgroundColor = '#020617';

  vscode.postMessage({
    type: 'getAndUpdateCacheAndSettings',
  });

  const snippetNode = document.getElementById('snippet');
  const snippetContainerNode = document.getElementById('snippet-container');
  const saveBtn = document.getElementById('saveBtn');
  const saveBtnText = document.getElementById('saveBtnText');
  const bgPicker = document.getElementById('bgPicker');
  const lineNumbersCheckbox = document.getElementById('lineNumbers');

  // Load presets from storage
  // loadPresets(); // Removed preset functionality

  // Preset management functions - REMOVED
  // savePresetBtn.addEventListener('click', () => {
  //   try {
  //     const presetName = prompt('Enter preset name:');
  //     if (presetName && presetName.trim()) {
  //       saveCurrentPreset(presetName.trim());
  //     }
  //   } catch (error) {
  //     console.error('Error saving preset:', error);
  //     vscode.postMessage({
  //       type: 'exportError',
  //       message: 'Failed to save preset. Please try again.',
  //     });
  //   }
  // });

  // presetSelect.addEventListener('change', () => {
  //   try {
  //     const presetName = presetSelect.value;
  //     if (presetName) {
  //       loadPreset(presetName);
  //       presetSelect.value = ''; // Reset select
  //     }
  //   } catch (error) {
  //     console.error('Error loading preset:', error);
  //     vscode.postMessage({
  //       type: 'exportError',
  //       message: 'Failed to load preset. Please try again.',
  //     });
  //   }
  // });

  snippetContainerNode.style.opacity = '1';
  const oldState = vscode.getState();
  if (oldState && oldState.innerHTML) {
    snippetNode.innerHTML = oldState.innerHTML;
  }

  const getInitialHtml = (fontFamily) => {
    const monoFontStack = `'SF Mono', ${fontFamily}, SFMono-Regular, Consolas, 'DejaVu Sans Mono', Ubuntu Mono, 'Liberation Mono', Menlo, Courier, monospace`;
    return `<meta charset="utf-8"><div style="color: #d8dee9;background-color: #2e3440; font-family: ${monoFontStack};font-weight: normal;font-size: 13px;line-height: 20px;white-space: pre; text-align: left;"><div><span style="font-family: 'Inter', sans-serif; font-size: 22px; font-weight: bold; color: #e2e8f0;">Ready to create a SnippetShot?</span></div><div style="margin-top: 16px; font-family: 'Inter', sans-serif; color: #94a3b8;"><span>1. Copy some code from your editor.</span></div><div style="font-family: 'Inter', sans-serif; color: #94a3b8;"><span>2. Paste it here.</span></div><div style="font-family: 'Inter', sans-serif; color: #94a3b8;"><span>3. Click the 📸 button to save!</span></div></div>`;
  };

  const serializeBlob = (blob, cb) => {
    console.log('Starting blob serialization, blob size:', blob.size);
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const bytes = new Uint8Array(fileReader.result);
      console.log('Blob serialized, byte array length:', bytes.length);
      cb(Array.from(bytes).join(','));
    };

    fileReader.onerror = () => {
      console.error('Blob serialization failed');
      // Reset button state on error
      saveBtn.disabled = false;
      saveBtnText.textContent = 'Save as PNG';
    };

    fileReader.readAsArrayBuffer(blob);
  };

  function shoot(serializedBlob) {
    console.log('Sending shoot message with blob length:', serializedBlob.length);
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
    // update snippet bg color
    if (snippetBgColor) {
      document.getElementById('snippet').style.backgroundColor = snippetBgColor;
    }
  }

  // UI bindings
  bgPicker.addEventListener('input', () => {
    backgroundColor = bgPicker.value;
    document.body.style.backgroundColor = backgroundColor;
    vscode.postMessage({ type: 'updateBgColor', data: { bgColor: backgroundColor } });
  });

  // radiusSnippet.addEventListener('input', () => {
  //   document.documentElement.style.setProperty('--snippet-radius', `${radiusSnippet.value}px`);
  // }); // REMOVED corner radius functionality

  lineNumbersCheckbox.addEventListener('change', () => {
    toggleLineNumbers(lineNumbersCheckbox.checked);
  });

  function toggleLineNumbers(show) {
    const snippet = document.getElementById('snippet');
    const lineContainer = snippet.querySelector('div');
    if (!lineContainer) return;

    // Always remove existing line numbers to prevent duplicates
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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    try {
      // Ctrl+S or Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) {
          saveBtn.click();
        }
      }
      // Ctrl+C or Cmd+C to copy (when no text is selected)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          e.preventDefault();
          copyScreenshotToClipboard();
        }
      }
    } catch (error) {
      console.error('Keyboard shortcut error:', error);
      vscode.postMessage({
        type: 'exportError',
        message: 'Keyboard shortcut failed. Please use the buttons instead.',
      });
    }
  });

  function copyScreenshotToClipboard() {
    if (saveBtn.disabled) return; // Already processing

    saveBtn.disabled = true;
    saveBtnText.textContent = 'Copying…';

    // Safety timeout to prevent button from getting stuck
    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: 'Copy operation timed out. Please try again.',
        });
      }
    }, 30000); // 30 second timeout

    const width = snippetContainerNode.offsetWidth * 2;
    const height = snippetContainerNode.offsetHeight * 2;
    const config = {
      width,
      height,
      scale: 2,
      useCORS: true,
      allowTaint: true, // Allow tainted canvases for better background capture
      backgroundColor: null, // Don't force background color, let it capture naturally
      logging: false,
      ignoreElements: (element) => {
        // Ignore the toolbar to prevent it from appearing in screenshots
        return element.classList.contains('toolbar');
      },
    };

    html2canvas(snippetContainerNode, config)
      .then((canvas) => {
        clearTimeout(safetyTimeout); // Clear safety timeout on success
        canvas.toBlob((blob) => {
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
              .catch((error) => {
                console.error('Clipboard copy failed:', error);
                saveBtnText.textContent = 'Save as PNG';
                vscode.postMessage({
                  type: 'copyError',
                  message: 'Failed to copy to clipboard. Try saving as file instead.',
                });
              })
              .finally(() => {
                saveBtn.disabled = false;
              });
          } else {
            throw new Error('Failed to generate image blob');
          }
        }, 'image/png');
      })
      .catch((error) => {
        clearTimeout(safetyTimeout); // Clear safety timeout on error
        console.error('Screenshot copy failed:', error);
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: `Copy failed: ${error.message || 'Unknown error'}`,
        });
      });
  }

  // PRESET FUNCTIONS REMOVED - All preset functionality has been removed

  let saveLabelTimer = null;
  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    saveBtnText.textContent = 'Saving…';
    shootAll();
  });

  function shootAll() {
    if (saveBtn.disabled) return; // Prevent multiple simultaneous captures

    saveBtn.disabled = true;
    saveBtnText.textContent = 'Capturing…';

    // Safety timeout to prevent button from getting stuck
    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'exportError',
          message: 'Screenshot capture timed out. Please try again.',
        });
      }
    }, 30000); // 30 second timeout

    const width = snippetContainerNode.offsetWidth * 2;
    const height = snippetContainerNode.offsetHeight * 2;
    console.log('Starting html2canvas with dimensions:', width, 'x', height);

    const config = {
      width,
      height,
      scale: 2,
      useCORS: true,
      allowTaint: true, // Allow tainted canvases for better background capture
      backgroundColor: null, // Don't force background color, let it capture naturally
      logging: false,
      ignoreElements: (element) => {
        // Ignore the toolbar to prevent it from appearing in screenshots
        return element.classList.contains('toolbar');
      },
    };

    // Add loading state
    snippetContainerNode.style.opacity = '0.7';
    console.log('Calling html2canvas...');

    html2canvas(snippetContainerNode, config)
      .then((canvas) => {
        console.log('html2canvas promise resolved');
        clearTimeout(safetyTimeout); // Clear safety timeout on success
        snippetContainerNode.style.opacity = '1';
        console.log('Converting canvas to blob...');
        canvas.toBlob((blob) => {
          console.log('Canvas to blob callback executed');
          if (blob) {
            console.log('Blob created successfully, size:', blob.size);
            serializeBlob(blob, (serializedBlob) => {
              console.log('Blob serialized, calling shoot function');
              shoot(serializedBlob);
            });
          } else {
            console.error('Canvas to blob failed - no blob created');
            throw new Error('Failed to generate image blob');
          }
        }, 'image/png');
      })
      .catch((error) => {
        clearTimeout(safetyTimeout); // Clear safety timeout on error
        console.error('Screenshot capture failed:', error);
        snippetContainerNode.style.opacity = '1';
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';

        // Show user-friendly error message
        const errorMessage = error.message || 'Unknown error occurred';
        vscode.postMessage({
          type: 'exportError',
          message: `Screenshot capture failed: ${errorMessage}. Please try again.`,
        });
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
        if (e.data.ligature) {
          snippetNode.style.fontVariantLigatures = 'normal';
        } else {
          snippetNode.style.fontVariantLigatures = 'none';
        }
      } else if (e.data.type === 'saveSuccess') {
        console.log('Received saveSuccess message');
        saveBtnText.textContent = 'Saved!';
        saveBtn.disabled = false;
        if (saveLabelTimer) {
          clearTimeout(saveLabelTimer);
        }
        saveLabelTimer = setTimeout(() => {
          saveBtnText.textContent = 'Save as PNG';
        }, 2000);
      } else if (e.data.type === 'saveError') {
        console.log('Received saveError message:', e.data.message);
        saveBtnText.textContent = 'Save as PNG';
        saveBtn.disabled = false;
      }
    }
  });
})();
