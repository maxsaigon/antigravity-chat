import * as vscode from 'vscode';
import TelegramBot = require('node-telegram-bot-api');
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { initIPC, broadcastToWorkers } from './ipc';

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let bot: TelegramBot | undefined;
let isStarted = false;
let isMaster = false;
let currentWorkerActivePath: string | undefined;
let brainWatcher: fs.FSWatcher | undefined;
let activeTelegramChatId: number | undefined;
let lastSentPromptTime = 0;
let lastArtifactContent = '';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getBrainDir(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

function getLatestConversationDir(): string | undefined {
    const brainDir = getBrainDir();
    if (!fs.existsSync(brainDir)) return undefined;

    try {
        const convDirs = fs.readdirSync(brainDir)
            .filter(d => {
                try { return fs.statSync(path.join(brainDir, d)).isDirectory() && d !== 'tempmediaStorage'; }
                catch { return false; }
            })
            .sort((a, b) => {
                try {
                    return fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs;
                } catch { return 0; }
            });
        return convDirs.length > 0 ? path.join(brainDir, convDirs[0]) : undefined;
    } catch { return undefined; }
}

/**
 * Send message to Telegram, splitting into chunks if > 4096 chars.
 */
async function sendToTelegram(chatId: number, text: string, parseMode?: 'Markdown' | 'HTML') {
    if (!bot) return;
    const MAX_LEN = 4000; // Slightly under 4096 for safety

    if (text.length <= MAX_LEN) {
        try {
            await bot.sendMessage(chatId, text, parseMode ? { parse_mode: parseMode } : {});
        } catch {
            // Fallback without parse_mode if markdown fails
            await bot.sendMessage(chatId, text).catch(() => { });
        }
        return;
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= MAX_LEN) {
            chunks.push(remaining);
            break;
        }
        // Try to split at a newline
        let splitIdx = remaining.lastIndexOf('\n', MAX_LEN);
        if (splitIdx < MAX_LEN * 0.5) splitIdx = MAX_LEN; // No good newline, force split
        chunks.push(remaining.substring(0, splitIdx));
        remaining = remaining.substring(splitIdx);
    }

    for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `📄 (${i + 1}/${chunks.length})\n` : '';
        try {
            await bot.sendMessage(chatId, prefix + chunks[i]);
        } catch { }
    }
}

// ═══════════════════════════════════════════════════════════════
// INPUT PIPELINE: Telegram → Antigravity AI
// ═══════════════════════════════════════════════════════════════

/**
 * v2: Direct API call — no AppleScript, no clipboard, no focus needed.
 * Prepends instruction for AI to write response to a file for capture.
 */
async function sendToAntigravity(text: string, chatId: number): Promise<void> {
    // Prepend prompt injection for output capture
    const wrappedPrompt = [
        `[TELEGRAM_BRIDGE]`,
        `After your response, you MUST write your COMPLETE response to a file called`,
        `"telegram_response.md" using the write_to_file tool in the artifacts directory.`,
        `This is critical for the Telegram bridge to capture your response.`,
        ``,
        `User message from Telegram:`,
        text
    ].join('\n');

    lastSentPromptTime = Date.now();

    try {
        await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', wrappedPrompt);
        console.log('[TelegramBridge] Prompt sent via sendPromptToAgentPanel');
    } catch (err: any) {
        console.error('[TelegramBridge] sendPromptToAgentPanel failed:', err.message);
        // Fallback: try legacy clipboard method
        await legacyClipboardInject(text);
    }
}

/**
 * Legacy fallback: clipboard injection via AppleScript (macOS only).
 * Only used if sendPromptToAgentPanel fails.
 */
