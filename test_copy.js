const os = require('os');
const { exec } = require('child_process');

console.log("Waiting 3s. FOCUS THE ANTIGRAVITY CHAT WINDOW MANUALLY NOW.");
setTimeout(() => {
    const script = `
        tell application "System Events"
            -- keystroke A to select all
            keystroke "a" using command down
            delay 0.2
            -- keystroke C to copy
            keystroke "c" using command down
            delay 0.2
            -- Deselect (press right arrow)
            key code 124
        end tell
    `;

    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error(err);

        // Read clipboard
        import('clipboardy').then(clipboardy => {
            const text = clipboardy.default.readSync();
            console.log("--- CLIPBOARD CONTENT ---");
            console.log(text.substring(Math.max(0, text.length - 1500))); // Print last 1500 chars
            console.log("-------------------------");
        }).catch(err => {
            // fallback generic mac pbpaste
            exec('pbpaste', (err, stdout) => {
                console.log("--- CLIPBOARD CONTENT (pbpaste) ---");
                console.log(stdout.substring(Math.max(0, stdout.length - 1500)));
                console.log("-------------------------");
            });
        });
    });
}, 3000);
