import { ImportExportService, ImportResult, BulkOperationResult, ImportFormat } from '../services/ImportExportService';
import { ExportFormat } from '../services/ExportService';
import { Schedule } from '../models/Schedule';

export class ImportExportUI {
  public container: HTMLElement;
  private importExportService: ImportExportService;

  constructor(container: HTMLElement, importExportService: ImportExportService) {
    this.container = container;
    this.importExportService = importExportService;
    // Don't render in constructor - wait for proper container assignment
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="import-export-container">
        <div class="section-header">
          <h2>Import & Export</h2>
          <p>Import player data or export schedules in various formats</p>
        </div>

        <!-- Import Section -->
        <div class="import-section">
          <h3>Import Players</h3>
          <div class="import-controls">
            <div class="file-input-group">
              <label for="import-file">Select File:</label>
              <input type="file" id="import-file" accept=".csv,.xlsx,.xls" />
              <select id="import-format">
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </div>
            <div class="import-actions">
              <button id="validate-import" class="btn btn-secondary">Validate File</button>
              <button id="import-players" class="btn btn-primary">Import Players</button>
              <button id="download-template" class="btn btn-outline">Download Template</button>
            </div>
          </div>
          <div id="import-results" class="results-container" style="display: none;"></div>
        </div>

        <!-- Export Section -->
        <div class="export-section">
          <h3>Export Schedule</h3>
          <div class="export-controls">
            <div class="export-options">
              <label for="export-week">Week:</label>
              <select id="export-week">
                <option value="">Select a week...</option>
              </select>
              
              <label for="export-format">Format:</label>
              <select id="export-format">
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            <div class="export-actions">
              <button id="export-schedule" class="btn btn-primary">Export Schedule</button>
            </div>
          </div>
          <div id="export-results" class="results-container" style="display: none;"></div>
        </div>

        <!-- Bulk Operations Section -->
        <div class="bulk-operations-section">
          <h3>Bulk Player Operations</h3>
          <div class="bulk-controls">
            <div class="operation-builder">
              <select id="bulk-operation">
                <option value="add">Add Player</option>
                <option value="update">Update Player</option>
                <option value="remove">Remove Player</option>
              </select>
              <div id="bulk-form-container"></div>
              <button id="add-operation" class="btn btn-secondary">Add to Queue</button>
            </div>
            <div class="operation-queue">
              <h4>Queued Operations</h4>
              <div id="operation-list"></div>
              <div class="queue-actions">
                <button id="execute-bulk" class="btn btn-primary">Execute All</button>
                <button id="clear-queue" class="btn btn-outline">Clear Queue</button>
              </div>
            </div>
          </div>
          <div id="bulk-results" class="results-container" style="display: none;"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.updateBulkForm();
  }

  private attachEventListeners(): void {
    // Import event listeners
    const validateBtn = this.container.querySelector('#validate-import') as HTMLButtonElement;
    const importBtn = this.container.querySelector('#import-players') as HTMLButtonElement;
    const templateBtn = this.container.querySelector('#download-template') as HTMLButtonElement;
    const fileInput = this.container.querySelector('#import-file') as HTMLInputElement;

    validateBtn?.addEventListener('click', () => this.validateImportFile());
    importBtn?.addEventListener('click', () => this.importPlayers());
    templateBtn?.addEventListener('click', () => this.downloadTemplate());
    fileInput?.addEventListener('change', () => this.clearImportResults());

    // Export event listeners
    const exportBtn = this.container.querySelector('#export-schedule') as HTMLButtonElement;
    exportBtn?.addEventListener('click', () => this.exportSchedule());

    // Bulk operations event listeners
    const bulkOperationSelect = this.container.querySelector('#bulk-operation') as HTMLSelectElement;
    const addOperationBtn = this.container.querySelector('#add-operation') as HTMLButtonElement;
    const executeBulkBtn = this.container.querySelector('#execute-bulk') as HTMLButtonElement;
    const clearQueueBtn = this.container.querySelector('#clear-queue') as HTMLButtonElement;

    bulkOperationSelect?.addEventListener('change', () => this.updateBulkForm());
    addOperationBtn?.addEventListener('click', () => this.addBulkOperation());
    executeBulkBtn?.addEventListener('click', () => this.executeBulkOperations());
    clearQueueBtn?.addEventListener('click', () => this.clearOperationQueue());
  }

