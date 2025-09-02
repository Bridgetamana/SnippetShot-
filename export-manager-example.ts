// Example: Advanced Export System Implementation

interface ExportOptions {
  format: 'png' | 'jpeg' | 'svg' | 'webp';
  quality: number;
  scale: number;
  backgroundColor?: string;
}

interface ExportResult {
  blob: Blob;
  filename: string;
  size: number;
  format: string;
}

class ExportManager {
  private static instance: ExportManager;

  static getInstance(): ExportManager {
    if (!ExportManager.instance) {
      ExportManager.instance = new ExportManager();
    }
    return ExportManager.instance;
  }

  async exportSnippet(
    element: HTMLElement,
    options: ExportOptions
  ): Promise<ExportResult> {
    const { format, quality, scale, backgroundColor } = options;

    // Prepare element for export
    const originalStyles = this.prepareElementForExport(element, backgroundColor);

    try {
      let blob: Blob;
      const filename = this.generateFilename(format);

      switch (format) {
        case 'svg':
          blob = await this.exportAsSVG(element);
          break;
        case 'jpeg':
        case 'webp':
        case 'png':
        default:
          blob = await this.exportAsImage(element, format, quality, scale);
          break;
      }

      return {
        blob,
        filename,
        size: blob.size,
        format
      };
    } finally {
      // Restore original styles
      this.restoreElementStyles(element, originalStyles);
    }
  }

  private prepareElementForExport(
    element: HTMLElement,
    backgroundColor?: string
  ): Map<string, string> {
    const originalStyles = new Map<string, string>();

    // Store original styles
    const computedStyle = window.getComputedStyle(element);
    ['backgroundColor', 'boxShadow', 'borderRadius'].forEach(prop => {
      originalStyles.set(prop, computedStyle.getPropertyValue(prop));
    });

    // Apply export-specific styles
    if (backgroundColor) {
      element.style.backgroundColor = backgroundColor;
    }

    return originalStyles;
  }

  private restoreElementStyles(
    element: HTMLElement,
    originalStyles: Map<string, string>
  ): void {
    originalStyles.forEach((value, prop) => {
      element.style.setProperty(prop, value);
    });
  }

  private async exportAsImage(
    element: HTMLElement,
    format: string,
    quality: number,
    scale: number
  ): Promise<Blob> {
    // Use html2canvas for better rendering
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      width: element.offsetWidth,
      height: element.offsetHeight
    });

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob!),
        `image/${format}`,
        quality
      );
    });
  }

  private async exportAsSVG(element: HTMLElement): Promise<Blob> {
    // Convert to SVG (advanced implementation would use a library)
    const svgString = this.elementToSVGString(element);
    return new Blob([svgString], { type: 'image/svg+xml' });
  }

  private elementToSVGString(element: HTMLElement): string {
    // Basic SVG conversion - would need enhancement for full fidelity
    const rect = element.getBoundingClientRect();
    return `<svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">
      <foreignObject width="100%" height="100%">
        ${element.outerHTML}
      </foreignObject>
    </svg>`;
  }

  private generateFilename(format: string): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `snippetshot-${timestamp}.${format}`;
  }
}

// Usage in extension.ts
async function handleExport(format: string = 'png') {
  const exportManager = ExportManager.getInstance();
  const snippetContainer = document.getElementById('snippet-container');

  if (!snippetContainer) return;

  try {
    const result = await exportManager.exportSnippet(snippetContainer as HTMLElement, {
      format: format as any,
      quality: 0.9,
      scale: 2, // High DPI
      backgroundColor: '#ffffff'
    });

    // Send to extension for saving
    vscode.postMessage({
      type: 'exportResult',
      data: {
        serializedBlob: await blobToSerializedString(result.blob),
        filename: result.filename,
        format: result.format
      }
    });
  } catch (error) {
    console.error('Export failed:', error);
    vscode.postMessage({
      type: 'exportError',
      message: error.message
    });
  }
}

function blobToSerializedString(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      resolve(Array.from(bytes).join(','));
    };
    reader.readAsArrayBuffer(blob);
  });
}