async function legacyClipboardInject(text: string): Promise<void> {
    const currentName = vscode.workspace.workspaceFolders?.[0]?.name || 'Antigravity';

    await vscode.env.clipboard.writeText(text);
    await vscode.commands.executeCommand('antigravity.agentPanel.open');

    return new Promise((resolve) => {
        setTimeout(() => {
            vscode.commands.executeCommand('antigravity.agentPanel.focus').then(() => {
                setTimeout(() => {
                    if (os.platform() === 'darwin') {
                        const escapedName = currentName.replace(/"/g, '\\"');
                        const script = `
                            tell application "System Events"
                                set appNames to {"Electron", "Antigravity", "Code", "Cursor"}
                                repeat with appName in appNames
                                    try
                                        if exists process appName then
                                            tell process appName
                                                set frontmost to true
                                                set targetWindow to first window whose title contains "${escapedName}"
                                                perform action "AXRaise" of targetWindow
                                                delay 0.4
                                                keystroke "v" using command down
                                                delay 0.2
                                                keystroke return
                                                return true
                                            end tell
                                        end if
                                    end try
                                end repeat
                            end tell
                        `;
                        exec(`osascript -e '${script}'`, () => resolve());
                    } else {
                        vscode.commands.executeCommand('editor.action.clipboardPasteAction').then(() => {
                            setTimeout(() => {
                                vscode.commands.executeCommand('workbench.action.chat.submit').then(() => resolve());
                            }, 300);
                        });
                    }
                }, 300);
            });
        }, 600);
    });
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT PIPELINE: Antigravity AI → Telegram
// Brain Watcher: monitors artifact files for AI response content
// ═══════════════════════════════════════════════════════════════

/**
 * Clean artifact content for Telegram display.
 * Strips internal headers, metadata lines, and formats for readability.
 */
function cleanContentForTelegram(content: string, filename: string): string {
    let cleaned = content;

    // Remove TELEGRAM_BRIDGE instruction echo if present
    cleaned = cleaned.replace(/\[TELEGRAM_BRIDGE\][\s\S]*?User message from Telegram:\n?/g, '');

    // Remove render_diffs() lines (not useful on Telegram)
    cleaned = cleaned.replace(/^render_diffs\(.*\)$/gm, '');

    // Remove file:/// links (not clickable in Telegram)
    cleaned = cleaned.replace(/\[([^\]]+)\]\(file:\/\/\/[^)]+\)/g, '$1');

    // Trim excessive blank lines (max 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
}

/**
 * Check if a filename should be captured by Brain Watcher.
 */
function shouldCaptureFile(filename: string): 'telegram_response' | 'artifact' | false {
    // MUST exclude metadata and internal files first
    if (filename.endsWith('.metadata.json')) return false;
    if (filename.includes('.metadata.')) return false;
    if (filename.includes('task.md')) return false;

    // Check for telegram_response.md (exact, not substring match)
    const basename = path.basename(filename);
    if (basename === 'telegram_response.md' || basename === 'telegram_response.md.resolved') {
        return 'telegram_response';
    }

    // Check for .resolved files (artifact content)
    if (filename.endsWith('.resolved')) {
        // Only capture the base .resolved (not .resolved.0, .resolved.1 versions)
        if (/\.resolved\.\d+$/.test(filename)) return false;
        return 'artifact';
    }

    // Check for telegram_response.md without .resolved
    if (basename === 'telegram_response.md') {
        return 'telegram_response';
    }

    return false;
}

