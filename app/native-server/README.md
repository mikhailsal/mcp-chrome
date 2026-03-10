# Fastify Chrome Native Messaging Service

This is a Fastify-based TypeScript project for native communication with a Chrome extension.

## Features

- Bidirectional communication with a Chrome extension over the Chrome Native Messaging protocol
- **Multi-browser support**: Chrome and Chromium on Linux, macOS, and Windows
- RESTful API service
- Written entirely in TypeScript
- Includes a complete test suite
- Follows code-quality best practices

## Development Setup

### Prerequisites

- Node.js 20+
- npm 8+ or pnpm 8+

### Installation

```bash
git clone https://github.com/your-username/fastify-chrome-native.git
cd fastify-chrome-native
npm install
```

### Development

1. Build and register the native server locally.

```bash
cd app/native-server
npm run dev
```

2. Start the Chrome extension.

```bash
cd app/chrome-extension
npm run dev
```

### Build

```bash
npm run build
```

### Register the Native Messaging Host

#### Detect and register all installed browsers automatically

```bash
mcp-chrome-bridge register --detect
```

#### Register a specific browser

```bash
# Register Chrome only
mcp-chrome-bridge register --browser chrome

# Register Chromium only
mcp-chrome-bridge register --browser chromium

# Register every supported browser
mcp-chrome-bridge register --browser all
```

#### Global installation

The global install will automatically register any detected browsers:

```bash
npm i -g mcp-chrome-bridge
```

#### Browser support

| Browser       | Linux | macOS | Windows |
| ------------- | ----- | ----- | ------- |
| Google Chrome | ✓     | ✓     | ✓       |
| Chromium      | ✓     | ✓     | ✓       |

Registration paths:

- **Linux**: `~/.config/[browser-name]/NativeMessagingHosts/`
- **macOS**: `~/Library/Application Support/[Browser]/NativeMessagingHosts/`
- **Windows**: `%APPDATA%\[Browser]\NativeMessagingHosts\`

### Integrating with a Chrome Extension

The following example shows how a Chrome extension can connect to this service:

```javascript
// background.js
let nativePort = null;
let serverRunning = false;

// Start the Native Messaging service.
function startServer() {
  if (nativePort) {
    console.log('Already connected to the Native Messaging host');
    return;
  }

  try {
    nativePort = chrome.runtime.connectNative('com.yourcompany.fastify_native_host');

    nativePort.onMessage.addListener((message) => {
      console.log('Received Native message:', message);

      if (message.type === 'started') {
        serverRunning = true;
        console.log(`Service started on port ${message.payload.port}`);
      } else if (message.type === 'stopped') {
        serverRunning = false;
        console.log('Service stopped');
      } else if (message.type === 'error') {
        console.error('Native error:', message.payload.message);
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('Native connection closed:', chrome.runtime.lastError);
      nativePort = null;
      serverRunning = false;
    });

    // Start the server.
    nativePort.postMessage({ type: 'start', payload: { port: 3000 } });
  } catch (error) {
    console.error('Error while starting Native Messaging:', error);
  }
}

// Stop the server.
function stopServer() {
  if (nativePort && serverRunning) {
    nativePort.postMessage({ type: 'stop' });
  }
}

// Test communication with the server.
async function testPing() {
  try {
    const response = await fetch('http://localhost:3000/ping');
    const data = await response.json();
    console.log('Ping response:', data);
    return data;
  } catch (error) {
    console.error('Ping failed:', error);
    return null;
  }
}

// Connect to the Native host when the extension starts.
chrome.runtime.onStartup.addListener(startServer);

// Export an API for popup or content-script callers.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startServer') {
    startServer();
    sendResponse({ success: true });
  } else if (message.action === 'stopServer') {
    stopServer();
    sendResponse({ success: true });
  } else if (message.action === 'testPing') {
    testPing().then(sendResponse);
    return true; // Indicates an asynchronous response.
  }
});
```

### Testing

```bash
npm run test
```

### License

MIT
