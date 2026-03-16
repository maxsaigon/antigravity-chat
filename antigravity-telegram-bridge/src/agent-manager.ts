import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════
// AGENT MANAGER CONTROLLER
// Control Antigravity's Agent Manager via VS Code commands
// v0.5.5: Simplified — only ✅ confirmed working commands
// ═══════════════════════════════════════════════════════════════

/**
 * Agent Manager commands — ONLY confirmed working (✅) commands.
 * All ❌ (not found) commands have been removed from production code.
 * See plan_05.md for full probe results.
 */
export const AGENT_COMMANDS = {
    // ── Accept / Reject ──
    chatAcceptAllFiles: 'chatEditing.acceptAllFiles',                       // ✅ primary
    chatDiscardAllFiles: 'chatEditing.discardAllFiles',                     // ✅ primary
    acceptAllInFile: 'antigravity.prioritized.agentAcceptAllInFile',        // ✅ backup
    rejectAllInFile: 'antigravity.prioritized.agentRejectAllInFile',        // ✅ backup

    // ── Per-file (for future /ok <file>) ──
    chatAcceptFile: 'chatEditing.acceptFile',                               // ✅
    chatDiscardFile: 'chatEditing.discardFile',                             // ✅

    // ── Stop / Cancel ──
    closeAllDiffZones: 'antigravity.closeAllDiffZones',                     // ✅

    // ── Diagnostics & Trace ──
    getManagerTrace: 'antigravity.getManagerTrace',                         // ✅
    getDiagnostics: 'antigravity.getDiagnostics',                           // ✅

    // ── Conversation ──
    startNewConversation: 'antigravity.startNewConversation',               // ✅
    continueConversation: 'workbench.action.focusAgentManager.continueConversation', // ✅

    // ── UI ──
    openReviewChanges: 'antigravity.openReviewChanges',                     // ✅
    agentPanelOpen: 'antigravity.agentPanel.open',
    agentPanelFocus: 'antigravity.agentPanel.focus',

    // ── Manager ──
    managerClearErrors: 'antigravityAgentManager.clearErrors',              // ✅
    managerReportStatus: 'antigravityAgentManager.reportStatus',            // ✅
} as const;

export interface ProbeResult {
    command: string;
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
}

export interface ConversationInfo {
    id: string;
    title: string;       // Human-readable title extracted from task.md or metadata
    lastModified: Date;
    hasTaskMd: boolean;
    hasTelegramResponse: boolean;
    artifactCount: number;
}

/**
 * AgentManagerController — wraps all Agent Manager interactions.
 * Uses cascading fallback strategy: try the most standard API first,
 * fall back to prioritized, then to internal commands.
 */
export class AgentManagerController {

    // ── API Probing ──

    async probeCommand(commandId: string, ...args: any[]): Promise<ProbeResult> {
        const start = Date.now();
        try {
            const result = await vscode.commands.executeCommand(commandId, ...args);
            return {
                command: commandId,
                success: true,
                result: result !== undefined ? this.safeStringify(result) : '(void)',
                duration: Date.now() - start,
            };
        } catch (err: any) {
            return {
                command: commandId,
                success: false,
                error: err.message || String(err),
                duration: Date.now() - start,
            };
        }
    }

    async probeAll(commands: string[]): Promise<ProbeResult[]> {
        const results: ProbeResult[] = [];
        for (const cmd of commands) {
            results.push(await this.probeCommand(cmd));
            await new Promise(r => setTimeout(r, 200));
        }
        return results;
    }

    formatProbeResults(results: ProbeResult[]): string {
        const lines: string[] = ['🔬 API Probe Results:\n'];
        for (const r of results) {
            const icon = r.success ? '✅' : '❌';
            // Shorten command names for readability
            const shortCmd = r.command
                .replace('antigravity.prioritized.', 'ag.p.')
                .replace('antigravity.', 'ag.')
                .replace('antigravityAgentManager.', 'agMgr.')
                .replace('chatEditing.', 'chatEdit.')
                .replace('conversationPicker.', 'convPicker.')
                .replace('workbench.action.', 'wb.');
            lines.push(`${icon} ${shortCmd} (${r.duration}ms)`);
            if (r.success && r.result !== '(void)') {
                const preview = String(r.result).substring(0, 200);
                lines.push(`   → ${preview}`);
            }
            if (!r.success) {
                lines.push(`   → ${r.error?.substring(0, 150)}`);
            }
        }
        return lines.join('\n');
    }

