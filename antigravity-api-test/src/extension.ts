import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

let output: vscode.OutputChannel;
let brainWatcher: fs.FSWatcher | undefined;
let logWatcher: fs.FSWatcher | undefined;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    output.appendLine(`[${timestamp}] ${msg}`);
}

function getBrainDir(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

function getLatestConversationDir(): string | undefined {
    const brainDir = getBrainDir();
    if (!fs.existsSync(brainDir)) return undefined;

    const convDirs = fs.readdirSync(brainDir)
        .filter(d => {
            try { return fs.statSync(path.join(brainDir, d)).isDirectory(); } catch { return false; }
        })
        .sort((a, b) => {
            try {
                const sa = fs.statSync(path.join(brainDir, a));
                const sb = fs.statSync(path.join(brainDir, b));
                return sb.mtimeMs - sa.mtimeMs;
            } catch { return 0; }
        });

    return convDirs.length > 0 ? path.join(brainDir, convDirs[0]) : undefined;
}

function getWorkspaceStateDbPath(): string | undefined {
    const wsStorageDir = path.join(
        os.homedir(), 'Library', 'Application Support', 'Antigravity',
        'User', 'workspaceStorage'
    );
    if (!fs.existsSync(wsStorageDir)) return undefined;

    // Find workspace storage for current project
    const wsDirs = fs.readdirSync(wsStorageDir);
    const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri.toString();

    for (const wsDir of wsDirs) {
        const wsJson = path.join(wsStorageDir, wsDir, 'workspace.json');
        try {
            if (fs.existsSync(wsJson)) {
                const ws = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
                if (currentFolder && ws.folder === currentFolder) {
                    const dbPath = path.join(wsStorageDir, wsDir, 'state.vscdb');
                    if (fs.existsSync(dbPath)) return dbPath;
                }
            }
        } catch { }
    }
    return undefined;
}

function readSqliteKey(dbPath: string, key: string): string | undefined {
    try {
        const result = execSync(
            `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = '${key}'"`,
            { encoding: 'utf-8', timeout: 5000 }
        );
        return result.trim();
    } catch { return undefined; }
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXTENSION
// ═══════════════════════════════════════════════════════════════

export function activate(context: vscode.ExtensionContext) {
    output = vscode.window.createOutputChannel('Antigravity API Test');
    output.show(true);
    log('🧪 Antigravity API Test Extension v3 — Output Capture Focus');
    log('='.repeat(60));

    // ─────────────────────────────────────────────────────────────
    // BASIC TEST: sendPromptToAgentPanel
    // ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.sendPrompt', async () => {
            log('\n🧪 TEST: antigravity.sendPromptToAgentPanel');
            log('─'.repeat(50));
            const testPrompt = 'Hello! This is a test message from API Test Extension. Please respond with "API TEST OK".';
            try {
                log('  Calling with string argument...');
                const result = await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', testPrompt);
                log(`  ✅ SUCCESS! Return: ${JSON.stringify(result)}, type: ${typeof result}`);
            } catch (err: any) {
                log(`  ❌ FAILED: ${err.message}`);
            }
            log('─'.repeat(50));
        })
    );

    // ─────────────────────────────────────────────────────────────
    // BASIC TEST: Probe ALL
    // ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.probeAll', async () => {
            log('\n🧪 PROBE ALL: Testing Antigravity APIs');
            log('='.repeat(60));

            const commandsToTest = [
                'antigravity.sendPromptToAgentPanel',
                'antigravity.startNewConversation',
                'antigravity.sendChatActionMessage',
                'antigravity.getCascadePluginTemplate',
            ];
            for (const cmd of commandsToTest) {
                try {
                    log(`\n  [PROBE] ${cmd}`);
                    const r = await vscode.commands.executeCommand(cmd);
                    log(`  ✅ Return: ${JSON.stringify(r)?.substring(0, 200)}`);
                } catch (err: any) {
                    log(`  ❌ ${err.message}`);
                }
            }

            // getDiagnostics — detailed
            try {
                log(`\n  [PROBE] antigravity.getDiagnostics`);
                const r = await vscode.commands.executeCommand('antigravity.getDiagnostics');
                const rStr = JSON.stringify(r);
                log(`  ✅ Return (first 500 chars): ${rStr.substring(0, 500)}`);
                log(`  ... (${rStr.length} total chars)`);

                // Parse and show structure
                if (r && typeof r === 'object') {
                    const keys = Object.keys(r as any);
                    log(`  📊 Top-level keys: ${keys.join(', ')}`);
                }
            } catch (err: any) { log(`  ❌ ${err.message}`); }

            log('\n' + '='.repeat(60));
            log('🏁 PROBE ALL COMPLETE');
        })
    );

    // ═════════════════════════════════════════════════════════════
    // STRATEGY 1: Enhanced Brain Artifact Watcher
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.watchBrain', async () => {
            log('\n🔬 STRATEGY 1: Enhanced Brain Artifact Watcher');
            log('─'.repeat(50));

            const brainDir = getBrainDir();
            if (!fs.existsSync(brainDir)) {
                log('  ❌ Brain directory not found');
                return;
            }
            log(`  📁 Brain dir: ${brainDir}`);

            // List 5 most recent conversation directories
            const convDirs = fs.readdirSync(brainDir)
                .filter(d => {
                    try { return fs.statSync(path.join(brainDir, d)).isDirectory(); } catch { return false; }
                })
                .sort((a, b) => {
                    try {
                        return fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs;
                    } catch { return 0; }
                });

            log(`  📂 Found ${convDirs.length} conversation directories`);
            log(`  📂 5 most recent:`);
            convDirs.slice(0, 5).forEach(d => {
                const stat = fs.statSync(path.join(brainDir, d));
                log(`    📂 ${d} (modified: ${stat.mtime.toLocaleString()})`);
                try {
                    const files = fs.readdirSync(path.join(brainDir, d))
                        .filter(f => !f.startsWith('.'));
                    files.forEach(f => {
                        const fStat = fs.statSync(path.join(brainDir, d, f));
                        const icon = fStat.isDirectory() ? '📂' : (f.endsWith('.resolved') ? '🔵' : '📄');
                        log(`       ${icon} ${f} (${fStat.size}B, ${fStat.mtime.toLocaleTimeString()})`);
                    });
                } catch { }
            });

            // Close previous watcher
            if (brainWatcher) {
                brainWatcher.close();
                brainWatcher = undefined;
            }

            // Watch ENTIRE brain directory recursively
            log(`\n  👁️ Starting recursive watcher on: ${brainDir}`);

            // Track file states for debouncing
            const fileStates = new Map<string, { size: number; mtime: number }>();
            let lastChangeTime = 0;
            let changeCount = 0;
            let lastDetectedConv = '';

            try {
                brainWatcher = fs.watch(brainDir, { recursive: true }, (eventType, filename) => {
                    if (!filename) return;
                    const now = Date.now();
                    changeCount++;

                    const fullPath = path.join(brainDir, filename);
                    const parts = filename.split(path.sep);
                    const convId = parts[0] || '';

                    // Track conversation changes
                    if (convId !== lastDetectedConv) {
                        lastDetectedConv = convId;
                        log(`\n  🆕 Activity in conversation: ${convId}`);
                    }

                    try {
                        if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
                            const stat = fs.statSync(fullPath);
                            const prev = fileStates.get(filename);
                            const sizeChange = prev ? stat.size - prev.size : stat.size;

                            // Log the change
                            const changeDir = sizeChange > 0 ? `+${sizeChange}` : `${sizeChange}`;
                            log(`  📝 [${new Date().toLocaleTimeString()}] ${eventType}: ${filename} (${stat.size}B, ${changeDir}B)`);

                            // If it's a .resolved file, show content preview
                            if (filename.endsWith('.resolved') || filename.endsWith('.md')) {
                                if (stat.size < 50000 && stat.size > 0) {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    // Show last 200 chars of content for .resolved files
                                    const preview = content.length > 200
                                        ? '...' + content.substring(content.length - 200)
                                        : content;
                                    log(`  📄 Content tail: ${preview.replace(/\n/g, '↵')}`);
                                }
                            }

                            fileStates.set(filename, { size: stat.size, mtime: stat.mtimeMs });
                        } else {
                            log(`  🗑️ [${new Date().toLocaleTimeString()}] deleted: ${filename}`);
                        }
                    } catch (e: any) {
                        log(`  ⚠️ ${e.message}`);
                    }

                    lastChangeTime = now;
                });

                log('  ✅ Brain watcher started! Send a prompt to see artifact changes.');
                log('  💡 Tip: Use "API Test: Full Round Trip v2" to auto-send + watch.');
            } catch (e: any) {
                log(`  ❌ Watch failed: ${e.message}`);
            }

            vscode.window.showInformationMessage('Brain artifact watcher active!');
        })
    );

    // ═════════════════════════════════════════════════════════════
    // STRATEGY 2: Smart getDiagnostics Polling
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.diagPoll', async () => {
            log('\n🔬 STRATEGY 2: Smart getDiagnostics Polling');
            log('─'.repeat(50));

            // Take baseline snapshot
            log('  📸 Taking BASELINE snapshot...');
            let baseline: any;
            try {
                baseline = await vscode.commands.executeCommand('antigravity.getDiagnostics');
                const baseStr = JSON.stringify(baseline);
                log(`  ✅ Baseline: ${baseStr.length} chars`);

                // Parse structure
                if (baseline && typeof baseline === 'object') {
                    const keys = Object.keys(baseline as any);
                    log(`  📊 Top-level keys: ${keys.join(', ')}`);

                    // Show extensionLogs count
                    const diag = baseline as any;
                    if (diag.extensionLogs && Array.isArray(diag.extensionLogs)) {
                        log(`  📋 extensionLogs: ${diag.extensionLogs.length} entries`);
                        // Show last 3 log entries
                        const lastLogs = diag.extensionLogs.slice(-3);
                        lastLogs.forEach((l: string) => {
                            log(`    📝 ${l.substring(0, 150)}`);
                        });
                    }
                }
            } catch (err: any) {
                log(`  ❌ Cannot get diagnostics: ${err.message}`);
                return;
            }

            // Send a test prompt
            log('\n  📤 Sending test prompt...');
            const uniqueId = Date.now().toString(36);
            const testPrompt = `Reply with ONLY: "DIAG_POLL_${uniqueId}" — nothing else, no extra text.`;
            try {
                await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', testPrompt);
                log(`  ✅ Prompt sent (ID: ${uniqueId})`);
            } catch (err: any) {
                log(`  ❌ Send failed: ${err.message}`);
                return;
            }

            // Poll every 2s for 30s
            log('  ⏳ Polling every 2s for 30s...');
            for (let i = 1; i <= 15; i++) {
                await sleep(2000);

                try {
                    const current = await vscode.commands.executeCommand('antigravity.getDiagnostics') as any;
                    const currentStr = JSON.stringify(current);
                    const baseStr = JSON.stringify(baseline);

                    // Size comparison
                    const sizeDiff = currentStr.length - baseStr.length;
                    log(`  ⏱️ Poll ${i} (${i * 2}s): size=${currentStr.length} (${sizeDiff >= 0 ? '+' : ''}${sizeDiff})`);

                    // Check for unique ID in response
                    if (currentStr.includes(`DIAG_POLL_${uniqueId}`)) {
                        log('  🎉🎉🎉 FOUND OUR TEST RESPONSE IN DIAGNOSTICS!');
                        const idx = currentStr.indexOf(`DIAG_POLL_${uniqueId}`);
                        log(`  📄 Context: ${currentStr.substring(Math.max(0, idx - 200), idx + 200)}`);
                        break;
                    }

                    // Compare extensionLogs
                    if (current.extensionLogs && baseline.extensionLogs) {
                        const newLogs = current.extensionLogs.length - baseline.extensionLogs.length;
                        if (newLogs > 0) {
                            log(`  📋 +${newLogs} new log entries`);
                            const newest = current.extensionLogs.slice(-Math.min(newLogs, 3));
                            newest.forEach((l: string) => {
                                log(`    📝 ${l.substring(0, 200)}`);
                            });
                        }
                    }

                    // Compare any other changed fields
                    if (current && baseline) {
                        for (const key of Object.keys(current)) {
                            const curr = JSON.stringify((current as any)[key]);
                            const base = JSON.stringify((baseline as any)[key]);
                            if (curr !== base && key !== 'extensionLogs') {
                                log(`  🔄 Changed field: "${key}" (${base?.length ?? 0} → ${curr?.length ?? 0})`);
                            }
                        }
                    }
                } catch (err: any) {
                    log(`  ❌ Poll error: ${err.message}`);
                }
            }

            log('  ⏱️ Diagnostics polling complete');
            log('─'.repeat(50));
        })
    );

    // ═════════════════════════════════════════════════════════════
    // STRATEGY 3: SQLite State Watcher
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.watchSqlite', async () => {
            log('\n🔬 STRATEGY 3: SQLite State Change Watcher');
            log('─'.repeat(50));

            // Find workspace state.vscdb
            const dbPath = getWorkspaceStateDbPath();
            const globalDbPath = path.join(
                os.homedir(), 'Library', 'Application Support', 'Antigravity',
                'User', 'globalStorage', 'state.vscdb'
            );

            log(`  📁 Workspace DB: ${dbPath || 'NOT FOUND'}`);
            log(`  📁 Global DB: ${fs.existsSync(globalDbPath) ? globalDbPath : 'NOT FOUND'}`);

            // Read current chat session index
            const chatKeys = [
                'chat.ChatSessionStore.index',
                'antigravity.agentViewContainerId.state',
                'antigravity.agentViewContainerId.numberOfVisibleViews',
            ];

            log('\n  📊 Current state (workspace DB):');
            for (const key of chatKeys) {
                if (dbPath) {
                    const value = readSqliteKey(dbPath, key);
                    if (value) {
                        log(`  🔑 ${key}: ${value.substring(0, 300)}`);
                    }
                }
            }

            log('\n  📊 Current state (global DB):');
            for (const key of chatKeys) {
                const value = readSqliteKey(globalDbPath, key);
                if (value) {
                    log(`  🔑 ${key}: ${value.substring(0, 300)}`);
                }
            }

            // List ALL keys containing interesting terms
            log('\n  🔍 Scanning ALL keys in workspace DB...');
            if (dbPath) {
                try {
                    const result = execSync(
                        `sqlite3 "${dbPath}" "SELECT key, length(value) as len FROM ItemTable ORDER BY key"`,
                        { encoding: 'utf-8', timeout: 5000 }
                    );
                    result.split('\n').filter(l => l).forEach(line => {
                        log(`    ${line}`);
                    });
                } catch (e: any) { log(`  ⚠️ ${e.message}`); }
            }

            // Now watch the DB files for changes
            log('\n  👁️ Starting file watchers on state.vscdb files...');

            const watchTargets: string[] = [];
            if (dbPath) watchTargets.push(dbPath);
            if (fs.existsSync(globalDbPath)) watchTargets.push(globalDbPath);

            const dbWatchers: fs.FSWatcher[] = [];
            for (const target of watchTargets) {
                try {
                    const label = target.includes('globalStorage') ? 'GLOBAL' : 'WORKSPACE';
                    const baselineSize = fs.statSync(target).size;

                    const watcher = fs.watch(target, (eventType) => {
                        const now = new Date().toLocaleTimeString();
                        const newSize = fs.statSync(target).size;
                        const sizeDiff = newSize - baselineSize;
                        log(`  📝 [${now}] [${label}] ${eventType} — size: ${newSize}B (${sizeDiff >= 0 ? '+' : ''}${sizeDiff}B)`);

                        // Re-read the chat session index
                        for (const key of chatKeys) {
                            const value = readSqliteKey(target, key);
                            if (value && value !== '{"version":1,"entries":{}}') {
                                log(`  🎉 [${label}] ${key} HAS DATA: ${value.substring(0, 500)}`);
                            }
                        }
                    });
                    dbWatchers.push(watcher);
                    log(`  ✅ Watching [${label}]: ${target}`);
                } catch (e: any) {
                    log(`  ❌ Watch failed: ${e.message}`);
                }
            }

            context.subscriptions.push({
                dispose: () => dbWatchers.forEach(w => w.close())
            });

            log('\n  💡 Watchers active. Send a prompt to see if DB changes.');
            vscode.window.showInformationMessage('SQLite watchers active!');
        })
    );

    // ═════════════════════════════════════════════════════════════
    // STRATEGY 4: Combined Round-Trip v2 (Send + Watch Everything)
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.roundTripV2', async () => {
            log('\n🔬 STRATEGY 4: Combined Round-Trip v2');
            log('='.repeat(60));

            const uniqueId = Date.now().toString(36);
            const testPrompt = `Reply with EXACTLY this text: "ROUNDTRIP_${uniqueId}" and nothing else.`;

            log(`  🆔 Unique ID: ${uniqueId}`);
            log(`  📤 Prompt: "${testPrompt}"`);

            // ── Setup watchers ──
            const timeline: string[] = [];
            const tStart = Date.now();
            const addEvent = (msg: string) => {
                const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
                const entry = `[+${elapsed}s] ${msg}`;
                timeline.push(entry);
                log(`  ⏱️ ${entry}`);
            };

            // 1. Brain dir watcher
            const brainDir = getBrainDir();
            let rtBrainWatcher: fs.FSWatcher | undefined;
            let lastBrainChange = 0;
            const brainChanges: string[] = [];

            if (fs.existsSync(brainDir)) {
                try {
                    rtBrainWatcher = fs.watch(brainDir, { recursive: true }, (eventType, filename) => {
                        if (!filename) return;
                        lastBrainChange = Date.now();
                        brainChanges.push(filename);
                        addEvent(`📁 Brain: ${eventType} → ${filename}`);

                        // Read .resolved content
                        const fullPath = path.join(brainDir, filename);
                        try {
                            if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
                                const stat = fs.statSync(fullPath);
                                if (stat.size < 50000 && stat.size > 0) {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    if (content.includes(`ROUNDTRIP_${uniqueId}`)) {
                                        addEvent(`🎉🎉🎉 FOUND RESPONSE IN: ${filename}`);
                                        const idx = content.indexOf(`ROUNDTRIP_${uniqueId}`);
                                        addEvent(`📄 Context: ${content.substring(Math.max(0, idx - 100), idx + 100)}`);
                                    }
                                    // Show size changes
                                    addEvent(`📄 ${filename}: ${stat.size}B`);
                                }
                            }
                        } catch { }
                    });
                    addEvent('✅ Brain watcher started');
                } catch { }
            }

            // 2. Diagnostics baseline
            let diagBaseline: string = '';
            try {
                const r = await vscode.commands.executeCommand('antigravity.getDiagnostics');
                diagBaseline = JSON.stringify(r);
                addEvent(`📊 Diagnostics baseline: ${diagBaseline.length} chars`);
            } catch { }

            // ── Send the prompt ──
            addEvent('📤 Sending prompt...');
            try {
                await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', testPrompt);
                addEvent('✅ Prompt sent!');
            } catch (err: any) {
                addEvent(`❌ Send failed: ${err.message}`);
            }

            // ── Monitor for 40s ──
            log('  ⏳ Monitoring for 40s...');
            let foundResponse = false;

            for (let i = 1; i <= 20; i++) {
                await sleep(2000);

                // Poll diagnostics
                try {
                    const r = await vscode.commands.executeCommand('antigravity.getDiagnostics');
                    const diagNow = JSON.stringify(r);
                    const sizeDiff = diagNow.length - diagBaseline.length;

                    if (sizeDiff !== 0) {
                        addEvent(`📊 Diagnostics size: ${sizeDiff >= 0 ? '+' : ''}${sizeDiff}`);
                    }

                    if (diagNow.includes(`ROUNDTRIP_${uniqueId}`)) {
                        addEvent('🎉 FOUND IN DIAGNOSTICS!');
                        foundResponse = true;
                    }
                } catch { }

                // Check latest brain dir files
                const latestConv = getLatestConversationDir();
                if (latestConv) {
                    try {
                        const files = fs.readdirSync(latestConv);
                        for (const f of files) {
                            const fp = path.join(latestConv, f);
                            try {
                                const stat = fs.statSync(fp);
                                if (!stat.isDirectory() && stat.size < 50000 && stat.size > 0) {
                                    const content = fs.readFileSync(fp, 'utf-8');
                                    if (content.includes(`ROUNDTRIP_${uniqueId}`)) {
                                        addEvent(`🎉 FOUND IN BRAIN FILE: ${f}`);
                                        foundResponse = true;
                                    }
                                }
                            } catch { }
                        }
                    } catch { }
                }

                if (foundResponse) break;

                // Early exit if brain stopped changing for 10s after activity
                if (brainChanges.length > 0 && (Date.now() - lastBrainChange) > 10000) {
                    addEvent('⏹️ Brain activity settled (10s idle)');
                    break;
                }
            }

            // ── Summary ──
            log('\n' + '='.repeat(60));
            log('📊 ROUND-TRIP SUMMARY');
            log('─'.repeat(40));
            log(`  Total brain file changes: ${brainChanges.length}`);
            log(`  Response found: ${foundResponse ? '✅ YES' : '❌ NO'}`);
            log(`  Total duration: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

            if (brainChanges.length > 0) {
                log('\n  📁 Brain files that changed:');
                const uniqueFiles = [...new Set(brainChanges)];
                uniqueFiles.forEach(f => log(`    📄 ${f}`));
            }

            log('\n  📜 Full Timeline:');
            timeline.forEach(t => log(`    ${t}`));

            // Cleanup
            rtBrainWatcher?.close();

            log('\n' + '='.repeat(60));
            log('🏁 ROUND-TRIP v2 COMPLETE');
            vscode.window.showInformationMessage('Round-trip v2 complete! Check output.');
        })
    );

    // ═════════════════════════════════════════════════════════════
    // LEGACY: Watch Runtime Logs
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.watchLogs', async () => {
            log('\n🔬 LEGACY: Watch Antigravity Runtime Logs');
            log('─'.repeat(50));

            const logsDir = path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'logs');
            if (!fs.existsSync(logsDir)) {
                log('  ❌ Logs directory not found');
                return;
            }

            // Find latest session
            const sessions = fs.readdirSync(logsDir)
                .filter(d => {
                    try { return fs.statSync(path.join(logsDir, d)).isDirectory(); } catch { return false; }
                })
                .sort().reverse();

            const latestSession = sessions[0];
            const sessionDir = path.join(logsDir, latestSession);
            log(`  📁 Latest session: ${latestSession}`);

            // List important log files
            const importantLogs = ['cloudcode.log', 'main.log', 'renderer.log'];
            const listFiles = (dir: string, prefix = '') => {
                fs.readdirSync(dir).forEach(f => {
                    const fp = path.join(dir, f);
                    const stat = fs.statSync(fp);
                    if (stat.isDirectory()) {
                        log(`  ${prefix}📂 ${f}/`);
                        listFiles(fp, prefix + '  ');
                    } else {
                        const highlight = importantLogs.includes(f) ? '⭐' : '  ';
                        log(`  ${prefix}${highlight}📄 ${f} (${stat.size}B)`);
                    }
                });
            };
            listFiles(sessionDir);

            // Watch the session directory
            if (logWatcher) logWatcher.close();

            try {
                logWatcher = fs.watch(sessionDir, { recursive: true }, (eventType, filename) => {
                    if (!filename) return;
                    const now = new Date().toLocaleTimeString();
                    log(`  📝 [${now}] Log: ${eventType} → ${filename}`);

                    // Read last 5 lines of changed log file
                    const filePath = path.join(sessionDir, filename);
                    try {
                        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
                            const stat = fs.statSync(filePath);
                            if (stat.size > 0 && stat.size < 1000000) {
                                const content = fs.readFileSync(filePath, 'utf-8');
                                const lastLines = content.split('\n').slice(-5).join('\n');
                                log(`  📄 Last 5 lines:\n${lastLines}`);
                            }
                        }
                    } catch { }
                });
                log('\n  ✅ Log watcher started!');
            } catch (e: any) {
                log(`  ❌ Watch failed: ${e.message}`);
            }

            vscode.window.showInformationMessage('Log watcher active!');
        })
    );

    // ═════════════════════════════════════════════════════════════
    // BONUS: Document/Terminal/Editor Change Listeners
    // ═════════════════════════════════════════════════════════════
    context.subscriptions.push(
        vscode.commands.registerCommand('apiTest.monitorOutputs', async () => {
            log('\n🔬 BONUS: Monitor VS Code Events');
            log('─'.repeat(50));

            // Listen for text document changes
            log('  Setting up listeners...');
            const docDisp = vscode.workspace.onDidChangeTextDocument(event => {
                const uri = event.document.uri;
                if (uri.fsPath.includes('.gemini') || uri.fsPath.includes('antigravity') || uri.fsPath.includes('brain')) {
                    log(`  📝 Doc changed: ${uri.fsPath} (${event.contentChanges.length} changes)`);
                    event.contentChanges.forEach(change => {
                        if (change.text.length > 0 && change.text.length < 500) {
                            log(`    + ${change.text.substring(0, 200)}`);
                        }
                    });
                }
            });
            context.subscriptions.push(docDisp);

            const createDisp = vscode.workspace.onDidCreateFiles(event => {
                event.files.forEach(file => {
                    log(`  🆕 File created: ${file.fsPath}`);
                });
            });
            context.subscriptions.push(createDisp);

            const saveDisp = vscode.workspace.onDidSaveTextDocument(doc => {
                log(`  💾 File saved: ${doc.uri.fsPath}`);
            });
            context.subscriptions.push(saveDisp);

            const editorDisp = vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    log(`  👁️ Active editor: ${editor.document.uri.fsPath}`);
                }
            });
            context.subscriptions.push(editorDisp);

            log('  ✅ All event listeners active!');
            vscode.window.showInformationMessage('Event monitor active!');
        })
    );

    // ─────────────────────────────────────────────────────────────
    // Print available commands
    // ─────────────────────────────────────────────────────────────
    log('\n📋 Available commands (Cmd+Shift+P):');
    log('  OUTPUT CAPTURE STRATEGIES:');
    log('  ▸ "API Test: Brain Artifact Watcher" — Watch brain/ for real-time artifact changes');
    log('  ▸ "API Test: Smart Diagnostics Poll" — Poll getDiagnostics after sending prompt');
    log('  ▸ "API Test: SQLite State Watcher" — Watch state.vscdb for chat data changes');
    log('  ▸ "API Test: Round Trip v2" — Send prompt + watch everything simultaneously');
    log('');
    log('  LEGACY / BASIC:');
    log('  ▸ "API Test: sendPromptToAgentPanel" — Basic prompt send test');
    log('  ▸ "API Test: Probe ALL" — Test all known Antigravity commands');
    log('  ▸ "API Test: Watch Runtime Logs" — Watch Antigravity runtime log files');
    log('  ▸ "API Test: Monitor VS Code Events" — Document/file/editor listeners');
    log('');
    log('  💡 Recommended: Brain Watcher → Round Trip v2');
}

export function deactivate() {
    brainWatcher?.close();
    logWatcher?.close();
}