  private async validateImportFile(): Promise<void> {
    const fileInput = this.container.querySelector('#import-file') as HTMLInputElement;
    const formatSelect = this.container.querySelector('#import-format') as HTMLSelectElement;
    
    if (!fileInput.files || fileInput.files.length === 0) {
      this.showImportError('Please select a file to validate');
      return;
    }

    const file = fileInput.files[0];
    const format = formatSelect.value as ImportFormat;

    try {
      const fileData = format === 'csv' 
        ? await this.readFileAsText(file)
        : await this.readFileAsBuffer(file);

      const validation = this.importExportService.validateImportFile(fileData, format);
      
      if (validation.valid) {
        this.showImportSuccess('File validation passed. Ready to import.');
      } else {
        this.showImportError(`Validation failed: ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      this.showImportError(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async importPlayers(): Promise<void> {
    const fileInput = this.container.querySelector('#import-file') as HTMLInputElement;
    const formatSelect = this.container.querySelector('#import-format') as HTMLSelectElement;
    
    if (!fileInput.files || fileInput.files.length === 0) {
      this.showImportError('Please select a file to import');
      return;
    }

    const file = fileInput.files[0];
    const format = formatSelect.value as ImportFormat;

    try {
      this.showImportProgress('Importing players...');

      const fileData = format === 'csv' 
        ? await this.readFileAsText(file)
        : await this.readFileAsBuffer(file);

      const result = await this.importExportService.importPlayers(fileData, format);
      this.displayImportResults(result);
    } catch (error) {
      this.showImportError(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async downloadTemplate(): Promise<void> {
    const formatSelect = this.container.querySelector('#import-format') as HTMLSelectElement;
    const format = formatSelect.value as ImportFormat;

    try {
      const result = this.importExportService.generateImportTemplate(format);
      
      if (result.success && result.data) {
        this.downloadFile(result.data, result.filename, result.mimeType);
        this.showImportSuccess('Template downloaded successfully');
      } else {
        this.showImportError(`Template generation failed: ${result.error}`);
      }
    } catch (error) {
      this.showImportError(`Template error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async exportSchedule(): Promise<void> {
    const weekSelect = this.container.querySelector('#export-week') as HTMLSelectElement;
    const formatSelect = this.container.querySelector('#export-format') as HTMLSelectElement;
    
    if (!weekSelect.value) {
      this.showExportError('Please select a week to export');
      return;
    }

    const format = formatSelect.value as ExportFormat;

    try {
      this.showExportProgress('Exporting schedule...');

      // This would need to be connected to the actual schedule data
      // For now, we'll show a placeholder message
      this.showExportSuccess(`Schedule export for week ${weekSelect.value} in ${format} format would be generated here`);
    } catch (error) {
      this.showExportError(`Export error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private updateBulkForm(): void {
    const operationSelect = this.container.querySelector('#bulk-operation') as HTMLSelectElement;
    const formContainer = this.container.querySelector('#bulk-form-container') as HTMLElement;
    const operation = operationSelect.value;

    let formHTML = '';

    switch (operation) {
      case 'add':
        formHTML = `
          <div class="form-group">
            <input type="text" id="bulk-first-name" placeholder="First Name" required />
            <input type="text" id="bulk-last-name" placeholder="Last Name" required />
            <select id="bulk-handedness">
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
            <select id="bulk-time-preference">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
              <option value="Either">Either</option>
            </select>
          </div>
        `;
        break;
      case 'update':
        formHTML = `
          <div class="form-group">
            <input type="text" id="bulk-player-id" placeholder="Player ID" required />
            <input type="text" id="bulk-first-name" placeholder="First Name" />
            <input type="text" id="bulk-last-name" placeholder="Last Name" />
            <select id="bulk-handedness">
              <option value="">Keep current</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
            <select id="bulk-time-preference">
              <option value="">Keep current</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
              <option value="Either">Either</option>
            </select>
          </div>
        `;
        break;
      case 'remove':
        formHTML = `
          <div class="form-group">
            <input type="text" id="bulk-player-id" placeholder="Player ID" required />
          </div>
        `;
        break;
    }

    formContainer.innerHTML = formHTML;
  }

  private operationQueue: any[] = [];

  private addBulkOperation(): void {
    const operationSelect = this.container.querySelector('#bulk-operation') as HTMLSelectElement;
    const operation = operationSelect.value;

    let operationData: any = { operation };

    switch (operation) {
      case 'add':
        const firstName = (this.container.querySelector('#bulk-first-name') as HTMLInputElement).value;
        const lastName = (this.container.querySelector('#bulk-last-name') as HTMLInputElement).value;
        const handedness = (this.container.querySelector('#bulk-handedness') as HTMLSelectElement).value;
        const timePreference = (this.container.querySelector('#bulk-time-preference') as HTMLSelectElement).value;

        if (!firstName || !lastName) {
          this.showBulkError('First name and last name are required');
          return;
        }

        operationData.playerData = { firstName, lastName, handedness, timePreference };
        break;

      case 'update':
        const playerId = (this.container.querySelector('#bulk-player-id') as HTMLInputElement).value;
        if (!playerId) {
          this.showBulkError('Player ID is required for update operation');
          return;
        }

        const updateData: any = {};
        const updateFirstName = (this.container.querySelector('#bulk-first-name') as HTMLInputElement).value;
        const updateLastName = (this.container.querySelector('#bulk-last-name') as HTMLInputElement).value;
        const updateHandedness = (this.container.querySelector('#bulk-handedness') as HTMLSelectElement).value;
        const updateTimePreference = (this.container.querySelector('#bulk-time-preference') as HTMLSelectElement).value;

        if (updateFirstName) updateData.firstName = updateFirstName;
        if (updateLastName) updateData.lastName = updateLastName;
        if (updateHandedness) updateData.handedness = updateHandedness;
        if (updateTimePreference) updateData.timePreference = updateTimePreference;

        operationData.playerId = playerId;
        operationData.playerData = updateData;
        break;

      case 'remove':
        const removePlayerId = (this.container.querySelector('#bulk-player-id') as HTMLInputElement).value;
        if (!removePlayerId) {
          this.showBulkError('Player ID is required for remove operation');
          return;
        }
        operationData.playerId = removePlayerId;
        break;
    }

    this.operationQueue.push(operationData);
    this.updateOperationList();
    this.clearBulkForm();
  }

  private updateOperationList(): void {
    const listContainer = this.container.querySelector('#operation-list') as HTMLElement;
    
    if (this.operationQueue.length === 0) {
      listContainer.innerHTML = '<p class="empty-state">No operations queued</p>';
      return;
    }

    const listHTML = this.operationQueue.map((op, index) => {
      let description = '';
      switch (op.operation) {
        case 'add':
          description = `Add: ${op.playerData.firstName} ${op.playerData.lastName}`;
          break;
        case 'update':
          description = `Update: Player ${op.playerId}`;
          break;
        case 'remove':
          description = `Remove: Player ${op.playerId}`;
          break;
      }

      return `
        <div class="operation-item">
          <span>${description}</span>
          <button class="btn btn-small btn-outline" onclick="this.removeOperation(${index})">Remove</button>
        </div>
      `;
    }).join('');

    listContainer.innerHTML = listHTML;
  }

  private async executeBulkOperations(): Promise<void> {
    if (this.operationQueue.length === 0) {
      this.showBulkError('No operations to execute');
      return;
    }

    try {
      this.showBulkProgress('Executing bulk operations...');
      
      const result = await this.importExportService.performBulkPlayerOperations(this.operationQueue);
      this.displayBulkResults(result);
      
      if (result.success) {
        this.operationQueue = [];
        this.updateOperationList();
      }
    } catch (error) {
      this.showBulkError(`Bulk operation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private clearOperationQueue(): void {
    this.operationQueue = [];
    this.updateOperationList();
    this.clearBulkResults();
  }

  private clearBulkForm(): void {
    const inputs = this.container.querySelectorAll('#bulk-form-container input, #bulk-form-container select');
    inputs.forEach(input => {
      if (input instanceof HTMLInputElement) {
        input.value = '';
      } else if (input instanceof HTMLSelectElement) {
        input.selectedIndex = 0;
      }
    });
  }

  // Utility methods for file handling
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private readFileAsBuffer(file: File): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private downloadFile(data: string | Buffer, filename: string, mimeType: string): void {
    const blob = new Blob([data as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Result display methods
  private displayImportResults(result: ImportResult): void {
    const resultsContainer = this.container.querySelector('#import-results') as HTMLElement;
    resultsContainer.style.display = 'block';

    let html = `
      <div class="results-summary ${result.success ? 'success' : 'error'}">
        <h4>Import Results</h4>
        <p>Imported: ${result.importedCount} players</p>
        <p>Skipped: ${result.skippedCount} players</p>
      </div>
    `;

    if (result.warnings.length > 0) {
      html += `
        <div class="warnings">
          <h5>Warnings:</h5>
          <ul>
            ${result.warnings.map(w => `<li>Row ${w.row}: ${w.message}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    if (result.errors.length > 0) {
      html += `
        <div class="errors">
          <h5>Errors:</h5>
          <ul>
            ${result.errors.map(e => `<li>Row ${e.row}: ${e.message}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;
  }

  private displayBulkResults(result: BulkOperationResult): void {
    const resultsContainer = this.container.querySelector('#bulk-results') as HTMLElement;
    resultsContainer.style.display = 'block';

    let html = `
      <div class="results-summary ${result.success ? 'success' : 'error'}">
        <h4>Bulk Operation Results</h4>
        <p>Successful: ${result.successCount} operations</p>
        <p>Failed: ${result.failureCount} operations</p>
      </div>
    `;

    if (result.errors.length > 0) {
      html += `
        <div class="errors">
          <h5>Errors:</h5>
          <ul>
            ${result.errors.map(e => `<li>${e.operation.operation}: ${e.error}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;
  }

  // Status message methods
  private showImportSuccess(message: string): void {
    this.showImportMessage(message, 'success');
  }

  private showImportError(message: string): void {
    this.showImportMessage(message, 'error');
  }

  private showImportProgress(message: string): void {
    this.showImportMessage(message, 'progress');
  }

  private showImportMessage(message: string, type: string): void {
    const resultsContainer = this.container.querySelector('#import-results') as HTMLElement;
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
  }

  private clearImportResults(): void {
    const resultsContainer = this.container.querySelector('#import-results') as HTMLElement;
    resultsContainer.style.display = 'none';
  }

  private showExportSuccess(message: string): void {
    this.showExportMessage(message, 'success');
  }

  private showExportError(message: string): void {
    this.showExportMessage(message, 'error');
  }

  private showExportProgress(message: string): void {
    this.showExportMessage(message, 'progress');
  }

  private showExportMessage(message: string, type: string): void {
    const resultsContainer = this.container.querySelector('#export-results') as HTMLElement;
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
  }

  private showBulkError(message: string): void {
    this.showBulkMessage(message, 'error');
  }

  private showBulkProgress(message: string): void {
    this.showBulkMessage(message, 'progress');
  }

  private showBulkMessage(message: string, type: string): void {
    const resultsContainer = this.container.querySelector('#bulk-results') as HTMLElement;
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
  }

  private clearBulkResults(): void {
    const resultsContainer = this.container.querySelector('#bulk-results') as HTMLElement;
    resultsContainer.style.display = 'none';
  }

  // Public methods for external integration
  public updateWeekOptions(weeks: { id: string; name: string }[]): void {
    const weekSelect = this.container.querySelector('#export-week') as HTMLSelectElement;
    weekSelect.innerHTML = '<option value="">Select a week...</option>';
    
    weeks.forEach(week => {
      const option = document.createElement('option');
      option.value = week.id;
      option.textContent = week.name;
      weekSelect.appendChild(option);
    });
  }

  public setScheduleForExport(schedule: Schedule): void {
    // Store schedule reference for export functionality
    (this as any).currentSchedule = schedule;
  }
}