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
  const radiusSnippet = document.getElementById('radiusSnippet');
  const lineNumbersCheckbox = document.getElementById('lineNumbers');

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
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const bytes = new Uint8Array(fileReader.result);
      cb(Array.from(bytes).join(','));
    };

    fileReader.readAsArrayBuffer(blob);
  };

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

  radiusSnippet.addEventListener('input', () => {
    document.documentElement.style.setProperty('--snippet-radius', `${radiusSnippet.value}px`);
  });

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

  let saveLabelTimer = null;
  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    saveBtnText.textContent = 'Saving…';
    shootAll();
  });

  function shootAll() {
    const width = snippetContainerNode.offsetWidth * 2;
    const height = snippetContainerNode.offsetHeight * 2;
    const config = {
      width,
      height,
      style: {
        transform: 'scale(2)',
        'transform-origin': 'center',
        background: backgroundColor || '#020617',
      },
    };

    // Hide resizer before capture
    snippetNode.style.resize = 'none';
    snippetContainerNode.style.resize = 'none';

    domtoimage
      .toBlob(snippetContainerNode, config)
      .then((blob) => {
        snippetNode.style.resize = '';
        snippetContainerNode.style.resize = '';
        serializeBlob(blob, (serializedBlob) => {
          shoot(serializedBlob);
        });
      })
      .catch(function (error) {
        console.error('oops, something went wrong!', error);
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
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
