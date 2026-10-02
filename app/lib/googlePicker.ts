// Thin wrapper around Google's Picker JS API. No official TypeScript types are
// published for it, so the loaded globals are typed as `any` at the boundary.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi: any
    google: any
  }
}

let loadPromise: Promise<void> | null = null

function loadGooglePickerScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.picker) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => window.gapi.load('picker', { callback: resolve })
    script.onerror = () => reject(new Error('Failed to load Google Picker script'))
    document.body.appendChild(script)
  })
  return loadPromise
}

// Opens the Google Drive picker scoped to Sheets, resolving with the chosen
// spreadsheet's file ID, or null if the teacher cancels.
export async function openGoogleSheetPicker(oauthToken: string, developerKey: string): Promise<string | null> {
  await loadGooglePickerScript()

  return new Promise((resolve) => {
    // The built-in SPREADSHEETS view includes uploaded Excel files stored in
    // Drive, not just native Google Sheets — but the Sheets API can only read
    // native Sheets documents (it fails with a "must not be an Office file"
    // error on an unconverted .xlsx). Restricting the mimetype keeps the
    // picker showing only files this import path can actually read; an
    // uploaded Excel file should go through the separate "Upload Excel" flow
    // instead, which parses it directly and doesn't need the Sheets API at all.
    const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
      .setMode(window.google.picker.DocsViewMode.LIST)
      .setMimeTypes('application/vnd.google-apps.spreadsheet')

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(oauthToken)
      .setDeveloperKey(developerKey)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          resolve(data.docs[0].id)
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
