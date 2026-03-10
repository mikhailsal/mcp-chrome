# Chrome MCP Bridge Installation Guide

This document explains how to install and register Chrome MCP Bridge.

## Installation Overview

The overall install and registration flow looks like this:

```text
npm install -g mcp-chrome-bridge
└─ postinstall.js
   ├─ Copy executables into npm_prefix/bin        <- always writable for the current user or root
   ├─ Try user-level registration                 <- no sudo required, usually succeeds
   └─ If that fails, ask the user to run:
      mcp-chrome-bridge register --system
      └─ Must be run manually with elevated privileges
```

The diagram above covers the full path from global installation to completed registration.

## Detailed Installation Steps

### 1. Global installation

```bash
npm install -g mcp-chrome-bridge
```

After installation, the system automatically attempts to register the Native Messaging host in the user directory. This does not require administrator privileges and is the recommended path.

### 2. User-level registration

User-level registration creates a manifest file in one of these locations:

```text
Manifest locations
├─ User level (no administrator privileges required)
│  ├─ Windows: %APPDATA%\Google\Chrome\NativeMessagingHosts\
│  ├─ macOS:   ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
│  └─ Linux:   ~/.config/google-chrome/NativeMessagingHosts/
│
└─ System level (administrator privileges required)
   ├─ Windows: %ProgramFiles%\Google\Chrome\NativeMessagingHosts\
   ├─ macOS:   /Library/Google/Chrome/NativeMessagingHosts/
   └─ Linux:   /etc/opt/chrome/native-messaging-hosts/
```

If automatic registration fails, or if you want to do it manually, run:

```bash
mcp-chrome-bridge register
```

Recommended diagnostic command:

```bash
mcp-chrome-bridge doctor
```

### 3. System-level registration

If user-level registration fails, for example because of permission issues, try system-level registration. This requires elevated privileges, but there are two convenient ways to do it.

#### Option 1: Use `--system` (recommended)

```bash
# macOS/Linux
sudo mcp-chrome-bridge register --system

# Windows (run Command Prompt as Administrator)
mcp-chrome-bridge register --system
```

System-level installation needs administrator privileges to write system directories and the registry.

#### Option 2: Run the standard command with elevated privileges

Windows:

Run Command Prompt or PowerShell as Administrator, then execute:

```text
mcp-chrome-bridge register
```

macOS/Linux:

```text
sudo mcp-chrome-bridge register
```

## Registration Flow Details

### Registration flow

```text
Registration flow
├─ User-level registration (mcp-chrome-bridge register)
│  ├─ Resolve the user-level manifest path
│  ├─ Create the user directory
│  ├─ Generate manifest content
│  ├─ Write the manifest file
│  └─ On Windows, create the user-level registry key
│
└─ System-level registration (mcp-chrome-bridge register --system)
   ├─ Check for administrator privileges
   │  ├─ Privileged -> create the system directory and write the manifest directly
   │  └─ Not privileged -> prompt the user to rerun with elevation
   └─ On Windows, create the system-level registry key
```

### Manifest structure

```text
manifest.json
├─ name: "com.chromemcp.nativehost"
├─ description: "Node.js Host for Browser Bridge Extension"
├─ path: "/path/to/run_host.sh"       <- launcher script path
├─ type: "stdio"                      <- transport type
└─ allowed_origins: [                  <- allowed extension origins
   "chrome-extension://extension-id/"
]
```

### User-level registration steps

1. Resolve the user-level manifest path.
2. Create the required directories.
3. Generate the manifest content, including:
   - host name
   - description
   - Node.js executable path
   - transport type (`stdio`)
   - allowed extension IDs
   - launch arguments
4. Write the manifest file.
5. On Windows, create the matching registry key.

### System-level registration steps

1. Detect whether elevated privileges are already available.
2. If privileges are available:
   - create the system-level directory
   - write the manifest file
   - set the correct permissions
   - create the system-level registry key on Windows
3. If privileges are not available:
   - prompt the user to rerun with elevation
   - macOS/Linux: `sudo mcp-chrome-bridge register --system`
   - Windows: run Command Prompt as Administrator

## Verifying the Installation

### Verification flow

```text
Verification
├─ Check the manifest file
│  ├─ File exists -> validate the contents
│  └─ File missing -> reinstall
│
├─ Check the Chrome extension
│  ├─ Extension installed -> verify extension permissions
│  └─ Extension missing -> install the extension
│
└─ Test the connection
   ├─ Connection succeeds -> installation complete
   └─ Connection fails -> inspect error logs and use troubleshooting guidance
```