function startBrainWatcher() {
    const brainDir = getBrainDir();
    if (!fs.existsSync(brainDir)) {
        console.log('[TelegramBridge] Brain directory not found');
        return;
    }

    if (brainWatcher) {
        brainWatcher.close();
        brainWatcher = undefined;
    }

    // Track which files we've already sent to Telegram
    const processedFiles = new Set<string>();
    // Per-file debounce timers
    const debounceTimers = new Map<string, NodeJS.Timeout>();

    brainWatcher = fs.watch(brainDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (!activeTelegramChatId) return;

        const captureType = shouldCaptureFile(filename);
        if (!captureType) return;

        const parts = filename.split(path.sep);
        const convId = parts[0];

        // Build unique key for deduplication
        const fileKey = `${convId}:${captureType}:${path.basename(filename)}`;

        // Skip if already sent
        if (processedFiles.has(fileKey)) return;

        // Per-file debounce: wait 3s for file to stabilize
        const existingTimer = debounceTimers.get(fileKey);
        if (existingTimer) clearTimeout(existingTimer);

        const chatId = activeTelegramChatId;
        debounceTimers.set(fileKey, setTimeout(() => {
            debounceTimers.delete(fileKey);
            if (processedFiles.has(fileKey)) return;

            const fullPath = path.join(brainDir, filename);
            try {
                if (!fs.existsSync(fullPath)) return;
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory() || stat.size === 0 || stat.size > 100000) return;

                // Only process files modified AFTER the last prompt
                if (stat.mtimeMs < lastSentPromptTime) return;

                const rawContent = fs.readFileSync(fullPath, 'utf-8');
                if (!rawContent.trim()) return;

                // Skip if content is same as last artifact we sent
                if (rawContent === lastArtifactContent) return;

                // Clean content for Telegram
                const content = cleanContentForTelegram(rawContent, filename);
                if (!content || content.length < 5) return;

                processedFiles.add(fileKey);
                lastArtifactContent = rawContent;

                if (captureType === 'telegram_response') {
                    console.log(`[TelegramBridge] 📥 Captured response (${content.length} chars)`);
                    sendToTelegram(chatId, `🤖 AI Response:\n\n${content}`);
                } else {
                    const label = path.basename(filename, '.resolved').replace('.md', '');
                    console.log(`[TelegramBridge] 📥 Captured artifact: ${label} (${content.length} chars)`);
                    sendToTelegram(chatId, `📝 ${label}:\n\n${content}`);
                }
            } catch (e: any) {
                console.error('[TelegramBridge] Brain watcher error:', e.message);
            }
        }, 3000)); // Wait 3s for file to fully stabilize
    });

    console.log('[TelegramBridge] Brain watcher started');
}

/**
 * Fetch AI response using clipboard (fallback/manual).
 * Uses getDiagnostics as "response complete" signal.
 */
async function fetchResponseViaClipboard(chatId: number): Promise<void> {
    await sendToTelegram(chatId, '⏱️ Đang lấy response từ Chat panel...');

    try {
        // Focus the agent panel
        await vscode.commands.executeCommand('antigravity.agentPanel.focus');
        await new Promise(r => setTimeout(r, 500));

        if (os.platform() === 'darwin') {
            const script = `
                tell application "System Events"
                    keystroke "a" using command down
                    delay 0.3
                    keystroke "c" using command down
                    delay 0.3
                    key code 124
                end tell
            `;
            await new Promise<void>((resolve) => {
                exec(`osascript -e '${script}'`, () => resolve());
            });
        }

        await new Promise(r => setTimeout(r, 300));
        const clipText = await vscode.env.clipboard.readText();

        if (clipText && clipText.length > 0) {
            // Try to extract just the last response (after the last user message)
            const lastResponse = extractLastResponse(clipText);
            await sendToTelegram(chatId, `📝 Kết quả:\n\n${lastResponse}`);
        } else {
            await sendToTelegram(chatId, '❌ Không lấy được nội dung.');
        }
    } catch (err: any) {
        await sendToTelegram(chatId, `❌ Lỗi: ${err.message}`);
    }
}

/**
 * Extract last AI response from copied chat text.
 * Chat format is typically interleaved user/AI messages.
 */
