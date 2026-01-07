/* Global State */
/* Global State */
const state = {
    file: null,
    pdfDoc: null,
    scale: 1.5,
    currentColor: '#000000',
    currentFont: 'standard', // 'standard' or 'signature'
    inputs: [],
};

/* DOM Elements */
const elements = {
    uploadView: document.getElementById('upload-view'),
    editorView: document.getElementById('editor-view'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    uploadBtn: document.getElementById('upload-btn'),
    pdfContainer: document.getElementById('pdf-container'),
    editorControls: document.getElementById('editor-controls'),
    fileName: document.getElementById('file-name'),
    downloadBtn: document.getElementById('download-btn'),
    resetBtn: document.getElementById('reset-btn'),
    toast: document.getElementById('toast'),
    colorBtns: document.querySelectorAll('.btn-color'),
    signatureBtn: document.getElementById('btn-signature'),
};

/* PDF.js Setup */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* Helper: Active Tool */
function setActiveTool(activeBtn) {
    if (!activeBtn) return;
    elements.colorBtns.forEach(b => b.classList.remove('active'));
    if (elements.signatureBtn) elements.signatureBtn.classList.remove('active');

    activeBtn.classList.add('active');
}

/* Event Listeners */
document.addEventListener('DOMContentLoaded', () => {
    console.log("RellenaPDF v3.0 Loaded");
    // Upload Handlers
    elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Drag and Drop
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('dragover');
    });
    elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('dragover'));
    elements.dropZone.addEventListener('drop', handleDrop);

    // Actions
    elements.resetBtn.addEventListener('click', resetApp);
    elements.downloadBtn.addEventListener('click', handleDownload);

    // Color Selection
    elements.colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log("Color clicked");
            setActiveTool(e.target);
            state.currentColor = e.target.dataset.color;
            state.currentFont = e.target.dataset.font || 'roboto';

            // Updates only affect future inputs, per user request.
        });
    });

    // Signature Selection
    if (elements.signatureBtn) {
        elements.signatureBtn.addEventListener('click', (e) => {
            const btn = e.target.closest('button') || e.target;
            setActiveTool(btn);
            state.currentColor = '#000000';
            state.currentFont = 'signature';
        });
    }

    // PWA Install
    const pwaBtn = document.getElementById('pwa-install-btn');
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (pwaBtn) pwaBtn.classList.remove('hidden');
    });

    if (pwaBtn) {
        pwaBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (outcome === 'accepted') pwaBtn.classList.add('hidden');
        });
    }
});

/* File Handling */

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('Por favor, selecciona un archivo PDF válido.');
    }
}

function handleDrop(e) {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    }
}

async function loadPDF(file) {
    state.file = file;
    elements.fileName.textContent = file.name;

    // UI Feedback
    const originalBtnText = elements.uploadBtn.innerText;
    elements.uploadBtn.innerText = 'Cargando...';
    elements.uploadBtn.disabled = true;
    document.body.style.cursor = 'wait';

    try {
        const arrayBuffer = await file.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Transition UI
        elements.uploadView.classList.remove('active');
        elements.uploadView.classList.add('hidden');
        elements.editorView.classList.remove('hidden');
        elements.editorView.classList.add('active');
        elements.editorControls.classList.remove('hidden');

        await renderPages();

        // Show Toast Onboarding
        showToast();

    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('No se pudo abrir el PDF. Intenta con otro archivo.');
        resetApp();
    } finally {
        // Restore UI
        elements.uploadBtn.innerText = originalBtnText;
        elements.uploadBtn.disabled = false;
        document.body.style.cursor = 'default';
    }
}

function showToast() {
    elements.toast.classList.remove('hidden');
    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 4000);
}

/* API: Render Pages */
async function renderPages() {
    elements.pdfContainer.innerHTML = ''; // Clear previous
    state.inputs = [];

    for (let pageNum = 1; pageNum <= state.pdfDoc.numPages; pageNum++) {
        const page = await state.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: state.scale });

        // Container for Page (Canvas + Text Layer)
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        // Canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        // Interactive Layer
        const textLayer = document.createElement('div');
        textLayer.className = 'text-layer';
        textLayer.dataset.pageIndex = pageNum - 1; // 0-based for pdf-lib
        textLayer.addEventListener('click', (e) => handlePageClick(e, textLayer));

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(textLayer);
        elements.pdfContainer.appendChild(pageContainer);
    }
}

/* Interactions: Adding Text */
function handlePageClick(e, layer) {
    // If clicking on an existing tool/wrapper, ignore global click
    if (e.target.closest('.input-wrapper') || e.target.closest('.btn-delete')) return;

    // Clear focus from all existing inputs
    document.querySelectorAll('.input-wrapper.focused').forEach(el => el.classList.remove('focused'));

    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    createInput(layer, x, y);
}