    // ── Accept (/ok) ──

    /**
     * Accept code changes. Fires BOTH strategies because void commands
     * always return "success" — we can't know which system has pending changes.
     * Order: Antigravity-native first, then chatEditing as backup.
     */
    async acceptChanges(): Promise<ProbeResult> {
        const results: ProbeResult[] = [];

        // Strategy 1: Antigravity-native (handles diff zones)
        const r1 = await this.probeCommand(AGENT_COMMANDS.acceptAllInFile);
        results.push(r1);

        // Strategy 2: VS Code chatEditing (handles standard chat edits)
        const r2 = await this.probeCommand(AGENT_COMMANDS.chatAcceptAllFiles);
        results.push(r2);

        const anySuccess = results.some(r => r.success);
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

        if (anySuccess) {
            const which = results.filter(r => r.success).map(r =>
                r.command.includes('prioritized') ? 'ag' : 'chatEdit'
            ).join('+');
            return { command: `accepted (${which})`, success: true, duration: totalDuration };
        }

        return {
            command: 'accept',
            success: false,
            error: 'No pending changes to accept.',
            duration: totalDuration,
        };
    }

    // ── Reject (/no) ──

    /**
     * Reject code changes. Same dual-fire strategy as accept.
     */
    async rejectChanges(): Promise<ProbeResult> {
        const results: ProbeResult[] = [];

        // Strategy 1: Antigravity-native
        const r1 = await this.probeCommand(AGENT_COMMANDS.rejectAllInFile);
        results.push(r1);

        // Strategy 2: VS Code chatEditing
        const r2 = await this.probeCommand(AGENT_COMMANDS.chatDiscardAllFiles);
        results.push(r2);

        const anySuccess = results.some(r => r.success);
        const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

        if (anySuccess) {
            const which = results.filter(r => r.success).map(r =>
                r.command.includes('prioritized') ? 'ag' : 'chatEdit'
            ).join('+');
            return { command: `rejected (${which})`, success: true, duration: totalDuration };
        }

        return {
            command: 'reject',
            success: false,
            error: 'No pending changes to reject.',
            duration: totalDuration,
        };
    }

    // ── Stop (/stop) ──

    /**
     * Cancel current task by closing all diff zones.
     * Only confirmed working strategy: closeAllDiffZones ✅
     */
    async cancelCurrentTask(): Promise<ProbeResult> {
        const r1 = await this.probeCommand(AGENT_COMMANDS.closeAllDiffZones);
        if (r1.success) return { ...r1, command: 'stopped (closeAllDiffZones)' };

        return {
            command: 'stop',
            success: false,
            error: 'Cannot stop. Use /new to start fresh.',
            duration: r1.duration,
        };
    }

    // ── Enhanced Status (/status) ──

    /**
     * Get combined status: trace + diagnostics in one call.
     * Used by the enhanced /status command.
     */
    async getEnhancedStatus(): Promise<{ trace: ProbeResult; diagnostics: ProbeResult }> {
        const [trace, diagnostics] = await Promise.all([
            this.probeCommand(AGENT_COMMANDS.getManagerTrace),
            this.probeCommand(AGENT_COMMANDS.getDiagnostics),
        ]);
        return { trace, diagnostics };
    }

    async getManagerTrace(): Promise<ProbeResult> {
        return this.probeCommand(AGENT_COMMANDS.getManagerTrace);
    }

    async getDiagnostics(): Promise<ProbeResult> {
        return this.probeCommand(AGENT_COMMANDS.getDiagnostics);
    }

    // ── Conversation Management ──