### Verification steps

1. Check whether the manifest file exists in the expected directory.
   - User level: check the manifest under the user directory.
   - System level: check the manifest under the system directory.
   - Confirm that the manifest contents are correct.

2. Install the matching Chrome extension.
   - Make sure the extension is installed correctly.
   - Make sure it has the `nativeMessaging` permission.

3. Try connecting to the local service through the extension.
   - Use the extension's test functionality if available.
   - Review the extension logs in Chrome for errors.

## Troubleshooting

### Troubleshooting flow

```text
Troubleshooting
├─ Permission issues
│  ├─ Check user permissions
│  │  ├─ Sufficient -> inspect directory permissions
│  │  └─ Insufficient -> try system-level installation
│  ├─ Execution permission issues (macOS/Linux)
│  │  ├─ "Permission denied"
│  │  ├─ "Native host has exited"
│  │  └─ Run mcp-chrome-bridge fix-permissions
│  └─ Try mcp-chrome-bridge register --system
├─ Path issues
│  ├─ Check the Node.js install with `node -v`
│  └─ Check the global npm path with `npm root -g`
├─ Registry issues (Windows)
│  ├─ Check registry access permissions
│  └─ Try creating the registry key manually
└─ Other issues
   ├─ Check console error output
   └─ File an issue in the repository
```

### Common recovery steps

If installation fails, try the following:

1. Confirm that Node.js is installed correctly.
   - Run `node -v` and `npm -v`.
   - Make sure the Node.js version is at least 20.x.

2. Confirm that the process can create files and directories.
   - User-level installation needs write access to the user directory.
   - System-level installation needs administrator or root access.

3. Fix executable-permission issues.

   macOS/Linux:

   Problem symptoms:
   - npm usually preserves file permissions, but pnpm may not.
   - You may see `Permission denied` or `Native host has exited`.
   - The Chrome extension cannot launch the native host process.

   Solutions:

   a. Use the built-in repair command (recommended):

   ```bash
   mcp-chrome-bridge fix-permissions
   ```

   b. Run the diagnostic tool with auto-fix:

   ```bash
   mcp-chrome-bridge doctor --fix
   ```

   c. Set permissions manually:

   ```bash
   # Find the install path
   npm list -g mcp-chrome-bridge
   # Or, if you use pnpm
   pnpm list -g mcp-chrome-bridge

   # Set executable permissions (replace with the real path)
   chmod +x /path/to/node_modules/mcp-chrome-bridge/run_host.sh
   chmod +x /path/to/node_modules/mcp-chrome-bridge/index.js
   chmod +x /path/to/node_modules/mcp-chrome-bridge/cli.js
   ```

   Windows:

   Problem symptoms:
   - `.bat` files usually do not need executable bits, but other issues can still occur.
   - Files may be marked read-only.
   - You may see `Access denied` or similar execution failures.

   Solutions:

   a. Use the built-in repair command (recommended):

   ```cmd
   mcp-chrome-bridge fix-permissions
   ```

   b. Run the diagnostic tool with auto-fix:

   ```cmd
   mcp-chrome-bridge doctor --fix
   ```

   c. Inspect file properties manually:

   ```cmd
   # Find the install path
   npm list -g mcp-chrome-bridge

   # Then verify in File Explorer that run_host.bat is not read-only
   ```

   d. Reinstall and repair again:

   ```bash
   # Uninstall
   npm uninstall -g mcp-chrome-bridge
   # Or pnpm uninstall -g mcp-chrome-bridge

   # Reinstall
   npm install -g mcp-chrome-bridge
   # Or pnpm install -g mcp-chrome-bridge

   # If the issue remains, rerun the permission repair
   mcp-chrome-bridge fix-permissions
   ```

4. On Windows, confirm that registry access is not blocked.
   - Check `HKCU\Software\Google\Chrome\NativeMessagingHosts\`.
   - For system-level installation, also check `HKLM\Software\Google\Chrome\NativeMessagingHosts\`.

5. Try system-level installation.
   - Use `mcp-chrome-bridge register --system`.
   - Or rerun with elevated privileges.

6. Review console output.
   - Detailed errors usually point directly to the root cause.
   - Add `--verbose` for additional logging.

If the problem still persists, file an issue in the repository and include:

- operating system version
- Node.js version
- installation command
- error output
- recovery steps already attempted