function createInput(layer, x, y, initialText = '') {
    // Wrapper Container
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';
    wrapper.style.left = `${x}px`;
    wrapper.style.top = `${y}px`;

    // Content Editable Area
    const content = document.createElement('div');
    content.className = 'input-content';

    // Apply font based on current state
    let fontSize = '16px';
    let fontFamily = "'Roboto', sans-serif";

    if (state.currentFont === 'caveat') {
        fontFamily = "'Caveat', cursive";
        fontSize = '24px';
    } else if (state.currentFont === 'patrick') {
        fontFamily = "'Patrick Hand', cursive";
        fontSize = '20px';
    } else if (state.currentFont === 'signature') {
        fontFamily = "'Dancing Script', cursive";
        fontSize = '32px';
    }

    content.style.fontFamily = fontFamily;
    content.style.fontSize = fontSize;
    content.contentEditable = true;
    content.innerText = initialText;
    content.style.color = state.currentColor;
    content.dataset.color = state.currentColor;
    content.dataset.font = state.currentFont;

    // Delete Button
    const delBtn = document.createElement('div');
    delBtn.className = 'btn-delete';
    delBtn.innerHTML = '×';
    delBtn.title = 'Eliminar';

    // Assemble
    wrapper.appendChild(content);
    wrapper.appendChild(delBtn);
    layer.appendChild(wrapper);

    // Logic
    setupInteractions(wrapper, content, delBtn);

    // Initial Focus
    setTimeout(() => content.focus(), 0);
}

function setupInteractions(wrapper, content, delBtn) {
    // 1. Delete Logic
    delBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        wrapper.remove();
    };

    // 2. Focus Logic
    content.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.input-wrapper.focused').forEach(el => {
            if (el !== wrapper) el.classList.remove('focused');
        });
        wrapper.classList.add('focused');
    });

    content.addEventListener('focus', () => {
        wrapper.classList.add('focused');
    });

    content.addEventListener('blur', () => {
        setTimeout(() => {
            if (!content.innerText.trim()) wrapper.remove();
        }, 100);
    });

    // 3. Drag Logic
    wrapper.addEventListener('mousedown', (e) => {
        if (e.target === delBtn || e.target.closest('.btn-delete')) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseFloat(wrapper.style.left);
        const startTop = parseFloat(wrapper.style.top);

        function onMouseMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            wrapper.style.left = `${startLeft + dx}px`;
            wrapper.style.top = `${startTop + dy}px`;
            wrapper.classList.add('focused');
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}


function saveInputState(layer, inputElement) {
    // This function doesn't need to persist state actively,
    // we can scrape the DOM on download to ensure we get exactly what the user sees.
}

/* Download Handling */
async function handleDownload() {
    if (!state.file) return;

    const { PDFDocument, rgb, StandardFonts } = PDFLib;

    try {
        // Load original PDF
        const arrayBuffer = await state.file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();

        // Embed fonts for different text types
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const signatureFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

        // Gather inputs from DOM
        const inputElements = document.querySelectorAll('.input-content');

        inputElements.forEach(el => {
            const text = el.innerText;
            if (!text.trim()) return;

            const wrapper = el.parentElement; // The .input-wrapper
            const layer = wrapper.parentElement; // The .text-layer
            const pageIndex = parseInt(layer.dataset.pageIndex);
            const page = pages[pageIndex];

            const { width, height } = page.getSize(); // PDF points

            // Get visual position percentages to be scale-independent
            const layerRect = layer.getBoundingClientRect(); // Visual pixel size

            // Wrapper visual position relative to layer
            const elLeft = parseFloat(wrapper.style.left);
            const elTop = parseFloat(wrapper.style.top);

            // Position Input Correction
            const xPercent = (elLeft + 4) / layerRect.width;
            const yPercent = (elTop + 4) / layerRect.height;

            // PDF Coordinates
            const pdfX = xPercent * width;
            const pdfY = height - (yPercent * height) - (14);

            // Font & Size Logic
            const fontType = el.dataset.font;
            const usedFont = fontType === 'signature' ? signatureFont : helveticaFont;
            // Signature needs be larger to match visual 24px vs 16px
            // Scale Factor: 24/16 = 1.5. 
            const fontSize = (fontType === 'signature' ? 24 : 16) / state.scale;

            // Color Logic
            const hex = el.dataset.color || '#000000';
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;

            page.drawText(text, {
                x: pdfX,
                y: pdfY,
                size: fontSize,
                font: usedFont,
                color: rgb(r, g, b),
            });
        });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });

        // Create download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);

        // Ensure filename has .pdf extension
        let filename = state.file.name;
        if (!filename.toLowerCase().endsWith('.pdf')) {
            filename += '.pdf';
        }
        link.download = `rellenado_${filename}`;

        // Append to body to ensure 'download' attribute works correctly in all browsers
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        console.log('PDF descargado exitosamente');
    } catch (error) {
        console.error('Error al descargar PDF:', error);
        alert('Hubo un error al generar el PDF. Por favor, intenta nuevamente.');
    }
}

function resetApp() {
    state.file = null;
    state.pdfDoc = null;

    elements.fileInput.value = '';
    elements.uploadView.classList.remove('hidden');
    elements.uploadView.classList.add('active');
    elements.editorView.classList.add('hidden');
    elements.editorView.classList.remove('active');
    elements.editorControls.classList.add('hidden');
    elements.toast.classList.add('hidden'); // Hide toast if active
}
