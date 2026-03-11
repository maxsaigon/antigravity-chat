import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { handleIncomingMessage } from './extension';

// The IPC socket path
const SOCKET_ID = 'antigravity-telegram-bridge.sock';
const SOCKET_PATH = os.platform() === 'win32'
    ? `\\\\.\\pipe\\${SOCKET_ID}`
    : `${os.tmpdir()}/${SOCKET_ID}`;

let server: net.Server | undefined;
let client: net.Socket | undefined;
const activeWorkers = new Set<net.Socket>();

/**
 * Attempt to start IPC server. If EADDRINUSE, connect as Worker.
 * Uses stale socket cleanup for robustness.
 */
export function initIPC(isMasterCallback: () => void) {
    // Clean stale socket before starting
    if (os.platform() !== 'win32' && fs.existsSync(SOCKET_PATH)) {
        const testClient = net.createConnection(SOCKET_PATH);
        testClient.on('error', () => {
            // Socket is stale, remove and start server
            try { fs.unlinkSync(SOCKET_PATH); } catch { }
            startServer(isMasterCallback);
        });
        testClient.on('connect', () => {
            // Master is alive, connect as worker
            testClient.end();
            connectAsWorker();
        });
    } else {
        startServer(isMasterCallback);
    }
}

function startServer(isMasterCallback: () => void) {
    server = net.createServer((c) => {
        console.log('[IPC] Worker connected');
        activeWorkers.add(c);

        // Buffer for message framing
        let buffer = '';

        c.on('data', (data) => {
            buffer += data.toString();
            // Process complete JSON messages (newline-delimited)
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const message = JSON.parse(line);
                    if (message.type === 'register_workspace') {
                        console.log(`[IPC] Worker registered: ${message.workspaceName}`);
                    }
                } catch (e) {
                    console.error('[IPC] Invalid message from worker:', e);
                }
            }
        });

        c.on('end', () => {
            console.log('[IPC] Worker disconnected');
            activeWorkers.delete(c);
        });

        c.on('error', () => {
            activeWorkers.delete(c);
        });
    });

    server.on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
            console.log('[IPC] Socket in use, connecting as Worker.');
            connectAsWorker();
        } else {
            console.error('[IPC] Server error:', e);
        }
    });

    server.listen(SOCKET_PATH, () => {
        console.log('[IPC] Started as Master');
        isMasterCallback();
    });
}

function connectAsWorker() {
    client = net.createConnection(SOCKET_PATH, () => {
        console.log('[IPC] Connected to Master');

        const folders = vscode.workspace.workspaceFolders;
        const name = folders && folders.length > 0 ? folders[0].name : 'Unknown';

        sendToMaster({ type: 'register_workspace', workspaceName: name });
    });

    let buffer = '';
    client.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const message = JSON.parse(line);
                if (message.command === 'inject_chat') {
                    handleIncomingMessage(message.text, message.chatId, message.targetPath);
                }
            } catch (e) {
                console.error('[IPC] Invalid message from master:', e);
            }
        }
    });

    client.on('error', (err) => {
        console.error('[IPC] Client error:', err.message);
    });

    client.on('end', () => {
        console.log('[IPC] Disconnected from Master');
    });
}

function sendToMaster(data: object) {
    if (client) {
        try { client.write(JSON.stringify(data) + '\n'); } catch { }
    }
}

/**
 * Master broadcasts a message to ALL worker windows.
 * Uses newline-delimited JSON for message framing.
 */
export function broadcastToWorkers(command: string, payload: any) {
    if (!server) return;

    const msg = JSON.stringify({ command, ...payload }) + '\n';
    for (const c of activeWorkers) {
        try { c.write(msg); } catch (err) {
            console.error('[IPC] Write to worker failed:', err);
        }
    }
}