    /**
     * Extract a human-readable title for a conversation directory.
     * Priority:
     *   1. task.md first line (usually "# Title")
     *   2. First .metadata.json summary field
     *   3. First .md filename (without extension)
     *   4. Fallback to short ID
     */
    private extractConversationTitle(dirPath: string, convId: string): string {
        try {
            // Strategy 1: Read first line of task.md
            const taskMdPath = path.join(dirPath, 'task.md');
            if (fs.existsSync(taskMdPath)) {
                const content = fs.readFileSync(taskMdPath, 'utf-8');
                const firstLine = content.split('\n').find(line => line.trim().length > 0);
                if (firstLine) {
                    // Strip markdown heading prefix "# " and trim
                    const title = firstLine.replace(/^#+\s*/, '').trim();
                    if (title.length > 0) {
                        return title.length > 40 ? title.substring(0, 37) + '...' : title;
                    }
                }
            }

            // Strategy 2: Read summary from any .metadata.json
            const files = fs.readdirSync(dirPath);
            const metaFile = files.find(f => f.endsWith('.metadata.json'));
            if (metaFile) {
                const metaContent = fs.readFileSync(path.join(dirPath, metaFile), 'utf-8');
                const meta = JSON.parse(metaContent);
                if (meta.summary && typeof meta.summary === 'string') {
                    const summary = meta.summary.trim();
                    if (summary.length > 0) {
                        return summary.length > 40 ? summary.substring(0, 37) + '...' : summary;
                    }
                }
            }

            // Strategy 3: Use first .md filename as title
            const mdFile = files.find(f => f.endsWith('.md') && !f.endsWith('.metadata.json') && f !== 'task.md' && f !== 'telegram_response.md');
            if (mdFile) {
                const name = mdFile.replace('.md', '').replace(/_/g, ' ');
                return name.length > 40 ? name.substring(0, 37) + '...' : name;
            }
        } catch { }

        // Fallback: short ID
        return convId.substring(0, 8) + '...';
    }

    listConversations(limit: number = 10): ConversationInfo[] {
        const brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
        if (!fs.existsSync(brainDir)) return [];

        try {
            const dirs = fs.readdirSync(brainDir)
                .filter(d => {
                    try {
                        const stat = fs.statSync(path.join(brainDir, d));
                        return stat.isDirectory() && d !== 'tempmediaStorage';
                    } catch { return false; }
                })
                .sort((a, b) => {
                    try {
                        return fs.statSync(path.join(brainDir, b)).mtimeMs -
                            fs.statSync(path.join(brainDir, a)).mtimeMs;
                    } catch { return 0; }
                })
                .slice(0, limit);

            return dirs.map(d => {
                const dirPath = path.join(brainDir, d);
                const stat = fs.statSync(dirPath);
                const files = fs.readdirSync(dirPath);
                return {
                    id: d,
                    title: this.extractConversationTitle(dirPath, d),
                    lastModified: stat.mtime,
                    hasTaskMd: files.includes('task.md'),
                    hasTelegramResponse: files.includes('telegram_response.md'),
                    artifactCount: files.filter(f => f.endsWith('.md') && !f.endsWith('.metadata.json')).length,
                };
            });
        } catch { return []; }
    }

    /**
     * Switch to a conversation. Uses only confirmed ✅ working command.
     */
    async switchConversation(conversationId: string): Promise<ProbeResult> {
        const result = await this.probeCommand(AGENT_COMMANDS.continueConversation, conversationId);
        if (result.success) {
            return { ...result, command: `switched to ${conversationId.substring(0, 8)}...` };
        }
        return {
            command: 'switch',
            success: false,
            error: 'Could not switch conversation.',
            duration: result.duration,
        };
    }

    async openReviewChanges(): Promise<ProbeResult> {
        return this.probeCommand(AGENT_COMMANDS.openReviewChanges);
    }

    // ── Probe Groups (dev only, for /probe command) ──

    getProbeGroups(): Record<string, string[]> {
        return {
            'accept_reject': [
                AGENT_COMMANDS.chatAcceptAllFiles,
                AGENT_COMMANDS.chatDiscardAllFiles,
                AGENT_COMMANDS.chatAcceptFile,
                AGENT_COMMANDS.chatDiscardFile,
                AGENT_COMMANDS.acceptAllInFile,
                AGENT_COMMANDS.rejectAllInFile,
            ],
            'conversation': [
                AGENT_COMMANDS.continueConversation,
                AGENT_COMMANDS.startNewConversation,
            ],
            'diff': [
                AGENT_COMMANDS.closeAllDiffZones,
                AGENT_COMMANDS.openReviewChanges,
            ],
            'manager': [
                AGENT_COMMANDS.getManagerTrace,
                AGENT_COMMANDS.getDiagnostics,
                AGENT_COMMANDS.managerReportStatus,
                AGENT_COMMANDS.managerClearErrors,
            ],
        };
    }

    // ── Utilities ──

    private safeStringify(value: any): string {
        try {
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }
}