function extractLastResponse(fullText: string): string {
    // Take the last 3000 chars as the most relevant
    const text = fullText.substring(Math.max(0, fullText.length - 3000));
    return text;
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM BOT
// ═══════════════════════════════════════════════════════════════

export function activate(context: vscode.ExtensionContext) {
    console.log('[TelegramBridge v2] Activated!');

    const startDisposable = vscode.commands.registerCommand('telegramBridge.start', () => startBot());
    const stopDisposable = vscode.commands.registerCommand('telegramBridge.stop', () => stopBot());
    context.subscriptions.push(startDisposable, stopDisposable);

    // Start Brain Watcher immediately
    startBrainWatcher();

    // IPC: try to be Master
    initIPC(() => {
        isMaster = true;
        startBot();
    });
}

function startBot() {
    if (isStarted) {
        vscode.window.showInformationMessage('Telegram Bot is already running.');
        return;
    }

    const config = vscode.workspace.getConfiguration('telegramBridge');
    const token = config.get<string>('botToken');
    const userIdConf = config.get<string>('userId');

    if (!token) {
        vscode.window.showErrorMessage('Telegram Bot Token is not set. Configure in settings.');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: true });
        isStarted = true;
        console.log('[TelegramBridge v2] Bot started!');
        vscode.window.showInformationMessage('Telegram Bridge v2 started! 🚀');

        // ── Message Handler ──
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';

            // Security check
            if (userIdConf && msg.from?.id.toString() !== userIdConf) {
                bot?.sendMessage(chatId, '⛔ Unauthorized user.');
                return;
            }

            // Track active chat ID for brain watcher output
            activeTelegramChatId = chatId;

            if (!text) return;

            // ── Commands ──

            if (text === '/start') {
                await sendToTelegram(chatId,
                    '🤖 Antigravity Telegram Bridge v2\n\n' +
                    '✅ Connected! Gửi tin nhắn bất kỳ để chat với AI.\n\n' +
                    '📋 Commands:\n' +
                    '/list — Danh sách workspaces\n' +
                    '/switch — Chuyển workspace\n' +
                    '/fetch — Lấy response từ chat (clipboard)\n' +
                    '/new — Tạo conversation mới\n' +
                    '/status — Kiểm tra trạng thái\n' +
                    '/dump — Export VS Code commands'
                );
                return;
            }

            if (text === '/list') {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    await sendToTelegram(chatId, '📁 Không có Workspace nào đang mở.');
                    return;
                }

                let response = '📁 Workspaces đang mở:\n\n';
                const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

                workspaceFolders.forEach((folder, index) => {
                    response += `${index + 1}. ${folder.name}\n   ${folder.uri.fsPath}\n\n`;
                    keyboard.push([{
                        text: `📂 Focus → ${folder.name}`,
                        callback_data: `open_ws_${index}`
                    }]);
                });

                await bot?.sendMessage(chatId, response, {
                    reply_markup: { inline_keyboard: keyboard }
                });
                return;
            }

            if (text === '/fetch') {
                await fetchResponseViaClipboard(chatId);
                return;
            }

            if (text === '/new') {
                try {
                    await vscode.commands.executeCommand('antigravity.startNewConversation');
                    await sendToTelegram(chatId, '🆕 Đã tạo conversation mới!');
                } catch (err: any) {
                    await sendToTelegram(chatId, `❌ Lỗi: ${err.message}`);
                }
                return;
            }

            if (text === '/status') {
                const latestConv = getLatestConversationDir();
                const convId = latestConv ? path.basename(latestConv) : 'N/A';
                const wsName = vscode.workspace.workspaceFolders?.[0]?.name || 'N/A';

                let diagInfo = '';
                try {
                    const diag = await vscode.commands.executeCommand('antigravity.getDiagnostics') as any;
                    if (diag?.systemInfo) {
                        diagInfo = `\n📧 User: ${diag.systemInfo.userName || 'N/A'}`;
                    }
                } catch { }

                await sendToTelegram(chatId,
                    `📊 Trạng thái Bridge v2\n\n` +
                    `🖥️ Workspace: ${wsName}\n` +
                    `💬 Conversation: ${convId.substring(0, 8)}...\n` +
                    `🤖 Brain Watcher: ✅ Active\n` +
                    `📡 IPC Role: ${isMaster ? 'Master' : 'Worker'}` +
                    diagInfo
                );
                return;
            }

            if (text.startsWith('/open ')) {
                const targetPath = text.replace('/open ', '').trim();
                if (!fs.existsSync(targetPath)) {
                    await sendToTelegram(chatId, `❌ Path không tồn tại: ${targetPath}`);
                    return;
                }
                const uri = vscode.Uri.file(targetPath);
                const success = vscode.workspace.updateWorkspaceFolders(
                    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                    0, { uri }
                );
                await sendToTelegram(chatId, success
                    ? `✅ Đã thêm ${targetPath} vào Workspace.`
                    : `❌ Không thể mở folder này.`
                );
                return;
            }

            if (text === '/dump') {
                const cmds = await vscode.commands.getCommands(true);
                const wsFolder = vscode.workspace.workspaceFolders?.[0];
                if (wsFolder) {
                    const dumpPath = path.join(wsFolder.uri.fsPath, 'vscode_commands_dump.json');
                    fs.writeFileSync(dumpPath, JSON.stringify(cmds.sort(), null, 2));
                    await sendToTelegram(chatId, `✅ Dumped ${cmds.length} commands to vscode_commands_dump.json`);
                } else {
                    await sendToTelegram(chatId, '❌ No workspace open.');
                }
                return;
            }

            // ── Regular message → Send to AI ──
            await sendToTelegram(chatId, `📤 _Đã gửi..._`, 'Markdown');

            // Broadcast to workers
            const targetPath = currentWorkerActivePath || undefined;
            broadcastToWorkers('inject_chat', { text, targetPath, chatId });

            // Send to AI
            await handleIncomingMessage(text, chatId, targetPath);
        });

        // ── Callback Query Handler (Inline Keyboards) ──
        bot.on('callback_query', async (query) => {
            const chatId = query.message?.chat.id;
            const data = query.data;
            if (!chatId || !data) return;

            if (userIdConf && query.from.id.toString() !== userIdConf) {
                bot?.answerCallbackQuery(query.id, { text: '⛔ Unauthorized', show_alert: true });
                return;
            }

            if (data.startsWith('open_ws_')) {
                const index = parseInt(data.replace('open_ws_', ''));
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders && workspaceFolders[index]) {
                    const targetFolder = workspaceFolders[index];
                    currentWorkerActivePath = targetFolder.uri.fsPath;
                    broadcastToWorkers('set_active_workspace', { targetPath: currentWorkerActivePath });
                    bot?.answerCallbackQuery(query.id, { text: `Focused → ${targetFolder.name}` });
                    await sendToTelegram(chatId, `🔄 Focus → ${targetFolder.name}`);
                } else {
                    bot?.answerCallbackQuery(query.id, { text: '⚠️ Workspace not found', show_alert: true });
                }
            }
        });

        // ── Error Handling ──
        bot.on('polling_error', (error: any) => {
            if (error.code === 'EFATAL' || error.message?.includes('EFATAL') || error.message?.includes('ECONNRESET')) {
                return; // Ignore network disruptions
            }
            console.error('[TelegramBridge] Polling error:', error.message);
        });

    } catch (err: any) {
        vscode.window.showErrorMessage(`Telegram Bot failed: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE ROUTING
// ═══════════════════════════════════════════════════════════════

export async function handleIncomingMessage(text: string, chatId: number, targetPath?: string) {
    const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Only this window processes if it matches the target (or is master fallback)
    if (targetPath && currentPath !== targetPath) return;
    if (!targetPath && !isMaster) return;

    activeTelegramChatId = chatId;

    // v2: Direct API call
    await sendToAntigravity(text, chatId);
}

function stopBot() {
    if (bot && isStarted) {
        bot.stopPolling().then(() => {
            isStarted = false;
            bot = undefined;
            vscode.window.showInformationMessage('Telegram Bridge stopped.');
        });
    }
}

export function deactivate() {
    stopBot();
    brainWatcher?.close();
}
