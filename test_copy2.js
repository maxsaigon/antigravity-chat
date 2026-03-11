const { exec } = require('child_process');

console.log("Raising Antigravity and copying...");
const script = `
    tell application "System Events"
        set appNames to {"Electron", "Antigravity", "Code"}
        repeat with appName in appNames
            try
                if exists process appName then
                    tell process appName
                        set targetWindow to first window whose title contains "antigravity-chat"
                        set frontmost to true
                        perform action "AXRaise" of targetWindow
                        delay 0.5
                        -- Select All
                        keystroke "a" using command down
                        delay 0.2
                        -- Copy
                        keystroke "c" using command down
                        delay 0.2
                        -- Deselect
                        key code 124
                        return true
                    end tell
                end if
            end try
        end repeat
    end tell
`;

exec(`osascript -e '${script}'`, (err) => {
    if (err) console.error(err);

    // Read clipboard
    exec('pbpaste', (err, stdout) => {
        console.log("--- CLIPBOARD CONTENT ---");
        console.log(stdout.substring(Math.max(0, stdout.length - 1500)));
        console.log("-------------------------");
    });
});
