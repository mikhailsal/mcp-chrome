# Chrome MCP Server Extension: Latest Release

## Quick Install

### 1. Download the extension

Download [chrome-mcp-server-latest.zip](/releases/chrome-extension/latest/chrome-mcp-server-lastest.zip)

### 2. Install the extension

1. Extract the downloaded zip file.
2. Open Chrome.
3. Navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the extracted extension folder.

### 3. Verify the installation

- The extension icon should appear in the browser toolbar.
- Clicking the icon should open the configuration panel.
- The extension status should display normally.

## Configuration

### Native Server connection

1. Make sure the native server is running on the expected port, which defaults to `12306`.
2. Enter the correct port in the extension popup.
3. Click **Connect** to test the connection.

## Troubleshooting

### Common issues

1. **The extension does not load**
   - Confirm that Developer mode is enabled.
   - Verify that the extracted folder structure is complete.

2. **The extension cannot connect to the native server**
   - Confirm the native server is running.
   - Check that the configured port is correct.
   - Review browser console errors.

3. **Features behave unexpectedly**
   - Refresh the target page and retry.
   - Restart the browser.
   - Reload the extension.

## Support

If you run into problems:

1. Check the browser console for errors.
2. Search GitHub Issues for similar reports.
3. Open a new issue with detailed reproduction steps.

## Security Note

- The extension requires powerful browser permissions. Only install releases from trusted sources.
