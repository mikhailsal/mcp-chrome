# Windows Installation Guide

This guide covers installation and troubleshooting for Chrome MCP Server on Windows.

## Installation

1. **Download the latest Chrome extension**

   Download it from:
   https://github.com/hangwin/mcp-chrome/releases

2. **Install `mcp-chrome-bridge` globally**

   Make sure Node.js is installed first.

   ```bash
   npm install -g mcp-chrome-bridge
   ```

3. **Load the Chrome extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select `your/dowloaded/extension/folder`
   - Click the extension icon, then click **Connect** to view the MCP configuration

     <img width="475" alt="Extension popup after loading the unpacked build" src="https://github.com/user-attachments/assets/241e57b8-c55f-41a4-9188-0367293dc5bc" />

4. **Use it from Cherry Studio**

   Use `streamableHttp` as the type and `http://127.0.0.1:12306/mcp` as the URL.

   <img width="675" alt="Cherry Studio MCP server configuration example" src="https://github.com/user-attachments/assets/6631e9e4-57f9-477e-b708-6a285cc0d881" />

   If the tool list appears, the setup is working.

   <img width="672" alt="Cherry Studio tool list after a successful connection" src="https://github.com/user-attachments/assets/d08b7e51-3466-4ab7-87fa-3f1d7be9d112" />

   ```json
   {
     "mcpServers": {
       "streamable-mcp-server": {
         "type": "streamable-http",
         "url": "http://127.0.0.1:12306/mcp"
       }
     }
   }
   ```

## Installation and Connection Problems

### Quick diagnosis

Run the diagnostic tool:

```bash
mcp-chrome-bridge doctor
```

Automatically fix common problems:

```bash
mcp-chrome-bridge doctor --fix
```

### The extension does not connect after clicking Connect

1. **Check that `mcp-chrome-bridge` is installed correctly**

   ```bash
   mcp-chrome-bridge -V
   ```

   <img width="612" alt="CLI version output for mcp-chrome-bridge" src="https://github.com/user-attachments/assets/59458532-e6e1-457c-8c82-3756a5dbb28e" />

2. **Check that the manifest file is in the correct directory**

   Path:
   `C:\Users\xxx\AppData\Roaming\Google\Chrome\NativeMessagingHosts`

3. **Check the logs**

   Logs are stored in:
   `%LOCALAPPDATA%\mcp-chrome-bridge\logs\`

   Example:
   `C:\Users\xxx\AppData\Local\mcp-chrome-bridge\logs\`

   <img width="804" alt="Windows log folder example" src="https://github.com/user-attachments/assets/ce7b7c94-7c84-409a-8210-c9317823aae1" />

4. **Node.js path issues**

   If you use a Node version manager such as `nvm-windows`, `volta`, or `fnm`, set the environment variable below:

   ```cmd
   set CHROME_MCP_NODE_PATH=C:\path\to\your\node.exe
   ```

   Or run `mcp-chrome-bridge doctor --fix` to write the current Node.js path automatically.
